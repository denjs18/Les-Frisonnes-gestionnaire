import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/grid";
import {
  browserStorage,
  clearStorage,
  parseSession,
  parseSettings,
  readSession,
  readSettings,
  SESSION_KEY,
  SETTINGS_KEY,
  writeSession,
  writeSettings,
  type StorageLike,
} from "@/lib/storage";
import { DEFAULT_SETTINGS, INITIAL_STATE, reduce, type Session } from "@/lib/state";
import { createStore } from "@/lib/store";
import { grid } from "./helpers";

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

/** Un stockage qui refuse tout, comme certains navigateurs en navigation privée. */
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

const model = buildModel(grid([["Nom", "A", "B"], ["x", 1, "oups"], ["y", 2.5, 3]]), "essai.xlsx");

function makeSession(): Session {
  const state = reduce(
    reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS }),
    { type: "import", model, importedAt: "2026-10-09T10:00:00.000Z" },
  );
  return reduce(state, { type: "setPosition", position: { colPos: 1, rowPos: null } }).session!;
}

describe("sauvegarde dans le navigateur", () => {
  it("relit exactement la session et les réglages enregistrés", () => {
    const storage = new MemoryStorage();
    const session = makeSession();
    const settings = { ...DEFAULT_SETTINGS, voiceRate: 1.2, theme: "dark" as const, aliases: [{ from: "FB", to: "fromage blanc" }] };
    writeSession(storage, session);
    writeSettings(storage, settings);
    expect(readSession(storage)).toEqual(session);
    expect(readSettings(storage)).toEqual(settings);
  });

  it("efface la session quand on enregistre null, et tout avec clearStorage", () => {
    const storage = new MemoryStorage();
    writeSession(storage, makeSession());
    writeSession(storage, null);
    expect(storage.data.has(SESSION_KEY)).toBe(false);
    writeSession(storage, makeSession());
    writeSettings(storage, DEFAULT_SETTINGS);
    clearStorage(storage);
    expect(storage.data.size).toBe(0);
  });

  it("fonctionne sans aucun stockage (appli utilisable, simplement sans sauvegarde)", () => {
    expect(readSession(null)).toBeNull();
    expect(readSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSession(null, makeSession())).not.toThrow();
    expect(() => writeSettings(null, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => clearStorage(null)).not.toThrow();
    expect(browserStorage()).toBeNull(); // pas de window dans ces tests
  });

  it("ne plante jamais si le stockage lève des erreurs (try/catch)", () => {
    expect(readSession(brokenStorage)).toBeNull();
    expect(readSettings(brokenStorage)).toEqual(DEFAULT_SETTINGS);
    expect(() => writeSession(brokenStorage, makeSession())).not.toThrow();
    expect(() => writeSettings(brokenStorage, DEFAULT_SETTINGS)).not.toThrow();
    expect(() => clearStorage(brokenStorage)).not.toThrow();
  });

  it("ignore une sauvegarde illisible ou abîmée", () => {
    const storage = new MemoryStorage();
    storage.setItem(SESSION_KEY, "{pas du json");
    storage.setItem(SETTINGS_KEY, "[1,2");
    expect(readSession(storage)).toBeNull();
    expect(readSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("refuse une session dont la forme est incohérente", () => {
    const good = JSON.parse(JSON.stringify(makeSession()));
    expect(parseSession(good)).not.toBeNull();

    const badWidth = structuredClone(good);
    badWidth.cells[0].pop();
    expect(parseSession(badWidth)).toBeNull();

    const badStatus = { ...structuredClone(good), status: "inconnu" };
    expect(parseSession(badStatus)).toBeNull();

    const otherVersion = { ...structuredClone(good), version: 2 };
    expect(parseSession(otherVersion)).toBeNull();

    const badOverride = { ...structuredClone(good), columnOverrides: { 0: "peut-être" } };
    expect(parseSession(badOverride)).toBeNull();

    const badPosition = { ...structuredClone(good), position: { colPos: "a", rowPos: null } };
    expect(parseSession(badPosition)).toBeNull();

    expect(parseSession(null)).toBeNull();
    expect(parseSession("texte")).toBeNull();
    expect(parseSession({})).toBeNull();
  });

  it("complète les réglages manquants ou invalides avec les valeurs par défaut", () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    const parsed = parseSettings({ voiceRate: 42, theme: "rose", micEnabled: "oui", textScale: "large", aliases: "nope", voiceURI: 3 });
    expect(parsed.voiceRate).toBe(1.6);
    expect(parsed.theme).toBe("auto");
    expect(parsed.micEnabled).toBe(true);
    expect(parsed.textScale).toBe("large");
    expect(parsed.aliases).toEqual(DEFAULT_SETTINGS.aliases);
    expect(parsed.voiceURI).toBeNull();
  });

  it("retient la sensibilité du micro, et revient à « normale » si elle est inconnue (sauvegarde d'une ancienne version comprise)", () => {
    expect(DEFAULT_SETTINGS.micSensitivity).toBe("normal");
    expect(parseSettings({ micSensitivity: "low" }).micSensitivity).toBe("low");
    expect(parseSettings({ micSensitivity: "very-low" }).micSensitivity).toBe("very-low");
    expect(parseSettings({ micSensitivity: "extreme" }).micSensitivity).toBe("normal");
    expect(parseSettings({ micSensitivity: 3 }).micSensitivity).toBe("normal");
    expect(parseSettings({ voiceRate: 1.2 }).micSensitivity).toBe("normal"); // réglages enregistrés avant l'existence de ce réglage
  });

  it("enregistre et relit la sensibilité du micro", () => {
    const storage = new MemoryStorage();
    writeSettings(storage, { ...DEFAULT_SETTINGS, micSensitivity: "very-low" });
    expect(readSettings(storage).micSensitivity).toBe("very-low");
  });
});

describe("magasin d'état", () => {
  it("charge la sauvegarde au démarrage (une seule fois)", () => {
    const storage = new MemoryStorage();
    writeSession(storage, makeSession());
    const store = createStore(storage);
    expect(store.getState().loaded).toBe(false);
    store.init();
    expect(store.getState().loaded).toBe(true);
    expect(store.getState().session).toEqual(makeSession());
    store.dispatch({ type: "clearSession" });
    store.init(); // sans effet
    expect(store.getState().session).toBeNull();
  });

  it("sauvegarde à chaque changement de session ou de réglage", () => {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.init();
    store.dispatch({ type: "import", model, importedAt: "2026-10-09T10:00:00.000Z" });
    expect(readSession(storage)?.model.fileName).toBe("essai.xlsx");
    store.dispatch({ type: "updateSettings", patch: { ignoreStar: false } });
    expect(readSettings(storage).ignoreStar).toBe(false);
    store.dispatch({ type: "clearSession" });
    expect(storage.data.has(SESSION_KEY)).toBe(false);
  });

  it("prévient les abonnés, et plus ceux qui se sont désabonnés", () => {
    const store = createStore(null);
    let calls = 0;
    const unsubscribe = store.subscribe(() => calls++);
    store.init();
    expect(calls).toBe(1);
    store.dispatch({ type: "clearSession" }); // rien à effacer : l'état ne change pas
    expect(calls).toBe(1);
    store.dispatch({ type: "updateSettings", patch: { micEnabled: false } });
    expect(calls).toBe(2);
    unsubscribe();
    store.dispatch({ type: "updateSettings", patch: { micEnabled: true } });
    expect(calls).toBe(2);
  });

  it("fonctionne sans stockage et rend un état serveur toujours vide", () => {
    const store = createStore(null);
    store.init();
    store.dispatch({ type: "import", model, importedAt: "x" });
    expect(store.getState().session).not.toBeNull();
    expect(store.getServerState()).toBe(INITIAL_STATE);
  });

  it("continue de fonctionner même si le stockage plante", () => {
    const store = createStore(brokenStorage);
    expect(() => {
      store.init();
      store.dispatch({ type: "import", model, importedAt: "x" });
      store.dispatch({ type: "updateSettings", patch: { theme: "dark" } });
    }).not.toThrow();
    expect(store.getState().settings.theme).toBe("dark");
  });
});
