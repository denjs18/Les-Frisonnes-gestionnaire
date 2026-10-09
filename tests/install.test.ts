import { describe, expect, it, vi } from "vitest";
import { InstallState, type InstallPromptEvent } from "@/lib/install";
import { clearStorage, INSTALL_HIDDEN_KEY, type StorageLike } from "@/lib/storage";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const brokenStorage: StorageLike = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

/** Un faux « beforeinstallprompt », comme celui que Chrome envoie. */
function promptEvent(outcome: "accepted" | "dismissed" = "accepted") {
  const event = new Event("beforeinstallprompt", { cancelable: true }) as InstallPromptEvent & { prompt: ReturnType<typeof vi.fn> };
  Object.assign(event, { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });
  return event;
}

function setup(options: { standalone?: boolean; storage?: StorageLike | null } = {}) {
  const target = new EventTarget();
  const storage = options.storage === undefined ? new MemoryStorage() : options.storage;
  const state = new InstallState(target, storage, options.standalone ?? false);
  return { target, storage, state };
}

describe("InstallState", () => {
  it("au départ : rien à proposer", () => {
    expect(setup().state.getSnapshot()).toEqual({ canPrompt: false, installed: false, hidden: false });
  });

  it("une appli ouverte depuis l'écran d'accueil est déjà installée", () => {
    expect(setup({ standalone: true }).state.getSnapshot().installed).toBe(true);
  });

  it("garde l'événement du navigateur (en bloquant son bandeau) pour le bouton « Installer »", () => {
    const { target, state } = setup();
    const seen = vi.fn();
    state.subscribe(seen);
    const event = promptEvent();
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(state.getSnapshot().canPrompt).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("ouvre la fenêtre d'installation, une seule fois par événement", async () => {
    const { target, state } = setup();
    const event = promptEvent("accepted");
    target.dispatchEvent(event);
    await expect(state.prompt()).resolves.toBe("accepted");
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(state.getSnapshot().canPrompt).toBe(false);
    await expect(state.prompt()).resolves.toBe("unavailable");
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it("signale un refus de l'utilisateur, et accepte un nouvel événement envoyé plus tard par le navigateur", async () => {
    const { target, state } = setup();
    target.dispatchEvent(promptEvent("dismissed"));
    await expect(state.prompt()).resolves.toBe("dismissed");
    expect(state.getSnapshot()).toMatchObject({ canPrompt: false, installed: false });
    target.dispatchEvent(promptEvent("accepted"));
    expect(state.getSnapshot().canPrompt).toBe(true);
  });

  it("sans événement du navigateur (Firefox, Safari, déjà installée…), « Installer » ne fait rien", async () => {
    await expect(setup().state.prompt()).resolves.toBe("unavailable");
  });

  it("une fenêtre d'installation qui plante n'est pas une erreur pour l'utilisateur", async () => {
    const { target, state } = setup();
    const event = promptEvent();
    event.prompt.mockRejectedValueOnce(new Error("InvalidStateError"));
    target.dispatchEvent(event);
    await expect(state.prompt()).resolves.toBe("unavailable");
  });

  it("après l'installation (« appinstalled »), l'appli est installée et plus rien n'est proposé", () => {
    const { target, state } = setup();
    target.dispatchEvent(promptEvent());
    target.dispatchEvent(new Event("appinstalled"));
    expect(state.getSnapshot()).toMatchObject({ canPrompt: false, installed: true });
  });

  it("masquer la carte s'enregistre, et l'effacement des données la fait revenir", () => {
    const { state, storage } = setup();
    state.hide();
    expect(state.getSnapshot().hidden).toBe(true);
    expect((storage as MemoryStorage).data.get(INSTALL_HIDDEN_KEY)).toBe("1");
    expect(new InstallState(new EventTarget(), storage, false).getSnapshot().hidden).toBe(true);
    clearStorage(storage);
    expect(new InstallState(new EventTarget(), storage, false).getSnapshot().hidden).toBe(false);
  });

  it("fonctionne sans stockage (navigation privée, cookies bloqués)", () => {
    for (const storage of [null, brokenStorage]) {
      const { state } = setup({ storage });
      expect(state.getSnapshot().hidden).toBe(false);
      expect(() => state.hide()).not.toThrow();
      expect(state.getSnapshot().hidden).toBe(true);
    }
  });

  it("ne prévient les abonnés que lorsque quelque chose change, et plus ceux qui se sont désabonnés", () => {
    const { target, state } = setup();
    const seen = vi.fn();
    const unsubscribe = state.subscribe(seen);
    target.dispatchEvent(new Event("appinstalled"));
    target.dispatchEvent(new Event("appinstalled"));
    expect(seen).toHaveBeenCalledTimes(1);
    unsubscribe();
    state.hide();
    expect(seen).toHaveBeenCalledTimes(1);
  });
});
