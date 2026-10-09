import {
  canKeep,
  checkCell,
  hasContent,
  hasStar,
  isTotalName,
  type CellIssue,
  type ColumnReason,
  type RowReason,
} from "./rules";
import type { CellValue, ColumnInfo, RowInfo, SheetModel } from "./types";

export type Override = "on" | "off";

/** Partie modifiable d'une préparation : l'import d'origine + ce que l'utilisateur change à la main. */
export interface Worksheet {
  model: SheetModel;
  /** Valeurs de travail (copie modifiable de model.cells). */
  cells: CellValue[][];
  /** Valeurs douteuses que l'utilisateur a choisi de garder telles quelles, clé "ligne:colonne". */
  confirmed: Record<string, true>;
  /** Colonnes réactivées ("on") ou désactivées ("off") à la main, par position. */
  columnOverrides: Record<number, Override>;
  rowOverrides: Record<number, Override>;
}

export interface AnalysisOptions {
  /** Ignorer les produits dont le nom contient une étoile (réglage, activé par défaut). */
  ignoreStar: boolean;
}

export interface ColumnStatus {
  active: boolean;
  reason: ColumnReason | null;
  /** Réactivée à la main malgré une raison de l'ignorer. */
  forced: boolean;
}

export interface RowStatus {
  active: boolean;
  reason: RowReason | null;
  forced: boolean;
}

export interface Issue {
  /** Positions dans model.rows / model.columns. */
  r: number;
  c: number;
  kind: CellIssue;
  value: CellValue;
  confirmed: boolean;
}

export interface Analysis {
  columns: ColumnStatus[];
  rows: RowStatus[];
  activeColumns: number[];
  activeRows: number[];
  /** Valeurs douteuses des lignes et colonnes retenues (confirmées ou non). */
  issues: Issue[];
  /** Celles qui bloquent encore le démarrage. */
  pending: Issue[];
}

export function cellKey(r: number, c: number): string {
  return `${r}:${c}`;
}

/** Point de départ après un import : valeurs de travail = valeurs importées, rien de modifié. */
export function newWorksheet(model: SheetModel): Worksheet {
  return {
    model,
    cells: model.cells.map((row) => [...row]),
    confirmed: {},
    columnOverrides: {},
    rowOverrides: {},
  };
}

export function columnLabel(column: ColumnInfo): string {
  return column.name || `Colonne ${column.letter}`;
}

export function rowLabel(row: RowInfo): string {
  return row.name || `Ligne ${row.number}`;
}

function columnReasonFor(column: ColumnInfo, options: AnalysisOptions): ColumnReason | null {
  switch (column.headerKind) {
    case "empty":
      return "empty-header";
    case "formula":
      return "formula-header";
    case "number":
      return "number-header";
    default:
      return options.ignoreStar && hasStar(column.name) ? "star" : null;
  }
}

function rowReasonFor(row: RowInfo): RowReason | null {
  if (row.name === "") return "empty-name";
  if (isTotalName(row.name)) return "total";
  if (hasStar(row.name)) return "star";
  return null;
}

/**
 * Applique les règles d'exclusion et repère les valeurs douteuses.
 *
 * Une colonne ou une ligne « sans aucune quantité » est ignorée automatiquement,
 * et redevient active dès qu'on y saisit une quantité. Réactiver à la main
 * (override "on") l'emporte sur toutes les raisons automatiques.
 */
export function analyze(ws: Worksheet, options: AnalysisOptions): Analysis {
  const { model, cells } = ws;

  // 1. Règles liées au titre ou au nom (indépendantes des quantités).
  const colReason: (ColumnReason | null)[] = model.columns.map((col, c) => {
    const override = ws.columnOverrides[c];
    if (override === "on") return null;
    if (override === "off") return "manual";
    return columnReasonFor(col, options);
  });
  const rowReason: (RowReason | null)[] = model.rows.map((row, r) => {
    const override = ws.rowOverrides[r];
    if (override === "on") return null;
    if (override === "off") return "manual";
    return rowReasonFor(row);
  });

  const candidateCols = colReason.flatMap((reason, c) => (reason === null ? [c] : []));
  const candidateRows = rowReason.flatMap((reason, r) => (reason === null ? [r] : []));

  // 2. Règle « aucune quantité », calculée sur les candidats restants.
  const columns: ColumnStatus[] = model.columns.map((_, c) => {
    const forced = ws.columnOverrides[c] === "on";
    let reason = colReason[c];
    if (reason === null && !forced && !candidateRows.some((r) => hasContent(cells[r][c]))) {
      reason = "no-quantity";
    }
    return { active: reason === null, reason, forced };
  });
  const rows: RowStatus[] = model.rows.map((_, r) => {
    const forced = ws.rowOverrides[r] === "on";
    let reason = rowReason[r];
    if (reason === null && !forced && !candidateCols.some((c) => hasContent(cells[r][c]))) {
      reason = "no-quantity";
    }
    return { active: reason === null, reason, forced };
  });

  const activeColumns = columns.flatMap((status, c) => (status.active ? [c] : []));
  const activeRows = rows.flatMap((status, r) => (status.active ? [r] : []));

  // 3. Valeurs douteuses, seulement sur les lignes et colonnes retenues.
  const issues: Issue[] = [];
  for (const r of activeRows) {
    for (const c of activeColumns) {
      const value = cells[r][c];
      const { issue } = checkCell(value);
      if (issue === null) continue;
      issues.push({
        r,
        c,
        kind: issue,
        value,
        confirmed: Boolean(ws.confirmed[cellKey(r, c)]) && canKeep(issue) && typeof value === "number",
      });
    }
  }

  return {
    columns,
    rows,
    activeColumns,
    activeRows,
    issues,
    pending: issues.filter((issue) => !issue.confirmed),
  };
}
