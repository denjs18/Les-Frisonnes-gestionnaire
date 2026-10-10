import { PHOTO_LIMITS, PhotoError, type PhotoTable } from "./types";

function cellText(value: unknown): string {
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return text.replace(/\s+/g, " ").trim().slice(0, PHOTO_LIMITS.maxCellLength);
}

function isEmptyRow(row: string[]): boolean {
  return row.every((cell) => cell === "");
}

/** Une case douteuse peut être donnée en { row, col } (schéma demandé à Gemini) ou en [ligne, colonne]. */
function coordinates(item: unknown): [number, number] | null {
  const pair = Array.isArray(item) ? item : item && typeof item === "object" ? [(item as { row?: unknown }).row, (item as { col?: unknown }).col] : null;
  if (!pair || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) return null;
  return [pair[0] as number, pair[1] as number];
}

/**
 * Vérifie et met en forme ce que Gemini a renvoyé : des textes propres, des lignes de même largeur, sans lignes ni colonnes vides
 * en bout de tableau, des cases douteuses qui existent vraiment. Ne devine jamais une valeur.
 */
export function normalizePhotoTable(raw: unknown): PhotoTable {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { rows?: unknown }).rows)) {
    throw new PhotoError("unreadable", "La réponse de la lecture est inutilisable.");
  }
  const { rows: rawRows, uncertain: rawUncertain, message: rawMessage } = raw as { rows: unknown[]; uncertain?: unknown; message?: unknown };
  const message = typeof rawMessage === "string" && rawMessage.trim() !== "" ? rawMessage.replace(/\s+/g, " ").trim().slice(0, 300) : null;

  if (rawRows.length > PHOTO_LIMITS.maxRows * 2) throw new PhotoError("too-big", "Le tableau lu est beaucoup trop grand.");
  const cleaned = rawRows.map((row) => (Array.isArray(row) ? row.map(cellText) : null));
  if (cleaned.some((row) => row === null)) throw new PhotoError("unreadable", "La réponse de la lecture est inutilisable.");
  let table = cleaned as string[][];

  // Les lignes vides avant le tableau décalent les numéros de lignes des cases douteuses ; celles de la fin ne gênent pas.
  let offset = 0;
  while (table.length > 0 && isEmptyRow(table[0])) {
    table = table.slice(1);
    offset += 1;
  }
  while (table.length > 0 && isEmptyRow(table[table.length - 1])) table = table.slice(0, -1);

  let width = table.reduce((max, row) => Math.max(max, row.length), 0);
  table = table.map((row) => [...row, ...new Array(width - row.length).fill("")]);
  while (width > 0 && table.every((row) => row[width - 1] === "")) {
    width -= 1;
    table = table.map((row) => row.slice(0, width));
  }

  if (table.length < 2 || width < 2) {
    throw new PhotoError("no-table", message ?? "Je ne vois pas de tableau lisible sur cette photo.");
  }
  if (table.length > PHOTO_LIMITS.maxRows || width > PHOTO_LIMITS.maxColumns) {
    throw new PhotoError("too-big", "Le tableau lu est beaucoup trop grand.");
  }

  const seen = new Set<string>();
  const uncertain: [number, number][] = [];
  for (const item of Array.isArray(rawUncertain) ? rawUncertain : []) {
    const pair = coordinates(item);
    if (!pair) continue;
    const row = pair[0] - offset;
    const col = pair[1];
    if (row < 0 || row >= table.length || col < 0 || col >= width) continue;
    const key = `${row}:${col}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uncertain.push([row, col]);
  }

  return { rows: table, uncertain, message };
}
