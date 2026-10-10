import { analyze, newWorksheet, type Analysis, type AnalysisOptions, type Worksheet } from "@/lib/analysis";
import { buildModel } from "@/lib/grid";
import type { RawCell, RawGrid } from "@/lib/types";

/** Contenu d'une cellule dans un test : texte, nombre, vide (null) ou formule. */
export type Spec = string | number | null | { formula: true; value: string | number | null };

/** Une cellule contenant une formule (avec, éventuellement, son résultat en cache). */
export const F = (value: string | number | null = null): Spec => ({ formula: true, value });

function toCell(spec: Spec): RawCell | null {
  if (spec === null) return null;
  if (typeof spec === "object") return { value: spec.value, formula: true };
  return { value: spec, formula: false };
}

export function grid(rows: Spec[][], sheetName = "Feuille"): RawGrid {
  return { sheetName, rows: rows.map((row) => row.map(toCell)) };
}

export function sheetOf(rows: Spec[][]): Worksheet {
  return newWorksheet(buildModel(grid(rows), "test.xlsx"));
}

const DEFAULT_OPTIONS: AnalysisOptions = { ignoreStar: true };

export function run(ws: Worksheet, options: AnalysisOptions = DEFAULT_OPTIONS): Analysis {
  return analyze(ws, options);
}

/** Noms des colonnes (ou lignes) aux positions données. */
export function names(ws: Worksheet, kind: "columns" | "rows", positions: number[]): string[] {
  return positions.map((p) => ws.model[kind][p].name);
}

/** Position d'une colonne par son nom. */
export function col(ws: Worksheet, name: string): number {
  const i = ws.model.columns.findIndex((c) => c.name === name);
  if (i < 0) throw new Error(`Colonne introuvable : ${name}`);
  return i;
}

/** Position d'une ligne par son nom. */
export function row(ws: Worksheet, name: string): number {
  const i = ws.model.rows.findIndex((r) => r.name === name);
  if (i < 0) throw new Error(`Ligne introuvable : ${name}`);
  return i;
}

/** Un petit tableau réaliste, avec chaque cas d'exclusion. */
export function sampleRows(): Spec[][] {
  return [
    ["Nom", "Fromage", "Bleu *", "Yaourt ", F(12.5), null],
    ["TOTAL", F(3), F(5), F(8), null, null],
    ["Alice ", 2, 1, 3, F(9), "une note"],
    ["Bob", null, 4, 5, null, null],
    ["Chloé*", 1, 1, 1, null, null],
    [null, null, null, 7, null, null],
    ["Dan", null, null, null, null, null],
    [null, null, null, null, F(1), null],
  ];
}

/**
 * La réponse de Gemini pour un tableau donné en lignes de cellules : les colonnes numérotées, puis pour chaque ligne seulement ses
 * cases non vides (la forme « creuse » demandée par `PHOTO_PROMPT`). `uncertain` compte les lignes à partir du tableau complet
 * (titres = ligne 0), comme `PhotoTable` ; la réponse de Gemini, elle, ne compte pas la ligne des titres.
 */
export function sparseAnswer(rows: string[][], uncertain: [number, number][] = [], message = "") {
  const [header, ...body] = rows;
  return {
    columns: header.map((title, col) => ({ col, title })),
    rows: body.map((row) => ({
      label: row[0],
      cells: row.flatMap((text, col) => (col > 0 && text !== "" ? [{ col, text }] : [])),
    })),
    uncertain: uncertain.map(([row, col]) => ({ row: row - 1, col })),
    message,
  };
}
