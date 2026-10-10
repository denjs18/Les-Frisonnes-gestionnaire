import { describe, expect, it } from "vitest";
import { cellKey } from "@/lib/analysis";
import { importPhotoTable } from "@/lib/import/photo";
import type { PhotoTable } from "@/lib/photo/types";
import { DEFAULT_SETTINGS, type Session } from "@/lib/state";
import {
  clearStorage,
  parseSession,
  PHOTO_CODE_KEY,
  PHOTO_KEY,
  readPhotoCopy,
  readSession,
  SESSION_KEY,
  SETTINGS_KEY,
  writePhotoCopy,
  writeSession,
  type StorageLike,
} from "@/lib/storage";
import { createStore } from "@/lib/store";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  /** Nombre maximal de caractères acceptés au total, comme un stockage qui se remplit. */
  limit = Infinity;
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    const others = [...this.data].filter(([k]) => k !== key).reduce((sum, [, v]) => sum + v.length, 0);
    if (others + value.length > this.limit) throw new Error("QuotaExceededError");
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

const PHOTO: PhotoTable = {
  rows: [
    ["Clients", "Yaourt", "Fromage"],
    ["Alice", "3", "2"],
    ["Bob", "", "5"],
  ],
  uncertain: [[1, 1]],
  message: "Photo un peu floue.",
};
const DATA_URL = "data:image/jpeg;base64,/9j/4AAQSkZJRg==";

/** Une préparation lue sur une photo, créée comme le fait l'appli. */
function photoSession(): Session {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  store.init();
  const { model, flagged, note } = importPhotoTable(PHOTO);
  store.dispatch({ type: "import", model, importedAt: "2026-10-10T10:00:00.000Z", photo: { flagged, note } });
  return store.getState().session!;
}

describe("sauvegarde d'une préparation lue sur une photo", () => {
  it("garde l'origine, les cases douteuses et la remarque", () => {
    const storage = new MemoryStorage();
    const session = photoSession();
    writeSession(storage, session);
    const back = readSession(storage);
    expect(back).toEqual(session);
    expect(back).toMatchObject({ source: "photo", flagged: { [cellKey(0, 0)]: true }, note: "Photo un peu floue." });
  });

  it("accepte une ancienne sauvegarde sans ces champs", () => {
    const { source, flagged, note, ...old } = photoSession();
    void source;
    void flagged;
    void note;
    expect(parseSession(JSON.parse(JSON.stringify(old)))).not.toBeNull();
  });

  it("refuse des champs abîmés", () => {
    const base = JSON.parse(JSON.stringify(photoSession()));
    expect(parseSession(base)).not.toBeNull();
    expect(parseSession({ ...base, source: "scan" })).toBeNull();
    expect(parseSession({ ...base, source: 1 })).toBeNull();
    expect(parseSession({ ...base, note: 5 })).toBeNull();
    expect(parseSession({ ...base, flagged: [] })).toBeNull();
    expect(parseSession({ ...base, flagged: "0:0" })).toBeNull();
    expect(parseSession({ ...base, flagged: { "0:0": false } })).toBeNull();
    expect(parseSession({ ...base, flagged: null })).toBeNull();
  });
});

describe("copie de la photo gardée sur l'appareil", () => {
  it("s'enregistre et se relit", () => {
    const storage = new MemoryStorage();
    expect(readPhotoCopy(storage)).toBeNull();
    expect(writePhotoCopy(storage, DATA_URL)).toBe(true);
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
    expect(storage.data.get(PHOTO_KEY)).toBe(DATA_URL);
  });

  it("écrire null l'efface", () => {
    const storage = new MemoryStorage();
    writePhotoCopy(storage, DATA_URL);
    expect(writePhotoCopy(storage, null)).toBe(true);
    expect(readPhotoCopy(storage)).toBeNull();
  });

  it("ne relit que des images (une valeur étrangère ne doit pas devenir l'adresse d'une image)", () => {
    const storage = new MemoryStorage();
    for (const value of ["https://autre-site.example/x.jpg", "javascript:alert(1)", "data:text/html,<script>", ""]) {
      storage.setItem(PHOTO_KEY, value);
      expect(readPhotoCopy(storage)).toBeNull();
    }
  });

  it("stockage plein : retire l'ancienne photo plutôt que de la laisser passer pour la nouvelle", () => {
    const storage = new MemoryStorage();
    writePhotoCopy(storage, DATA_URL);
    storage.limit = DATA_URL.length - 1; // la nouvelle photo (plus grosse) ne rentre pas
    expect(writePhotoCopy(storage, DATA_URL + "AAAA")).toBe(false);
    expect(readPhotoCopy(storage)).toBeNull();
  });

  it("stockage absent ou interdit : ne plante pas", () => {
    expect(writePhotoCopy(null, DATA_URL)).toBe(false);
    expect(writePhotoCopy(brokenStorage, DATA_URL)).toBe(false);
    expect(readPhotoCopy(null)).toBeNull();
    expect(readPhotoCopy(brokenStorage)).toBeNull();
  });

  it("« effacer les données » retire aussi la photo et le code d'accès", () => {
    const storage = new MemoryStorage();
    for (const key of [SESSION_KEY, SETTINGS_KEY, PHOTO_KEY, PHOTO_CODE_KEY]) storage.setItem(key, "x");
    clearStorage(storage);
    expect(storage.data.size).toBe(0);
    expect(() => clearStorage(brokenStorage)).not.toThrow();
  });
});

describe("la photo suit la préparation dont elle vient", () => {
  function setup() {
    const storage = new MemoryStorage();
    const store = createStore(storage);
    store.init();
    const { model, flagged, note } = importPhotoTable(PHOTO);
    // Comme l'accueil : la copie est enregistrée juste avant l'import.
    const importPhoto = () => {
      writePhotoCopy(storage, DATA_URL);
      store.dispatch({ type: "import", model, importedAt: "2026-10-10T10:00:00.000Z", photo: { flagged, note } });
    };
    return { storage, store, model, importPhoto };
  }

  it("reste après l'import d'une photo, après des corrections et après une relecture de la sauvegarde", () => {
    const { storage, store, importPhoto } = setup();
    importPhoto();
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
    store.dispatch({ type: "setCell", r: 0, c: 0, value: 4 });
    store.dispatch({ type: "confirmCell", r: 1, c: 1 });
    store.dispatch({ type: "start" });
    expect(readPhotoCopy(storage)).toBe(DATA_URL);

    const reopened = createStore(storage);
    reopened.init();
    expect(reopened.getState().session?.source).toBe("photo");
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
  });

  it("disparaît quand on importe un fichier à la place", () => {
    const { storage, store, model, importPhoto } = setup();
    importPhoto();
    store.dispatch({ type: "import", model, importedAt: "2026-10-10T11:00:00.000Z" });
    expect(readPhotoCopy(storage)).toBeNull();
  });

  it("est remplacée par celle de la photo suivante", () => {
    const { storage, importPhoto } = setup();
    importPhoto();
    writePhotoCopy(storage, DATA_URL + "B");
    importPhoto();
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
  });

  it("disparaît quand la préparation est supprimée ou que tout est effacé", () => {
    const first = setup();
    first.importPhoto();
    first.store.dispatch({ type: "clearSession" });
    expect(readPhotoCopy(first.storage)).toBeNull();

    const second = setup();
    second.importPhoto();
    second.store.dispatch({ type: "resetAll" });
    expect(readPhotoCopy(second.storage)).toBeNull();
  });

  it("n'est pas touchée par un simple changement de réglage", () => {
    const { storage, store, importPhoto } = setup();
    importPhoto();
    store.dispatch({ type: "updateSettings", patch: { voiceRate: DEFAULT_SETTINGS.voiceRate + 0.2 } });
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
  });

  it("n'est pas effacée au simple démarrage de l'appli (avant d'avoir relu la préparation)", () => {
    const { storage, importPhoto } = setup();
    importPhoto();
    const store = createStore(storage);
    store.init();
    expect(readPhotoCopy(storage)).toBe(DATA_URL);
  });
});
