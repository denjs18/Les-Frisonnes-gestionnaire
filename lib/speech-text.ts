import { formatQuantity } from "./format";
import type { Step } from "./steps";

/** Une règle de prononciation : le texte du fichier -> ce qu'il faut dire. */
export interface Alias {
  from: string;
  to: string;
}

export const DEFAULT_ALIASES: Alias[] = [
  { from: "FB", to: "fromage blanc" },
  { from: "TartiAil", to: "tarti ail" },
  { from: "pamp", to: "pamplemousse" },
  { from: "SPDC", to: "S P D C" },
  { from: "TN", to: "T N" },
];

const LETTER_OR_DIGIT = "\\p{L}\\p{N}";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remplace chaque alias, en mot entier, sans tenir compte des majuscules ni des accents de casse. */
function applyAliases(text: string, aliases: Alias[]): string {
  const usable = aliases
    .map((a) => ({ from: a.from.trim(), to: a.to.trim() }))
    .filter((a) => a.from !== "")
    .sort((a, b) => b.from.length - a.from.length);
  let out = text;
  for (const alias of usable) {
    const pattern = new RegExp(
      `(^|[^${LETTER_OR_DIGIT}])${escapeRegExp(alias.from)}(?![${LETTER_OR_DIGIT}])`,
      "giu",
    );
    out = out.replace(pattern, (_match, before: string) => `${before}${alias.to}`);
  }
  return out;
}

function isPlural(value: string): boolean {
  return parseFloat(value.replace(",", ".")) >= 2;
}

function unit(pattern: string, singular: string, plural: string) {
  return {
    regex: new RegExp(`(\\d+(?:,\\d+)?)\\s*(?:${pattern})(?![${LETTER_OR_DIGIT}])`, "giu"),
    replace: (_m: string, value: string) => `${value} ${isPlural(value) ? plural : singular}`,
  };
}

const UNITS = [
  unit("kilogrammes?|kilos?|kg", "kilo", "kilos"),
  unit("centilitres?|cl", "centilitre", "centilitres"),
  unit("millilitres?|ml", "millilitre", "millilitres"),
  unit("litres?|l", "litre", "litres"),
  unit("grammes?|gr|g", "gramme", "grammes"),
];

/**
 * Rend un nom de produit ou de client lisible à voix haute :
 * alias de l'utilisateur, « 0.5L » -> « 0,5 litre », « +6l » -> « plus 6 litres »…
 */
export function toSpoken(name: string, aliases: Alias[]): string {
  let text = applyAliases(name, aliases);
  text = text.replace(/(\d)\.(\d)/g, "$1,$2");
  text = text.replace(/\+/g, " plus ").replace(/&/g, " et ");
  text = text.replace(/[/()_*]/g, " ");
  for (const { regex, replace } of UNITS) text = text.replace(regex, replace);
  return text.replace(/\s+/g, " ").trim();
}

/** La phrase dictée pour une étape : « 38 yaourt nature 0,5 litre » ou « 4 pour Nature Champs ». */
export function stepSentence(step: Step, aliases: Alias[]): string {
  const quantity = formatQuantity(step.quantity);
  if (step.kind === "total") return `${quantity} ${toSpoken(step.productName, aliases)}`;
  return `${quantity} pour ${toSpoken(step.clientName ?? "", aliases)}`;
}

/** Réponse à « où j'en suis ». */
export function whereSentence(step: Step, aliases: Alias[]): string {
  return (
    `Produit ${step.productNumber} sur ${step.productCount}, ${toSpoken(step.productName, aliases)}. ` +
    `Étape ${step.stepNumber} sur ${step.stepCount} : ${stepSentence(step, aliases)}.`
  );
}

/** Plusieurs produits (ou clients) correspondent à ce qui a été dit : on en cite trois au plus et on demande de préciser. */
export function ambiguousSentence(noun: "produits" | "clients", names: string[], aliases: Alias[]): string {
  const shown = names.slice(0, 3).map((name) => toSpoken(name, aliases));
  const more = names.length > shown.length ? " et d'autres" : "";
  return `Plusieurs ${noun} correspondent : ${shown.join(", ")}${more}. Précisez.`;
}

/** Réponse à « aller à » sans rien d'autre : un exemple à dire. */
export const GOTO_HELP_SENTENCE =
  "Dites par exemple : reprends à fromage blanc, ou : reprends à fromage blanc pour Biocité. Vous pouvez aussi dire : produit 5.";
