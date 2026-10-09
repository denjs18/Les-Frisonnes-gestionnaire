/** Le strict nécessaire de `SpeechRecognition`, pour pouvoir le remplacer dans les tests. */
export interface RecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface RecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

export interface RecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike };
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: RecognitionEventLike) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => RecognitionLike;

/** `SpeechRecognition` ou `webkitSpeechRecognition` selon le navigateur ; null s'il n'y en a pas (ex. Safari installé sur l'écran d'accueil). */
export function findRecognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenerStatus =
  | "unsupported" // le navigateur ne sait pas écouter
  | "off" // micro coupé (réglage, ou écran masqué)
  | "starting"
  | "listening"
  | "suspended" // en pause pendant que l'appli parle
  | "denied" // autorisation du micro refusée
  | "no-mic" // aucun micro utilisable
  | "network" // la reconnaissance vocale du navigateur a besoin d'Internet
  | "error"; // micro instable : on arrête d'insister

export interface ListenerHandlers {
  /** Texte entendu, à afficher à l'écran (meilleure hypothèse). */
  onHeard(text: string, isFinal: boolean): void;
  /** Hypothèses à interpréter : un résultat final, ou un résultat provisoire resté inchangé. */
  onCandidates(candidates: string[]): void;
}

export interface ListenerOptions {
  lang?: string;
  /** Un résultat provisoire inchangé pendant ce délai est traité comme final. */
  stableMs?: number;
  /** Attente après la fin d'une phrase de l'appli, pour ne pas s'écouter soi-même. */
  resumeDelayMs?: number;
  /** Nombre de relances ratées d'affilée avant d'abandonner. */
  maxQuickEnds?: number;
}

type Timer = ReturnType<typeof setTimeout>;
type Fatal = "denied" | "no-mic" | "network" | "error";

/**
 * Écoute continue en français, relancée automatiquement (les navigateurs coupent l'écoute
 * après quelques secondes de silence). L'écoute est suspendue pendant que l'appli parle.
 */
export class Listener {
  private rec: RecognitionLike | null = null;
  private running = false;
  private wanted = false;
  private suspended = false;
  private destroyed = false;
  private fatal: Fatal | null = null;
  private networkError = false;
  private networkStrikes = 0;
  private quickEnds = 0;
  private restartTimer: Timer | null = null;
  private resumeTimer: Timer | null = null;
  private stableTimer: Timer | null = null;
  private lastStatus: ListenerStatus;
  private readonly subscribers = new Set<(status: ListenerStatus) => void>();
  private readonly lang: string;
  private readonly stableMs: number;
  private readonly resumeDelayMs: number;
  private readonly maxQuickEnds: number;

  constructor(
    private readonly ctor: RecognitionConstructor | null,
    private handlers: ListenerHandlers,
    options: ListenerOptions = {},
  ) {
    this.lang = options.lang ?? "fr-FR";
    this.stableMs = options.stableMs ?? 450;
    this.resumeDelayMs = options.resumeDelayMs ?? 350;
    this.maxQuickEnds = options.maxQuickEnds ?? 8;
    this.lastStatus = this.computeStatus();
  }

  get status(): ListenerStatus {
    return this.lastStatus;
  }

  subscribe(callback: (status: ListenerStatus) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  setHandlers(handlers: ListenerHandlers): void {
    this.handlers = handlers;
  }

  /** Le micro est-il souhaité ? (réglage activé, écran visible…). Un changement relance une tentative propre. */
  setWanted(wanted: boolean): void {
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    if (wanted) this.resetFailures();
    this.sync();
  }

  /** L'appli est en train de parler : on coupe l'écoute, et on la reprend peu après la fin de la phrase. */
  setSuspended(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    this.clearResume();
    if (suspended) {
      this.sync();
    } else {
      this.resumeTimer = setTimeout(() => {
        this.resumeTimer = null;
        this.sync();
      }, this.resumeDelayMs);
      this.emit();
    }
  }

  /** Nouvelle tentative après une erreur (bouton « Réessayer »). */
  retry(): void {
    this.resetFailures();
    this.sync();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearRestart();
    this.clearResume();
    this.halt();
    this.emit();
    this.subscribers.clear();
  }

  private resetFailures(): void {
    this.fatal = null;
    this.networkError = false;
    this.networkStrikes = 0;
    this.quickEnds = 0;
  }

  private get canRun(): boolean {
    return (
      this.ctor !== null && this.wanted && !this.suspended && !this.destroyed && this.fatal === null && this.resumeTimer === null
    );
  }

  private computeStatus(): ListenerStatus {
    if (!this.ctor) return "unsupported";
    if (this.fatal) return this.fatal;
    if (!this.wanted) return "off";
    if (this.suspended || this.resumeTimer !== null) return "suspended";
    if (this.networkError) return "network";
    return this.running ? "listening" : "starting";
  }

  private emit(): void {
    const status = this.computeStatus();
    if (status === this.lastStatus) return;
    this.lastStatus = status;
    this.subscribers.forEach((callback) => callback(status));
  }

  private sync(): void {
    if (this.canRun) {
      if (!this.rec && this.restartTimer === null) this.start();
    } else {
      this.clearRestart();
      this.halt();
    }
    this.emit();
  }

  private start(): void {
    if (!this.ctor || this.rec) return;
    const rec = new this.ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    const startedAt = Date.now();
    this.rec = rec;

    rec.onstart = () => {
      if (this.rec !== rec) return;
      this.running = true;
      this.emit();
    };
    rec.onresult = (event) => {
      if (this.rec !== rec) return;
      this.quickEnds = 0;
      this.networkStrikes = 0;
      this.networkError = false;
      this.handleResult(event);
      this.emit();
    };
    rec.onerror = (event) => {
      if (this.rec !== rec) return;
      this.handleError(event.error);
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      this.running = false;
      this.clearStable();
      this.quickEnds = Date.now() - startedAt < 1500 ? this.quickEnds + 1 : 0;
      this.scheduleRestart();
      this.emit();
    };

    try {
      rec.start();
    } catch {
      this.rec = null;
      this.quickEnds += 1;
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    if (!this.canRun || this.restartTimer !== null) return;
    if (this.quickEnds >= this.maxQuickEnds) {
      this.fatal = "error";
      return;
    }
    // 250 ms après une fin normale ou un premier échec, puis 500, 1000… jusqu'à 5 s.
    const delay = Math.min(250 * 2 ** Math.max(0, this.quickEnds - 1), 5000);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.sync();
    }, delay);
  }

  private handleResult(event: RecognitionEventLike): void {
    const last = event.results.length - 1;
    for (let i = event.resultIndex; i <= last; i++) {
      const result = event.results[i];
      const texts: string[] = [];
      for (let k = 0; k < result.length; k++) {
        const text = result[k].transcript.trim();
        if (text !== "") texts.push(text);
      }
      if (texts.length === 0) continue;
      this.handlers.onHeard(texts[0], result.isFinal);
      if (result.isFinal) {
        this.clearStable();
        this.handlers.onCandidates(texts);
      } else if (i === last) {
        this.armStable(texts);
      }
    }
  }

  /** Un résultat provisoire qui ne bouge plus pendant `stableMs` est considéré comme terminé. */
  private armStable(texts: string[]): void {
    this.clearStable();
    this.stableTimer = setTimeout(() => {
      this.stableTimer = null;
      this.handlers.onCandidates(texts);
    }, this.stableMs);
  }

  private handleError(code: string): void {
    switch (code) {
      case "no-speech":
      case "aborted":
        return; // normal : le navigateur relance via onend
      case "not-allowed":
      case "service-not-allowed":
        this.fatal = "denied";
        break;
      case "audio-capture":
        this.fatal = "no-mic";
        break;
      case "language-not-supported":
        this.fatal = "error";
        break;
      case "network":
        this.networkError = true;
        this.networkStrikes += 1;
        if (this.networkStrikes >= 4) this.fatal = "network";
        break;
      default:
        break; // erreur passagère : onend relancera
    }
    if (this.fatal) {
      this.clearRestart();
      this.halt();
    }
    this.emit();
  }

  private halt(): void {
    const rec = this.rec;
    this.rec = null;
    this.running = false;
    this.clearStable();
    if (!rec) return;
    rec.onstart = null;
    rec.onend = null;
    rec.onerror = null;
    rec.onresult = null;
    try {
      rec.abort();
    } catch {
      // déjà arrêté
    }
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private clearResume(): void {
    if (this.resumeTimer !== null) clearTimeout(this.resumeTimer);
    this.resumeTimer = null;
  }

  private clearStable(): void {
    if (this.stableTimer !== null) clearTimeout(this.stableTimer);
    this.stableTimer = null;
  }
}
