import { cleanText } from "./text";
import type { CellValue, HeaderKind, RawCell, RawGrid, SheetModel } from "./types";

type MaybeCell = RawCell | null | undefined;

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function columnLetter(index: number): string {
  let n = index;
  let letter = "";
  do {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letter;
}

/** Texte d'un nom ou d'un en-tête : nettoyé, "" si absent. */
function textOf(cell: MaybeCell): string {
  if (!cell || cell.value === null) return "";
  return typeof cell.value === "number" ? String(cell.value) : cleanText(cell.value);
}

/** Valeur d'une cellule de données : une formule n'est jamais une quantité. */
function bodyValue(cell: MaybeCell): CellValue {
  if (!cell || cell.formula || cell.value === null) return null;
  if (typeof cell.value === "number") return Number.isFinite(cell.value) ? cell.value : null;
  const text = cleanText(cell.value);
  return text === "" ? null : text;
}

function headerKind(cell: MaybeCell): HeaderKind {
  if (!cell) return "empty";
  if (cell.formula) return "formula";
  if (cell.value === null) return "empty";
  if (typeof cell.value === "number") return "number";
  return cleanText(cell.value) === "" ? "empty" : "text";
}

/**
 * Transforme le tableau brut en modèle.
 *
 * On garde toutes les colonnes et lignes « candidates » (celles qui ont un titre
 * ou au moins une valeur), dans l'ordre du fichier : le filtrage (colonnes à *,
 * ligne TOTAL…) est fait ensuite par `analyze`, pour que tout reste réactivable.
 */
export function buildModel(grid: RawGrid, fileName: string): SheetModel {
  const rows = grid.rows;
  const header = rows[0] ?? [];
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const columnIdx: number[] = [];
  for (let c = 1; c < width; c++) {
    const kind = headerKind(header[c]);
    const hasData = rows.slice(1).some((row) => bodyValue(row?.[c]) !== null);
    if (kind === "empty" && !hasData) continue;
    columnIdx.push(c);
  }

  const rowIdx: number[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const hasName = textOf(row[0]) !== "";
    const hasData = columnIdx.some((c) => bodyValue(row[c]) !== null);
    if (hasName || hasData) rowIdx.push(r);
  }

  return {
    fileName,
    sheetName: grid.sheetName,
    columns: columnIdx.map((c) => {
      const kind = headerKind(header[c]);
      return {
        letter: columnLetter(c),
        name: kind === "formula" ? "" : textOf(header[c]),
        headerKind: kind,
      };
    }),
    rows: rowIdx.map((r) => ({ number: r + 1, name: textOf(rows[r]?.[0]) })),
    cells: rowIdx.map((r) => columnIdx.map((c) => bodyValue(rows[r]?.[c]))),
  };
}
