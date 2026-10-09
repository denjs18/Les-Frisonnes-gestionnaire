import { toSpoken, type Alias } from "./speech-text";
import type { Plan, Position, ProductPlan } from "./steps";
import { normalizeKey } from "./text";

export type SimpleCommand = "next" | "prev" | "repeat" | "pause" | "resume" | "where";

/**
 * Où aller, tel que cela a été dit : « reprendre à <produit> pour <client> », « reprends à Biocité »
 * (un client du produit en cours), « produit 5 », « étape 3 », « reprends au début ».
 */
export interface GotoTarget {
  /** Les mots dits pour le produit (ou, quand rien d'autre ne convient, pour un client du produit en cours). */
  product: string;
  client: string | null;
  /** « produit 5 » : le numéro affiché en haut de l'écran. */
  productNumber?: number;
  /** « étape 3 » : dans le produit en cours. */
  stepNumber?: number;
  /** « reprends au début ». */
  start?: boolean;
}

export type VoiceCommand = { type: SimpleCommand } | { type: "goto"; target: GotoTarget } | { type: "gotoHelp" };

/**
 * Seuls ces mots exacts déclenchent une action (écrits sans accents ni ponctuation).
 * Une phrase qui contient « suivant » au milieu d'autres mots ne fait rien.
 * `main` : les mots donnés dans l'aide ; `extra` : des variantes tolérées, qui servent peu et qu'un bruit de fond
 * (« stop », « retour », de l'anglais à la radio…) déclenche trop facilement : elles sont écartées en sensibilité réduite.
 */
const PHRASES: Record<SimpleCommand, { main: string[]; extra: string[] }> = {
  next: { main: ["suivant"], extra: ["suivante", "next"] },
  prev: { main: ["precedent"], extra: ["precedente", "retour"] },
  repeat: { main: ["repete", "repeter"], extra: ["repetez", "repeat"] },
  pause: { main: ["pause"], extra: ["stop"] },
  resume: { main: ["reprends", "reprendre"], extra: ["reprend"] },
  where: { main: ["ou j en suis"], extra: ["ou en suis je", "ou on en est", "on en est ou"] },
};

export interface InterpretOptions {
  /** Sensibilité réduite : seuls les mots principaux comptent (pas « stop », « retour », « next »…). */
  strict?: boolean;
}

export function matchSimpleCommand(transcript: string, options: InterpretOptions = {}): SimpleCommand | null {
  const key = normalizeKey(transcript);
  for (const [command, phrases] of Object.entries(PHRASES) as [SimpleCommand, (typeof PHRASES)[SimpleCommand]][]) {
    if (phrases.main.includes(key) || (!options.strict && phrases.extra.includes(key))) return command;
  }
  return null;
}

const NUMBER_UNITS: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
};
const NUMBER_TENS: Record<string, number> = { vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

/** « 5 », « cinq », « vingt et un », « dix-sept », « quatre-vingt-dix » : un nombre de 1 à 99 ; sinon null. */
export function parseSpokenNumber(text: string): number | null {
  const key = normalizeKey(text);
  if (/^\d{1,2}$/.test(key)) return Number(key) > 0 ? Number(key) : null;
  const words = key.split(" ").filter((word) => word !== "" && word !== "et");
  if (words.length === 0) return null;

  let total = 0;
  let i = 0;
  if (words[0] === "quatre" && (words[1] === "vingt" || words[1] === "vingts")) {
    total = 80;
    i = 2;
  } else if (words[0] in NUMBER_TENS) {
    total = NUMBER_TENS[words[0]];
    i = 1;
  }
  const rest = words.slice(i);
  let value = 0;
  if (rest.length === 0) {
    if (total === 0) return null;
  } else if (rest.length === 1 && rest[0] in NUMBER_UNITS) {
    value = NUMBER_UNITS[rest[0]];
  } else if (rest.length === 2 && rest[0] === "dix" && ["sept", "huit", "neuf"].includes(rest[1])) {
    value = 10 + NUMBER_UNITS[rest[1]]; // dix-sept… ; soixante-dix-sept…
  } else {
    return null;
  }
  const result = total + value;
  // « vingt dix » ou « soixante quinze » n'existent pas (ni plus de 99).
  if (result < 1 || result > 99) return null;
  if (total > 0 && total !== 60 && total !== 80 && value >= 10) return null;
  return result;
}

const GOTO_VERB =
  "(?:reprendre|reprends|reprend|reprenez|reviens|revenez|revenir|retourne|retournez|retourner|va|vas|aller|allez|passe|passez|passer|saute|sautez|sauter|direction)";
const GOTO_PREPOSITION = "(?:a|au|aux|sur|vers|chez)";
const GOTO_PATTERN = new RegExp(`^${GOTO_VERB}\\s+${GOTO_PREPOSITION}\\s+(.+)$`);
const GOTO_BARE_PATTERN = new RegExp(`^${GOTO_VERB}\\s+${GOTO_PREPOSITION}$`);
const NUMBERED_PATTERN = /^(?:le |la |l )?(produit|numero|etape)\s+(.+)$/;
const START_PATTERN = /^(?:le )?(?:debut|premier produit|premiere etape)$/;
const CLIENT_SEPARATOR = /\s(?:pour|chez|avec)\s/;

function parseTarget(rest: string, hasVerb: boolean): GotoTarget | null {
  const separator = CLIENT_SEPARATOR.exec(rest);
  const productPart = (separator ? rest.slice(0, separator.index) : rest).trim();
  const clientPart = separator ? rest.slice(separator.index + separator[0].length).trim() : "";
  const client = clientPart === "" ? null : clientPart;

  const numbered = NUMBERED_PATTERN.exec(productPart);
  if (numbered) {
    const number = parseSpokenNumber(numbered[2].replace(/^numero\s+/, ""));
    if (number !== null) {
      return numbered[1] === "etape"
        ? { product: "", client: null, stepNumber: number }
        : { product: "", client, productNumber: number };
    }
  }
  // Sans verbe, seuls « produit 5 » et « étape 3 » sont des commandes.
  if (!hasVerb) return null;
  if (START_PATTERN.test(productPart)) return { product: "", client: null, start: true };
  return productPart === "" ? null : { product: productPart, client };
}

/** « reprends à yaourt nature pour Nature Champs », « produit 5 », « étape 3 » -> ce qui a été demandé. */
export function parseGoto(transcript: string): GotoTarget | null {
  const key = normalizeKey(transcript);
  const match = GOTO_PATTERN.exec(key);
  return parseTarget(match ? match[1] : key, match !== null);
}

/**
 * Interprète ce que le micro a compris (meilleure hypothèse en premier).
 * Les hypothèses de secours ne servent que si le meilleur texte tient en un ou deux mots :
 * une phrase entière n'est jamais « sauvée » par une alternative.
 */
export function interpretCandidates(candidates: string[], options: InterpretOptions = {}): VoiceCommand | null {
  const [best, ...alternatives] = candidates;
  if (best === undefined) return null;

  const simple = matchSimpleCommand(best, options);
  if (simple) return { type: simple };
  const goto = parseGoto(best);
  if (goto) return { type: "goto", target: goto };
  if (GOTO_BARE_PATTERN.test(normalizeKey(best))) return { type: "gotoHelp" };

  if (normalizeKey(best).split(" ").filter(Boolean).length > 2) return null;
  for (const alternative of alternatives) {
    const command = matchSimpleCommand(alternative, options);
    if (command) return { type: command };
  }
  return null;
}

const STOP_WORDS = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "un", "une", "au", "aux", "a", "et", "pour", "chez"]);
const DIGIT_WORDS: Record<string, string> = { zero: "0", deux: "2", trois: "3", quatre: "4", cinq: "5", six: "6", sept: "7", huit: "8", neuf: "9", dix: "10" };

/** Le pluriel ne compte pas : « yaourts » = « yaourt ». */
function singular(word: string): string {
  return word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word;
}

/**
 * Les mots qui comptent dans un nom : sans petits mots, sans pluriel, chiffres en chiffres
 * (« quatre saisons » = « 4 saisons », « zéro virgule cinq » = « 0,5 »).
 */
function tokensOf(text: string): string[] {
  const words = normalizeKey(text)
    .split(" ")
    .filter((word) => word !== "");
  const tokens: string[] = [];
  words.forEach((word, index) => {
    if (word === "virgule") return;
    // « fromage blanc un » : un nombre quand c'est le dernier mot, sinon l'article « un ».
    if ((word === "un" || word === "une") && index === words.length - 1 && words.length > 1) {
      tokens.push("1");
      return;
    }
    if (STOP_WORDS.has(word)) return;
    tokens.push(singular(DIGIT_WORDS[word] ?? word));
  });
  return tokens;
}

function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[b.length];
}

type Match<T> = { kind: "one"; item: T } | { kind: "many"; items: T[] } | { kind: "none" };

function outcome<T>(items: T[]): Match<T> | null {
  if (items.length === 0) return null;
  return items.length === 1 ? { kind: "one", item: items[0] } : { kind: "many", items };
}

/**
 * Les candidats désignés par les mots dits, du plus sûr au moins sûr ; le premier niveau qui trouve quelque chose décide :
 * 1. les mêmes mots (« fromage » désigne le produit « Fromage » et non « FB », lu « fromage blanc ») ;
 * 2. les mêmes lettres, mots coupés ou collés autrement (« bio cité » = « Biocité ») ;
 * 3. tous les mots dits se retrouvent dans le nom (« amap amboise » dans « Amap Amboise plus 6 litres ») ;
 * 4. à une ou deux lettres près (le micro a mal entendu : « déclic » pour « Declik »).
 */
function matchNames<T>(spoken: string, candidates: { item: T; names: string[] }[]): Match<T> {
  const wanted = tokensOf(spoken);
  if (wanted.length === 0) return { kind: "none" };
  const wantedJoined = wanted.join("");
  const exact: T[] = [];
  const joined: T[] = [];
  const partial: T[] = [];
  const close: { item: T; gap: number }[] = [];

  for (const { item, names } of candidates) {
    const tokenLists = names.map(tokensOf).filter((tokens) => tokens.length > 0);
    if (tokenLists.some((tokens) => tokens.length === wanted.length && wanted.every((word) => tokens.includes(word)))) {
      exact.push(item);
    } else if (tokenLists.some((tokens) => tokens.join("") === wantedJoined)) {
      joined.push(item);
    } else if (tokenLists.some((tokens) => wanted.every((word) => tokens.includes(word)))) {
      partial.push(item);
    } else {
      const gap = Math.min(...tokenLists.map((tokens) => distance(wantedJoined, tokens.join(""))), Infinity);
      const longest = Math.max(wantedJoined.length, ...tokenLists.map((tokens) => tokens.join("").length));
      if (longest >= 5 && gap <= Math.floor(longest * 0.2)) close.push({ item, gap });
    }
  }

  const found = outcome(exact) ?? outcome(joined) ?? outcome(partial);
  if (found) return found;
  const best = Math.min(...close.map((entry) => entry.gap), Infinity);
  return outcome(close.filter((entry) => entry.gap === best).map((entry) => entry.item)) ?? { kind: "none" };
}

export type GotoResolution =
  | { kind: "found"; position: Position }
  | { kind: "ambiguous"; noun: "produits" | "clients"; names: string[] }
  | { kind: "missing" };

const MISSING: GotoResolution = { kind: "missing" };

const found = (position: Position): GotoResolution => ({ kind: "found", position });

function nameOptions(product: ProductPlan, aliases: Alias[]) {
  return { item: product, names: [product.name, toSpoken(product.name, aliases)] };
}

/** Retrouve l'étape visée ; dit s'il y a plusieurs possibilités (« fromage blanc » : FB 0,5 ou FB 1 ?) ou aucune. */
export function resolveGotoDetailed(plan: Plan, target: GotoTarget, aliases: Alias[], current: Position | null = null): GotoResolution {
  if (plan.products.length === 0) return MISSING;
  const currentProduct = plan.products.find((product) => product.colPos === current?.colPos) ?? plan.products[0];

  if (target.start) return found({ colPos: plan.products[0].colPos, rowPos: null });

  if (target.stepNumber !== undefined) {
    const number = target.stepNumber;
    if (number === 1) return found({ colPos: currentProduct.colPos, rowPos: null });
    const client = currentProduct.clients[number - 2];
    return client ? found({ colPos: currentProduct.colPos, rowPos: client.rowPos }) : MISSING;
  }

  const within = (product: ProductPlan, spokenClient: string | null): GotoResolution => {
    if (spokenClient === null) return found({ colPos: product.colPos, rowPos: null });
    const match = matchNames(
      spokenClient,
      product.clients.map((client) => ({ item: client, names: [client.name, toSpoken(client.name, aliases)] })),
    );
    if (match.kind === "one") return found({ colPos: product.colPos, rowPos: match.item.rowPos });
    if (match.kind === "many") return { kind: "ambiguous", noun: "clients", names: match.items.map((client) => client.name) };
    return MISSING;
  };

  if (target.productNumber !== undefined) {
    const product = plan.products[target.productNumber - 1];
    return product ? within(product, target.client) : MISSING;
  }

  const products = matchNames(target.product, plan.products.map((product) => nameOptions(product, aliases)));
  if (products.kind === "one") return within(products.item, target.client);
  if (products.kind === "many") {
    if (target.client === null) return { kind: "ambiguous", noun: "produits", names: products.items.map((product) => product.name) };
    // Plusieurs produits conviennent : le client dit peut n'en acheter qu'un seul.
    const buying = products.items.filter((product) => within(product, target.client).kind !== "missing");
    if (buying.length === 1) return within(buying[0], target.client);
    return buying.length === 0 ? MISSING : { kind: "ambiguous", noun: "produits", names: buying.map((product) => product.name) };
  }

  // Aucun produit ne porte ce nom : « reprends à Biocité » vise un client du produit en cours.
  if (target.client === null) return within(currentProduct, target.product);
  return MISSING;
}

/** Comme `resolveGotoDetailed`, mais ne rend que l'étape trouvée (null si introuvable ou ambigu). */
export function resolveGoto(plan: Plan, target: GotoTarget, aliases: Alias[], current: Position | null = null): Position | null {
  const result = resolveGotoDetailed(plan, target, aliases, current);
  return result.kind === "found" ? result.position : null;
}

/** Délai anti-rebond : une commande est ignorée si une autre vient d'être exécutée. */
export class CommandGate {
  private last = Number.NEGATIVE_INFINITY;

  constructor(private readonly cooldownMs = 1500) {}

  /** Vrai si la commande peut s'exécuter maintenant (et mémorise l'instant). */
  allow(now: number): boolean {
    if (now - this.last < this.cooldownMs) return false;
    this.last = now;
    return true;
  }

  reset(): void {
    this.last = Number.NEGATIVE_INFINITY;
  }
}
