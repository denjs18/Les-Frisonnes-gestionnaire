import { clampRate, DEFAULT_SETTINGS, type Session, type Settings } from "./state";
import type { Alias } from "./speech-text";
import { MIC_SENSITIVITIES, type MicSensitivity } from "./voice/sensitivity";

/** Le strict nécessaire de `localStorage`, pour pouvoir le remplacer dans les tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = "prepa-commandes:v1:session";
export const SETTINGS_KEY = "prepa-commandes:v1:settings";
/** « 1 » quand la carte « Installer l'appli » de l'accueil a été masquée. */
export const INSTALL_HIDDEN_KEY = "prepa-commandes:v1:install-hidden";
/** Copie réduite de la photo d'où vient le tableau (data URL), pour la comparer avec lui ; elle ne survit pas à la préparation. */
export const PHOTO_KEY = "prepa-commandes:v1:photo";
/** Le code d'accès à la lecture de photo, quand le site en demande un. */
export const PHOTO_CODE_KEY = "prepa-commandes:v1:photo-code";

/** `localStorage` s'il est utilisable (il peut être absent ou interdit : navigation privée, cookies bloqués…). */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    storage.getItem(SESSION_KEY);
    return storage;
  } catch {
    return null;
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCellValue = (v: unknown) => v === null || typeof v === "number" || typeof v === "string";

function isCellGrid(value: unknown, rows: number, columns: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === rows &&
    value.every((row) => Array.isArray(row) && row.length === columns && row.every(isCellValue))
  );
}

function isOverrides(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((v) => v === "on" || v === "off");
}

/** Vérifie qu'une sauvegarde a bien la forme attendue (elle a pu être abîmée ou venir d'une autre version). */
export function parseSession(value: unknown): Session | null {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.model)) return null;
  const { columns, rows, cells } = value.model;
  if (!Array.isArray(columns) || !Array.isArray(rows) || !Array.isArray(cells)) return null;
  const columnsOk = columns.every(
    (c) =>
      isRecord(c) &&
      typeof c.letter === "string" &&
      typeof c.name === "string" &&
      ["text", "empty", "formula", "number"].includes(c.headerKind as string),
  );
  const rowsOk = rows.every((r) => isRecord(r) && typeof r.number === "number" && typeof r.name === "string");
  if (!columnsOk || !rowsOk) return null;
  if (typeof value.model.fileName !== "string" || typeof value.model.sheetName !== "string") return null;
  if (!isCellGrid(cells, rows.length, columns.length) || !isCellGrid(value.cells, rows.length, columns.length)) {
    return null;
  }
  if (!isRecord(value.confirmed) || !Object.values(value.confirmed).every((v) => v === true)) return null;
  if (!isOverrides(value.columnOverrides) || !isOverrides(value.rowOverrides)) return null;
  if (typeof value.importedAt !== "string") return null;
  // Champs d'une préparation lue sur une photo (absents d'une préparation venue d'un fichier).
  if (value.source !== undefined && value.source !== "photo") return null;
  if (value.note !== undefined && typeof value.note !== "string") return null;
  if (value.flagged !== undefined && !(isRecord(value.flagged) && Object.values(value.flagged).every((v) => v === true))) return null;
  if (!["verifying", "preparing", "done"].includes(value.status as string)) return null;
  const position = value.position;
  if (
    position !== null &&
    !(isRecord(position) && typeof position.colPos === "number" && (position.rowPos === null || typeof position.rowPos === "number"))
  ) {
    return null;
  }
  return value as unknown as Session;
}

function parseAliases(value: unknown): Alias[] | null {
  if (!Array.isArray(value)) return null;
  const aliases: Alias[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.from !== "string" || typeof item.to !== "string") return null;
    aliases.push({ from: item.from, to: item.to });
  }
  return aliases;
}

/** Réglages enregistrés, complétés par les valeurs par défaut pour tout ce qui manque ou est invalide. */
export function parseSettings(value: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (!isRecord(value)) return d;
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    voiceRate: typeof value.voiceRate === "number" ? clampRate(value.voiceRate) : d.voiceRate,
    voiceURI: typeof value.voiceURI === "string" ? value.voiceURI : null,
    micEnabled: bool(value.micEnabled, d.micEnabled),
    micSensitivity: MIC_SENSITIVITIES.includes(value.micSensitivity as MicSensitivity)
      ? (value.micSensitivity as MicSensitivity)
      : d.micSensitivity,
    textScale: ["normal", "large", "xlarge"].includes(value.textScale as string)
      ? (value.textScale as Settings["textScale"])
      : d.textScale,
    theme: ["auto", "light", "dark"].includes(value.theme as string) ? (value.theme as Settings["theme"]) : d.theme,
    ignoreStar: bool(value.ignoreStar, d.ignoreStar),
    keepAwake: bool(value.keepAwake, d.keepAwake),
    aliases: parseAliases(value.aliases) ?? d.aliases,
  };
}

function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(storage: StorageLike | null, key: string, value: unknown): void {
  if (!storage) return;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou interdit : l'appli continue de fonctionner, sans sauvegarde.
  }
}

export const readSession = (storage: StorageLike | null): Session | null => parseSession(readJson(storage, SESSION_KEY));
export const writeSession = (storage: StorageLike | null, session: Session | null) => writeJson(storage, SESSION_KEY, session);
export const readSettings = (storage: StorageLike | null): Settings => parseSettings(readJson(storage, SETTINGS_KEY));
export const writeSettings = (storage: StorageLike | null, settings: Settings) => writeJson(storage, SETTINGS_KEY, settings);

/** La copie gardée de la photo (data URL), ou null s'il n'y en a pas. */
export function readPhotoCopy(storage: StorageLike | null): string | null {
  try {
    const value = storage?.getItem(PHOTO_KEY) ?? null;
    return value !== null && value.startsWith("data:image/") ? value : null;
  } catch {
    return null;
  }
}

/**
 * Garde la photo (ou l'efface avec null). L'ancienne est toujours retirée d'abord : si le stockage est plein, mieux vaut
 * n'avoir aucune photo que celle d'un autre tableau. Renvoie faux si la nouvelle n'a pas pu être enregistrée.
 */
export function writePhotoCopy(storage: StorageLike | null, dataUrl: string | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(PHOTO_KEY);
    if (dataUrl === null) return true;
    storage.setItem(PHOTO_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

/** Efface toutes les données de l'appli enregistrées sur l'appareil. */
export function clearStorage(storage: StorageLike | null): void {
  for (const key of [SESSION_KEY, SETTINGS_KEY, INSTALL_HIDDEN_KEY, PHOTO_KEY, PHOTO_CODE_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      // rien à faire
    }
  }
}
