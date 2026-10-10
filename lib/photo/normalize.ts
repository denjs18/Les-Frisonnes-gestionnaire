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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Numéro de colonne donné par Gemini : un entier raisonnable, sinon rien. */
function columnNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < PHOTO_LIMITS.maxColumns * 2 ? value : null;
}

/**
 * Met en forme la réponse de Gemini, qui est « creuse » : les colonnes numérotées avec leur titre, puis pour chaque ligne son nom
 * et seulement ses cases non vides avec leur numéro de colonne (voir `PHOTO_PROMPT`). Reconstitue un tableau complet, puis le vérifie
 * comme `normalizePhotoTable`.
 *
 * Deux valeurs données pour la même case ne sont pas départagées : elles sont réunies (« 5 / 6 ») et la case est signalée douteuse,
 * car c'est le signe d'une valeur mal placée. Une réponse déjà en lignes de cellules est acceptée telle quelle.
 */
export function normalizeSparseTable(raw: unknown): PhotoTable {
  if (!isRecord(raw) || !Array.isArray(raw.rows)) throw new PhotoError("unreadable", "La réponse de la lecture est inutilisable.");
  if (raw.rows.some((row) => Array.isArray(row))) return normalizePhotoTable(raw);
  if (raw.rows.length > PHOTO_LIMITS.maxRows * 2) throw new PhotoError("too-big", "Le tableau lu est beaucoup trop grand.");

  const titles = new Map<number, string>();
  for (const column of Array.isArray(raw.columns) ? raw.columns : []) {
    if (!isRecord(column)) continue;
    const col = columnNumber(column.col);
    if (col !== null && !titles.has(col)) titles.set(col, cellText(column.title));
  }
  // Sans aucun titre de produit, le tableau est inutilisable (et la première ligne de clients serait prise pour les titres).
  if (![...titles.values()].some((title) => title !== "")) {
    const why = typeof raw.message === "string" && raw.message.trim() !== "" ? raw.message.replace(/\s+/g, " ").trim().slice(0, 300) : null;
    throw new PhotoError("no-table", why ?? "Je ne vois pas de tableau lisible sur cette photo.");
  }
  let width = Math.max(...titles.keys()) + 1;

  const clashes: [number, number][] = [];
  const lines = raw.rows.map((row, index) => {
    if (!isRecord(row)) throw new PhotoError("unreadable", "La réponse de la lecture est inutilisable.");
    const cells = new Map<number, string>();
    for (const cell of Array.isArray(row.cells) ? row.cells : []) {
      if (!isRecord(cell)) continue;
      const col = columnNumber(cell.col);
      const text = cellText(cell.text);
      // La colonne 0 est celle du nom de la ligne, déjà donné ; une case vide n'a pas à être listée.
      if (col === null || col === 0 || text === "") continue;
      width = Math.max(width, col + 1);
      const before = cells.get(col);
      if (before === undefined) {
        cells.set(col, text);
      } else {
        cells.set(col, `${before} / ${text}`);
        clashes.push([index + 1, col]);
      }
    }
    return { label: cellText(row.label), cells };
  });

  const rows = [
    Array.from({ length: width }, (_, col) => titles.get(col) ?? ""),
    ...lines.map(({ label, cells }) => Array.from({ length: width }, (_, col) => (col === 0 ? label : (cells.get(col) ?? "")))),
  ];

  // Les numéros de ligne de Gemini ne comptent pas la ligne des titres : on la compte ici (elle est la ligne 0 du tableau complet).
  const uncertain: unknown[] = [...clashes];
  for (const item of Array.isArray(raw.uncertain) ? raw.uncertain : []) {
    const pair = coordinates(item);
    if (pair) uncertain.push([pair[0] + 1, pair[1]]);
  }
  return normalizePhotoTable({ rows, uncertain, message: raw.message });
}
