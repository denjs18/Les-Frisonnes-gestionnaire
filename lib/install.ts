import { browserStorage, INSTALL_HIDDEN_KEY, type StorageLike } from "./storage";

/** L'événement « beforeinstallprompt » de Chrome (Android, ordinateur) : il permet d'ouvrir la fenêtre d'installation. */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface InstallSnapshot {
  /** Le navigateur propose d'installer l'appli : un bouton « Installer » peut ouvrir sa fenêtre. */
  canPrompt: boolean;
  /** L'appli est déjà installée (ou ouverte depuis l'écran d'accueil). */
  installed: boolean;
  /** La carte d'installation a été masquée par l'utilisateur. */
  hidden: boolean;
}

export const SERVER_INSTALL: InstallSnapshot = { canPrompt: false, installed: false, hidden: false };

export type InstallOutcome = "accepted" | "dismissed" | "unavailable";

/**
 * Suit l'installation de l'appli. Le navigateur n'envoie « beforeinstallprompt » qu'une fois, peu après le chargement :
 * il faut donc l'écouter dès le départ et le garder pour le moment où l'on touche « Installer ».
 */
export class InstallState {
  private deferred: InstallPromptEvent | null = null;
  private snapshot: InstallSnapshot;
  private readonly subscribers = new Set<() => void>();

  constructor(
    target: Pick<EventTarget, "addEventListener">,
    private readonly storage: StorageLike | null,
    standalone: boolean,
  ) {
    this.snapshot = { canPrompt: false, installed: standalone, hidden: this.readHidden() };
    target.addEventListener("beforeinstallprompt", (event) => {
      // Pas de petit bandeau automatique du navigateur : l'appli propose son propre bouton.
      event.preventDefault();
      this.deferred = event as InstallPromptEvent;
      this.update({ canPrompt: true });
    });
    target.addEventListener("appinstalled", () => {
      this.deferred = null;
      this.update({ canPrompt: false, installed: true });
    });
  }

  getSnapshot = (): InstallSnapshot => this.snapshot;

  subscribe = (callback: () => void): (() => void) => {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  };

  /** Ouvre la fenêtre d'installation du navigateur (à appeler depuis un toucher). */
  async prompt(): Promise<InstallOutcome> {
    const event = this.deferred;
    if (!event) return "unavailable";
    this.deferred = null; // un événement ne sert qu'une fois
    this.update({ canPrompt: false });
    try {
      await event.prompt();
      return (await event.userChoice).outcome;
    } catch {
      return "unavailable";
    }
  }

  /** Masque la carte d'installation, et s'en souvient. */
  hide(): void {
    try {
      this.storage?.setItem(INSTALL_HIDDEN_KEY, "1");
    } catch {
      // stockage interdit ou plein : la carte restera masquée jusqu'au prochain chargement seulement
    }
    this.update({ hidden: true });
  }

  private readHidden(): boolean {
    try {
      return this.storage?.getItem(INSTALL_HIDDEN_KEY) === "1";
    } catch {
      return false;
    }
  }

  private update(patch: Partial<InstallSnapshot>): void {
    const next = { ...this.snapshot, ...patch };
    if (next.canPrompt === this.snapshot.canPrompt && next.installed === this.snapshot.installed && next.hidden === this.snapshot.hidden) {
      return;
    }
    this.snapshot = next;
    this.subscribers.forEach((callback) => callback());
  }
}

/** Ouverte depuis l'écran d'accueil (Android, ordinateur : « display-mode » ; iPhone : « navigator.standalone »). */
function isStandalone(): boolean {
  try {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

let instance: InstallState | null = null;

function state(): InstallState | null {
  if (typeof window === "undefined") return null;
  instance ??= new InstallState(window, browserStorage(), isStandalone());
  return instance;
}

/** À appeler dès le chargement de l'appli, avant que l'accueil ne soit affiché : l'événement d'installation n'arrive qu'une fois. */
export function watchInstall(): void {
  state();
}

/** Accès à l'installation. Côté serveur il ne fait rien ; le vrai suivi n'est créé que dans le navigateur. */
export const install = {
  subscribe: (callback: () => void): (() => void) => state()?.subscribe(callback) ?? (() => {}),
  getSnapshot: (): InstallSnapshot => state()?.getSnapshot() ?? SERVER_INSTALL,
  getServerSnapshot: (): InstallSnapshot => SERVER_INSTALL,
  prompt: (): Promise<InstallOutcome> => state()?.prompt() ?? Promise.resolve("unavailable"),
  hide: (): void => state()?.hide(),
};
