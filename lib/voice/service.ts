import { findRecognitionConstructor, Listener, type ListenerStatus } from "./listener";
import { SENSITIVITY_PROFILES, type MicSensitivity } from "./sensitivity";
import { Speaker, type SpeakOptions, type SpeechProblem } from "./speaker";

export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
}

export interface Heard {
  text: string;
  isFinal: boolean;
  /** Confiance du micro (0 à 1) ; null s'il ne l'indique pas. */
  confidence: number | null;
  /** Écarté parce que le micro n'était pas assez sûr de lui (sensibilité réduite). */
  rejected: boolean;
}

/** Ce que l'interface a besoin de savoir sur la voix (immuable : un nouvel objet à chaque changement). */
export interface VoiceSnapshot {
  ttsSupported: boolean;
  speaking: boolean;
  /** Le navigateur refuse de parler tant que l'utilisateur n'a pas touché l'écran. */
  speechBlocked: boolean;
  /** La voix n'a pas pu parler (aucune voix française, voix en ligne sans Internet…) ; effacé dès qu'une phrase est dite. */
  speechProblem: SpeechProblem | null;
  micStatus: ListenerStatus;
  voices: VoiceInfo[];
  /** Dernier texte entendu par le micro (effacé après quelques secondes). */
  heard: Heard | null;
}

const SERVER_SNAPSHOT: VoiceSnapshot = {
  ttsSupported: false,
  speaking: false,
  speechBlocked: false,
  speechProblem: null,
  micStatus: "off",
  voices: [],
  heard: null,
};

const HEARD_VISIBLE_MS = 7000;

/** Parole + écoute, partagées par toute l'appli (il n'y a qu'un micro et qu'un haut-parleur). */
class VoiceService {
  private readonly speaker: Speaker;
  private readonly listener: Listener;
  private readonly subscribers = new Set<() => void>();
  private snapshot: VoiceSnapshot;
  private voicesSource: unknown = null;
  private voices: VoiceInfo[] = [];
  private heard: Heard | null = null;
  private heardTimer: ReturnType<typeof setTimeout> | null = null;
  private micWanted = false;
  private candidatesHandler: ((candidates: string[]) => void) | null = null;

  constructor() {
    const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    this.speaker = new Speaker(synth);
    this.listener = new Listener(findRecognitionConstructor(), {
      onHeard: (text, isFinal, confidence) => this.setHeard({ text, isFinal, confidence, rejected: false }),
      onCandidates: (candidates) => this.candidatesHandler?.(candidates),
      onRejected: (text, confidence) => this.setHeard({ text, isFinal: true, confidence, rejected: true }),
    });
    this.snapshot = this.build();
    // L'écoute se coupe pendant que l'appli parle, pour ne pas s'écouter elle-même.
    this.speaker.subscribe(() => {
      this.listener.setSuspended(this.speaker.speaking);
      this.refresh();
    });
    this.listener.subscribe(() => this.refresh());
    document.addEventListener("visibilitychange", () => this.applyMic());
  }

  private build(): VoiceSnapshot {
    if (this.voicesSource !== this.speaker.frenchVoices) {
      this.voicesSource = this.speaker.frenchVoices;
      this.voices = this.speaker.frenchVoices.map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }));
    }
    return {
      ttsSupported: this.speaker.supported,
      speaking: this.speaker.speaking,
      speechBlocked: this.speaker.blocked,
      speechProblem: this.speaker.problem,
      micStatus: this.listener.status,
      voices: this.voices,
      heard: this.heard,
    };
  }

  private refresh(): void {
    const next = this.build();
    const prev = this.snapshot;
    const same =
      prev.ttsSupported === next.ttsSupported &&
      prev.speaking === next.speaking &&
      prev.speechBlocked === next.speechBlocked &&
      prev.speechProblem === next.speechProblem &&
      prev.micStatus === next.micStatus &&
      prev.voices === next.voices &&
      prev.heard === next.heard;
    if (same) return;
    this.snapshot = next;
    this.subscribers.forEach((callback) => callback());
  }

  private setHeard(heard: Heard): void {
    this.heard = heard;
    if (this.heardTimer !== null) clearTimeout(this.heardTimer);
    this.heardTimer = setTimeout(() => {
      this.heard = null;
      this.heardTimer = null;
      this.refresh();
    }, HEARD_VISIBLE_MS);
    this.refresh();
  }

  private applyMic(): void {
    this.listener.setWanted(this.micWanted && !document.hidden);
  }

  getSnapshot = (): VoiceSnapshot => this.snapshot;

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  speak(text: string, options: SpeakOptions): void {
    this.speaker.speak(text, options);
  }

  cancelSpeech(): void {
    this.speaker.cancel();
  }

  /** À appeler depuis un clic : certains navigateurs n'autorisent la voix qu'après un geste. */
  unlock(): void {
    this.speaker.unlock();
  }

  /** Souhait d'écoute (l'écran de préparation est ouvert et le micro est activé dans les réglages). */
  setMicWanted(wanted: boolean): void {
    this.micWanted = wanted;
    this.applyMic();
  }

  setCandidatesHandler(handler: ((candidates: string[]) => void) | null): void {
    this.candidatesHandler = handler;
  }

  setSensitivity(level: MicSensitivity): void {
    this.listener.setSensitivity(SENSITIVITY_PROFILES[level]);
  }

  retryMic(): void {
    this.listener.retry();
  }
}

let instance: VoiceService | null = null;

function service(): VoiceService | null {
  if (typeof window === "undefined") return null;
  instance ??= new VoiceService();
  return instance;
}

/**
 * Accès à la voix. Côté serveur (ou avant l'affichage dans le navigateur) il ne fait rien ;
 * le vrai service n'est créé qu'au premier usage dans le navigateur.
 */
export const voice = {
  subscribe: (callback: () => void): (() => void) => service()?.subscribe(callback) ?? (() => {}),
  getSnapshot: (): VoiceSnapshot => service()?.getSnapshot() ?? SERVER_SNAPSHOT,
  getServerSnapshot: (): VoiceSnapshot => SERVER_SNAPSHOT,
  speak: (text: string, options: SpeakOptions) => service()?.speak(text, options),
  cancelSpeech: () => service()?.cancelSpeech(),
  unlock: () => service()?.unlock(),
  setMicWanted: (wanted: boolean) => service()?.setMicWanted(wanted),
  setCandidatesHandler: (handler: ((candidates: string[]) => void) | null) => service()?.setCandidatesHandler(handler),
  setSensitivity: (level: MicSensitivity) => service()?.setSensitivity(level),
  retryMic: () => service()?.retryMic(),
};
