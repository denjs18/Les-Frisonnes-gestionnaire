import { normalizeKey } from "./text";
import type { CellValue } from "./types";

/** Au-delà, une quantité est considérée comme suspecte (faute de frappe probable). */
export const MAX_QUANTITY = 50;

export type ColumnReason =
  | "empty-header"
  | "formula-header"
  | "number-header"
  | "star"
  | "no-quantity"
  | "manual";

export type RowReason = "total" | "empty-name" | "star" | "no-quantity" | "manual";

/** Problème détecté sur une valeur (affichée en orange à la vérification). */
export type CellIssue = "text" | "decimal" | "negative" | "too-big";

export function hasStar(name: string): boolean {
  return name.includes("*");
}

/** La ligne de totaux du fichier ("TOTAL", "Total ", "Totaux"). */
export function isTotalName(name: string): boolean {
  const key = normalizeKey(name);
  return key === "total" || key === "totaux";
}

export interface CellCheck {
  /** Vrai si la cellule est vide ou égale à 0 (le client est sauté pour ce produit). */
  empty: boolean;
  /** Problème détecté, ou null si la valeur est une quantité valide. */
  issue: CellIssue | null;
}

/**
 * Quantité valide = entier de 0 à 50. Tout le reste est signalé, jamais converti :
 * texte ("3*0,2"), décimal (2,5), négatif, supérieur à 50.
 */
export function checkCell(value: CellValue): CellCheck {
  if (value === null) return { empty: true, issue: null };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { empty: false, issue: "text" };
    if (value < 0) return { empty: false, issue: "negative" };
    if (!Number.isInteger(value)) return { empty: false, issue: "decimal" };
    if (value > MAX_QUANTITY) return { empty: false, issue: "too-big" };
    return { empty: value === 0, issue: null };
  }
  return value.trim() === "" ? { empty: true, issue: null } : { empty: false, issue: "text" };
}

/** Une cellule « compte » si elle contient autre chose que du vide ou un zéro. */
export function hasContent(value: CellValue): boolean {
  if (value === null) return false;
  if (typeof value === "number") return value !== 0;
  return value.trim() !== "";
}

/** Un nombre à virgule ou très grand peut être gardé tel quel après confirmation. */
export function canKeep(issue: CellIssue | null): boolean {
  return issue === "decimal" || issue === "too-big";
}

/**
 * Quantité réellement utilisée pour la préparation.
 * Une valeur douteuse vaut 0 tant qu'elle n'a pas été corrigée ou confirmée.
 */
export function quantityOf(value: CellValue, confirmed: boolean): number {
  if (typeof value !== "number") return 0;
  const { issue } = checkCell(value);
  if (issue === null) return value;
  return confirmed && canKeep(issue) ? value : 0;
}

/** Texte entièrement composé d'un entier ("5") : proposé comme correction en un geste. */
export function cleanIntegerText(value: CellValue): number | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return /^\d{1,6}$/.test(t) ? Number(t) : null;
}
