import { formatQuantity } from "./format";
import { MAX_QUANTITY, type CellIssue, type ColumnReason, type RowReason } from "./rules";
import type { CellValue } from "./types";
import type { ListenerStatus } from "./voice/listener";

export type MicTone = "ok" | "muted" | "warn" | "danger";

export interface MicDescription {
  label: string;
  tone: MicTone;
  /** Explication à afficher quand quelque chose ne va pas. */
  hint: string | null;
  /** Le micro est allumé (même si l'écoute est brièvement coupée pendant que l'appli parle). */
  on: boolean;
  /** Écoute en cours à cet instant. */
  listening: boolean;
}

/** Ce que l'on dit à l'utilisateur sur l'état du micro. */
export function describeMic(status: ListenerStatus): MicDescription {
  switch (status) {
    case "listening":
      return { label: "Micro actif", tone: "ok", hint: null, on: true, listening: true };
    case "starting":
    case "suspended":
      return { label: "Micro actif", tone: "ok", hint: null, on: true, listening: false };
    case "off":
      return { label: "Micro inactif", tone: "muted", hint: null, on: false, listening: false };
    case "unsupported":
      return {
        label: "Micro indisponible",
        tone: "warn",
        hint: "Ce navigateur ne sait pas écouter la voix. Utilisez les gros boutons.",
        on: false,
        listening: false,
      };
    case "denied":
      return {
        label: "Micro refusé",
        tone: "danger",
        hint: "Autorisez le micro pour ce site dans les réglages du navigateur, puis touchez le badge pour réessayer. Les boutons fonctionnent sans micro.",
        on: false,
        listening: false,
      };
    case "no-mic":
      return {
        label: "Micro introuvable",
        tone: "danger",
        hint: "Aucun micro utilisable n'a été trouvé. Utilisez les gros boutons.",
        on: false,
        listening: false,
      };
    case "network":
      return {
        label: "Écoute impossible",
        tone: "warn",
        hint: "La reconnaissance vocale du navigateur a besoin d'une connexion Internet. Touchez le badge pour réessayer.",
        on: false,
        listening: false,
      };
    case "error":
      return {
        label: "Micro instable",
        tone: "warn",
        hint: "L'écoute s'interrompt sans cesse. Touchez le badge pour réessayer, ou utilisez les gros boutons.",
        on: false,
        listening: false,
      };
  }
}

/** `short` tient dans l'en-tête du tableau ; `long` explique en une phrase. */
interface ReasonText {
  short: string;
  long: string;
}

export const COLUMN_REASONS: Record<ColumnReason, ReasonText> = {
  star: { short: "marqué *", long: "Le nom du produit contient une étoile (*)." },
  "empty-header": { short: "sans titre", long: "Cette colonne n'a pas de titre en ligne 1 (des notes ?)." },
  "formula-header": { short: "formule", long: "Le titre est une formule (par exemple un total de poids)." },
  "number-header": { short: "nombre", long: "Le titre est un nombre (par exemple un total)." },
  "no-quantity": {
    short: "sans quantité",
    long: "Aucune quantité dans cette colonne. Saisissez-en une dans le tableau pour l'utiliser.",
  },
  manual: { short: "désactivé", long: "Vous l'avez désactivé à la main." },
};

export const ROW_REASONS: Record<RowReason, ReasonText> = {
  total: { short: "total", long: "C'est la ligne des totaux du fichier." },
  "empty-name": { short: "sans nom", long: "Cette ligne n'a pas de nom de client." },
  star: { short: "marqué *", long: "Le nom contient une étoile (*)." },
  "no-quantity": {
    short: "sans quantité",
    long: "Rien à préparer pour ce client dans les produits retenus. Saisissez une quantité dans le tableau pour l'utiliser.",
  },
  manual: { short: "désactivé", long: "Vous l'avez désactivée à la main." },
};

/** Une raison automatique « sans quantité » disparaît toute seule dès qu'on saisit une quantité : rien à réactiver. */
export function canReactivate(reason: ColumnReason | RowReason): boolean {
  return reason !== "no-quantity";
}

/** Texte brut d'une valeur de cellule, pour l'affichage. */
export function displayValue(value: CellValue): string {
  if (value === null) return "";
  return typeof value === "number" ? formatQuantity(value) : value;
}

/** Explication, pour une valeur douteuse, de ce qui ne va pas et de ce qu'on peut faire. */
export function issueMessage(issue: CellIssue, value: CellValue): string {
  const shown = displayValue(value);
  switch (issue) {
    case "text":
      return `« ${shown} » n'est pas un nombre. Tapez la quantité à préparer, ou mettez 0 pour sauter ce client.`;
    case "decimal":
      return `${shown} n'est pas un nombre entier. Corrigez-le, ou gardez-le tel quel si c'est voulu.`;
    case "negative":
      return `${shown} est négatif. Tapez la bonne quantité, ou mettez 0 pour sauter ce client.`;
    case "too-big":
      return `${shown} dépasse ${MAX_QUANTITY} : est-ce bien la bonne quantité ?`;
  }
}
