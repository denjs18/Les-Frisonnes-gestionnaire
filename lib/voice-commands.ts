import { toSpoken, type Alias } from "./speech-text";
import type { Plan, Position } from "./steps";
import { normalizeKey } from "./text";

export type SimpleCommand = "next" | "prev" | "repeat" | "pause" | "resume" | "where";

/** « reprendre à <produit> pour <client> » : le produit et le client tels qu'ils ont été dits. */
export interface GotoTarget {
  product: string;
  client: string | null;
}

export type VoiceCommand = { type: SimpleCommand } | { type: "goto"; target: GotoTarget };

/**
 * Seuls ces mots exacts déclenchent une action (écrits sans accents ni ponctuation).
 * Une phrase qui contient « suivant » au milieu d'autres mots ne fait rien.
 */
const PHRASES: Record<SimpleCommand, string[]> = {
  next: ["suivant", "suivante", "next"],
  prev: ["precedent", "precedente", "retour"],
  repeat: ["repete", "repeter", "repetez", "repeat"],
  pause: ["pause", "stop"],
  resume: ["reprends", "reprend", "reprendre"],
  where: ["ou j en suis", "ou en suis je", "ou on en est", "on en est ou"],
};

export function matchSimpleCommand(transcript: string): SimpleCommand | null {
  const key = normalizeKey(transcript);
  for (const [command, phrases] of Object.entries(PHRASES) as [SimpleCommand, string[]][]) {
    if (phrases.includes(key)) return command;
  }
  return null;
}

const GOTO_PATTERN = /^(?:reprendre|reprends|reprend|aller|allez|va)\s+(?:a|au|aux|sur)\s+(.+)$/;

/** « reprends à yaourt nature pour Nature Champs » -> { product, client }. */
export function parseGoto(transcript: string): GotoTarget | null {
  const match = GOTO_PATTERN.exec(normalizeKey(transcript));
  if (!match) return null;
  const rest = match[1];
  const split = rest.indexOf(" pour ");
  const product = (split < 0 ? rest : rest.slice(0, split)).trim();
  const client = split < 0 ? "" : rest.slice(split + " pour ".length).trim();
  return product === "" ? null : { product, client: client === "" ? null : client };
}

/**
 * Interprète ce que le micro a compris (meilleure hypothèse en premier).
 * Les hypothèses de secours ne servent que si le meilleur texte tient en un ou deux mots :
 * une phrase entière n'est jamais « sauvée » par une alternative.
 */
export function interpretCandidates(candidates: string[]): VoiceCommand | null {
  const [best, ...alternatives] = candidates;
  if (best === undefined) return null;

  const simple = matchSimpleCommand(best);
  if (simple) return { type: simple };
  const goto = parseGoto(best);
  if (goto) return { type: "goto", target: goto };

  if (normalizeKey(best).split(" ").filter(Boolean).length > 2) return null;
  for (const alternative of alternatives) {
    const command = matchSimpleCommand(alternative);
    if (command) return { type: command };
  }
  return null;
}

const STOP_WORDS = new Set(["le", "la", "les", "l", "de", "du", "des", "d", "un", "une", "au", "aux", "a", "et", "pour", "chez"]);

function tokensOf(text: string): string[] {
  return normalizeKey(text)
    .split(" ")
    .filter((token) => token !== "" && !STOP_WORDS.has(token));
}

/**
 * Le candidat désigné par les mots dits ; null si aucun ou si plusieurs conviennent.
 * Un nom qui correspond exactement l'emporte sur un nom qui ne fait que contenir les mots
 * (« fromage » désigne le produit « Fromage » et non « FB », lu « fromage blanc »).
 */
function uniqueMatch<T>(spoken: string, candidates: { item: T; names: string[] }[]): T | null {
  const wanted = tokensOf(spoken);
  if (wanted.length === 0) return null;
  const exact: T[] = [];
  const partial: T[] = [];
  for (const { item, names } of candidates) {
    const sets = names.map((name) => new Set(tokensOf(name)));
    if (sets.some((set) => set.size === wanted.length && wanted.every((word) => set.has(word)))) {
      exact.push(item);
    } else if (sets.some((set) => wanted.every((word) => set.has(word)))) {
      partial.push(item);
    }
  }
  if (exact.length > 0) return exact.length === 1 ? exact[0] : null;
  return partial.length === 1 ? partial[0] : null;
}

/** Retrouve l'étape visée par « reprendre à… pour… » ; null si le produit ou le client est introuvable ou ambigu. */
export function resolveGoto(plan: Plan, target: GotoTarget, aliases: Alias[]): Position | null {
  const product = uniqueMatch(
    target.product,
    plan.products.map((p) => ({ item: p, names: [p.name, toSpoken(p.name, aliases)] })),
  );
  if (!product) return null;
  if (target.client === null) return { colPos: product.colPos, rowPos: null };
  const client = uniqueMatch(
    target.client,
    product.clients.map((c) => ({ item: c, names: [c.name, toSpoken(c.name, aliases)] })),
  );
  return client ? { colPos: product.colPos, rowPos: client.rowPos } : null;
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
