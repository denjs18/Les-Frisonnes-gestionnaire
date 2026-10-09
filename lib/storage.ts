import { clampRate, DEFAULT_SETTINGS, type Session, type Settings } from "./state";
import type { Alias } from "./speech-text";

/** Le strict nécessaire de `localStorage`, pour pouvoir le remplacer dans les tests. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SESSION_KEY = "prepa-commandes:v1:session";
export const SETTINGS_KEY = "prepa-commandes:v1:settings";

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

/** Efface toutes les données de l'appli enregistrées sur l'appareil. */
export function clearStorage(storage: StorageLike | null): void {
  for (const key of [SESSION_KEY, SETTINGS_KEY]) {
    try {
      storage?.removeItem(key);
    } catch {
      // rien à faire
    }
  }
}
