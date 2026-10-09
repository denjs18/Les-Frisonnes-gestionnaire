export interface SpeakOptions {
  /** Vitesse de la voix (1 = normale). */
  rate: number;
  /** Voix choisie ; null = voix française par défaut du navigateur. */
  voiceURI: string | null;
}

function isFrench(voice: SpeechSynthesisVoice): boolean {
  return voice.lang.replace("_", "-").toLowerCase().startsWith("fr");
}

/** Durée maximale raisonnable d'une phrase : au-delà, on considère qu'elle est finie même sans événement de fin. */
function safetyDelay(text: string, rate: number): number {
  return Math.max(4000, Math.round((text.length * 110) / Math.max(rate, 0.5)) + 2500);
}

/**
 * Lecture à voix haute (speechSynthesis, français). Une seule phrase à la fois :
 * une nouvelle phrase coupe la précédente.
 */
export class Speaker {
  private seq = 0;
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private safetyTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking = false;
  private isBlocked = false;
  private voices: SpeechSynthesisVoice[] = [];
  private readonly subscribers = new Set<() => void>();

  constructor(
    private readonly synth: SpeechSynthesis | null,
    private readonly makeUtterance: (text: string) => SpeechSynthesisUtterance = (text) => new SpeechSynthesisUtterance(text),
  ) {
    if (synth) {
      this.refreshVoices();
      // Les voix arrivent parfois après coup (Chrome).
      synth.addEventListener?.("voiceschanged", () => this.refreshVoices());
    }
  }

  get supported(): boolean {
    return this.synth !== null;
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Vrai si le navigateur a refusé de parler faute d'un geste de l'utilisateur (il faut toucher l'écran). */
  get blocked(): boolean {
    return this.isBlocked;
  }

  /** Voix françaises disponibles (liste stable tant que le navigateur n'en signale pas de nouvelles). */
  get frenchVoices(): readonly SpeechSynthesisVoice[] {
    return this.voices;
  }

  subscribe(callback: () => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  speak(text: string, options: SpeakOptions, onDone?: () => void): void {
    const id = ++this.seq;
    this.clearTimers();
    const synth = this.synth;
    if (!synth || text.trim() === "") {
      this.setSpeaking(false);
      onDone?.();
      return;
    }
    this.setSpeaking(true);
    synth.cancel();

    // Certains navigateurs ignorent un speak() collé à un cancel() : on attend un instant.
    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      if (id !== this.seq) return;
      const utterance = this.makeUtterance(text);
      utterance.lang = "fr-FR";
      utterance.rate = Math.min(2, Math.max(0.5, options.rate));
      const voice = options.voiceURI ? this.voices.find((v) => v.voiceURI === options.voiceURI) : undefined;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }

      const finish = (error?: string) => {
        if (id !== this.seq) return;
        this.clearTimers();
        this.setSpeaking(false);
        if (error === "not-allowed") this.setBlocked(true);
        onDone?.();
      };
      utterance.onstart = () => this.setBlocked(false);
      utterance.onend = () => finish();
      utterance.onerror = (event) => {
        const error = event.error;
        finish(error === "canceled" || error === "interrupted" ? undefined : error);
      };
      this.safetyTimer = setTimeout(() => finish(), safetyDelay(text, options.rate));
      try {
        synth.speak(utterance);
      } catch {
        finish("error");
      }
    }, 60);
  }

  /** Coupe la phrase en cours. */
  cancel(): void {
    this.seq++;
    this.clearTimers();
    try {
      this.synth?.cancel();
    } catch {
      // rien à faire
    }
    this.setSpeaking(false);
  }

  /**
   * À appeler dans un geste de l'utilisateur (clic) : certains navigateurs (iPhone, Chrome)
   * n'autorisent la voix qu'après une interaction.
   */
  unlock(): void {
    if (!this.synth) return;
    try {
      const utterance = this.makeUtterance(" ");
      utterance.volume = 0;
      utterance.lang = "fr-FR";
      this.synth.speak(utterance);
    } catch {
      // tant pis : la voix restera peut-être bloquée jusqu'au prochain geste
    }
    this.setBlocked(false);
  }

  private refreshVoices(): void {
    this.voices = (this.synth?.getVoices() ?? []).filter(isFrench);
    this.notify();
  }

  private setSpeaking(value: boolean): void {
    if (this.isSpeaking === value) return;
    this.isSpeaking = value;
    this.notify();
  }

  private setBlocked(value: boolean): void {
    if (this.isBlocked === value) return;
    this.isBlocked = value;
    this.notify();
  }

  private clearTimers(): void {
    if (this.startTimer !== null) clearTimeout(this.startTimer);
    if (this.safetyTimer !== null) clearTimeout(this.safetyTimer);
    this.startTimer = null;
    this.safetyTimer = null;
  }

  private notify(): void {
    this.subscribers.forEach((callback) => callback());
  }
}
