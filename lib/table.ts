import type { Analysis } from "./analysis";
import { displayValue } from "./labels";
import { checkCell, type CellIssue } from "./rules";
import type { CellValue } from "./types";

/**
 * - empty : vide ou zéro
 * - ok : quantité valide
 * - warn : valeur douteuse à corriger ou confirmer (orange)
 * - kept : valeur douteuse que l'on a choisi de garder
 * - inactive : cellule d'une ligne ou d'une colonne ignorée (grisée)
 */
export type CellTone = "empty" | "ok" | "warn" | "kept" | "inactive";

export interface CellView {
  text: string;
  tone: CellTone;
  issue: CellIssue | null;
}

/** `unsure` : la lecture de la photo n'est pas sûre pour cette case et personne ne l'a encore confirmée ni corrigée (voir `isUnsure`). */
export function cellView(
  value: CellValue,
  analysis: Analysis,
  r: number,
  c: number,
  confirmed: boolean,
  unsure = false,
): CellView {
  const text = displayValue(value);
  if (!analysis.rows[r].active || !analysis.columns[c].active) {
    return { text, tone: "inactive", issue: checkCell(value).issue };
  }
  const { empty, issue } = checkCell(value);
  if (issue !== null) {
    const keep = confirmed && (issue === "decimal" || issue === "too-big");
    return { text, tone: keep ? "kept" : "warn", issue };
  }
  if (unsure) return { text, tone: "warn", issue: "uncertain" };
  return { text, tone: empty ? "empty" : "ok", issue: null };
}
