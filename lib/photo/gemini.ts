import { normalizeSparseTable } from "./normalize";
import { PHOTO_PROMPT, PHOTO_RESPONSE_SCHEMA } from "./prompt";
import { PhotoError, type PhotoReadResponse, type PhotoTable } from "./types";

/**
 * Les modèles essayés l'un après l'autre. Google en retire régulièrement (les « 2.5 » ne sont déjà plus offerts aux nouveaux
 * comptes) et l'offre gratuite plafonne chaque modèle séparément (20 demandes par jour) : on passe donc au suivant quand
 * un modèle est saturé, épuisé ou retiré. Le dernier est un alias que Google tient à jour.
 *
 * L'ordre vient d'essais sur un tableau de la taille du vrai (37 clients × 22 produits, 874 cases) : le 3.7 se trompe sur 2,5 % des
 * cases, le 3.8 autant mais bien plus lentement (une minute, aux essais), le 3.6 sur 5,5 %, le 3.5 sur 19 % ; le 3 preview est le plus
 * rapide (9 s) mais très irrégulier avec l'ancienne forme de réponse. Les derniers ne servent que de secours.
 */
export const DEFAULT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3-flash-preview",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

/** La variable GEMINI_MODEL peut remplacer la liste (modèles séparés par des virgules). */
export function parseModelList(value: string | undefined): string[] {
  const models = (value ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter((model) => /^[\w.\-]+$/.test(model));
  return models.length > 0 ? models : DEFAULT_MODELS;
}

export interface ReadOptions {
  apiKey: string;
  models?: string[];
  fetchImpl?: typeof fetch;
  /** Durée totale maximale (ms) : la fonction de Vercel s'arrête à 60 s. */
  budgetMs?: number;
  /** Durée maximale d'un essai avec un modèle (ms) : un grand tableau demande jusqu'à 20 ou 25 s. */
  attemptMs?: number;
  /**
   * Délai pour recevoir le début de la réponse (ms). Un modèle saturé reste parfois muet pendant une minute : mieux vaut passer
   * au suivant au bout de quelques secondes que d'attendre toute la durée d'un essai. Une fois la réponse commencée, elle a
   * jusqu'à la fin de l'essai pour arriver.
   */
  firstByteMs?: number;
  now?: () => number;
}

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Le corps de la demande : la consigne, la photo, un résultat JSON strict, et très peu de réflexion (rapide, et aussi juste dans nos essais). */
export function buildRequest(imageBase64: string, mimeType: string, withThinking: boolean) {
  return {
    contents: [{ role: "user", parts: [{ text: PHOTO_PROMPT }, { inline_data: { mime_type: mimeType, data: imageBase64 } }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: PHOTO_RESPONSE_SCHEMA,
      ...(withThinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
    },
  };
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function errorMessage(body: unknown): string {
  const message = (body as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === "string" ? message : "";
}

class Transient extends Error {
  constructor(
    readonly kind: "quota" | "busy" | "gone" | "upstream" | "rejected" | "garbled",
    message: string,
  ) {
    super(message);
  }
}

const isAbort = (error: unknown) => ["TimeoutError", "AbortError"].includes((error as { name?: string } | null)?.name ?? "");

/** Ce qu'une erreur renvoyée par Google (en-tête de réponse, ou événement en cours de route) change pour la suite. */
function failureFor(model: string, status: number, message: string): Transient | PhotoError {
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(message))) {
    return new PhotoError("bad-key", "La clé Gemini est refusée par Google.");
  }
  if (status === 400) {
    // Un modèle qui ne connaît pas le réglage de réflexion : on le redemandera sans (voir readTableFromPhoto).
    if (/thinking/i.test(message)) return new Transient("upstream", "thinking");
    // Soit la photo, soit ce modèle-ci refuse la demande : on essaie le suivant (l'échec se répète si c'est la photo, voir plus bas).
    return new Transient("rejected", `${model} : demande refusée`);
  }
  if (status === 404) return new Transient("gone", `${model} : modèle retiré`);
  if (status === 429) return new Transient("quota", `${model} : quota atteint`);
  return new Transient(status >= 500 ? "busy" : "upstream", `${model} : erreur ${status}`);
}

/** Le texte contenu dans un événement de la réponse en continu (une ou plusieurs lignes « data: {...} »). */
function textOfEvent(model: string, event: string): string {
  let text = "";
  for (const line of event.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (payload === "" || payload === "[DONE]") continue;
    let chunk: unknown;
    try {
      chunk = JSON.parse(payload);
    } catch {
      throw new Transient("garbled", `${model} : réponse illisible`);
    }
    const error = (chunk as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    if (error) throw failureFor(model, typeof error.code === "number" ? error.code : 500, typeof error.message === "string" ? error.message : "");
    const parts = (chunk as { candidates?: { content?: { parts?: { text?: unknown; thought?: unknown }[] } }[] } | null)?.candidates?.[0]?.content?.parts;
    for (const part of parts ?? []) if (part.thought !== true && typeof part.text === "string") text += part.text;
  }
  return text;
}

/**
 * Demande la lecture à un modèle et renvoie le texte de sa réponse, reçu en continu : on voit ainsi tout de suite si le modèle
 * répond (début de réponse avant `firstByteMs`) ou s'il est muet, et on ne l'attend pas inutilement.
 */
async function ask(model: string, body: unknown, key: string, fetchImpl: typeof fetch, totalMs: number, firstByteMs: number): Promise<string> {
  const controller = new AbortController();
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), Math.max(1, ms));
  };
  arm(Math.min(firstByteMs, totalMs));
  try {
    let response: Response;
    try {
      response = await fetchImpl(`${ENDPOINT}/${model}:streamGenerateContent?alt=sse`, {
        method: "POST",
        // La clé voyage dans l'en-tête, jamais dans l'adresse (les adresses se retrouvent dans les journaux).
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new Transient(isAbort(error) ? "busy" : "upstream", `${model} : pas de réponse`);
    }

    if (!response.ok) {
      const json: unknown = await response.json().catch(() => null);
      throw failureFor(model, response.status, errorMessage(json));
    }
    if (!response.body) throw new Transient("upstream", `${model} : réponse vide`);

    const reader = response.body.getReader();
    // Quand le délai est dépassé, on ferme aussi la lecture : tous les `fetch` n'interrompent pas d'eux-mêmes un corps de réponse.
    controller.signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), { once: true });
    const decoder = new TextDecoder();
    let pending = "";
    let text = "";
    let first = true;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (controller.signal.aborted) throw new Transient("busy", `${model} : réponse interrompue`);
        if (done) break;
        if (first) {
          first = false;
          arm(totalMs - (Date.now() - started)); // la réponse a commencé : elle a jusqu'à la fin de l'essai
        }
        pending += decoder.decode(value, { stream: true });
        for (let end = pending.search(/\r?\n\r?\n/); end >= 0; end = pending.search(/\r?\n\r?\n/)) {
          text += textOfEvent(model, pending.slice(0, end));
          pending = pending.slice(end).replace(/^\r?\n\r?\n/, "");
        }
      }
      pending += decoder.decode();
      if (pending.trim() !== "") text += textOfEvent(model, pending);
    } catch (error) {
      if (error instanceof Transient || error instanceof PhotoError) throw error;
      throw new Transient(isAbort(error) ? "busy" : "upstream", `${model} : réponse interrompue`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/** Transforme le texte reçu en tableau ; une réponse inutilisable est un échec de ce modèle (un autre fera peut-être mieux). */
function interpret(model: string, text: string): PhotoTable {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Transient("garbled", `${model} : réponse illisible`);
  }
  try {
    return normalizeSparseTable(raw);
  } catch (error) {
    if (error instanceof PhotoError && error.code === "unreadable") throw new Transient("garbled", `${model} : réponse illisible`);
    throw error; // aucun tableau, tableau démesuré : un autre modèle n'y changerait rien
  }
}

/**
 * Envoie la photo à Gemini et en tire le tableau. Essaie les modèles dans l'ordre ; s'arrête tout de suite si la clé est refusée,
 * si la photo est refusée ou si la réponse est inutilisable (changer de modèle n'y changerait rien).
 */
export async function readTableFromPhoto(image: Uint8Array, mimeType: string, options: ReadOptions): Promise<PhotoReadResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const budget = options.budgetMs ?? 52_000;
  const attempt = options.attemptMs ?? 32_000;
  const firstByte = options.firstByteMs ?? 10_000;
  const models = options.models ?? DEFAULT_MODELS;
  const base64 = toBase64(image);
  const start = now();

  const failures: Transient["kind"][] = [];
  const log: string[] = [];
  for (const model of models) {
    for (const withThinking of [true, false]) {
      const left = budget - (now() - start);
      if (left < 2_000) break;
      try {
        const text = await ask(model, buildRequest(base64, mimeType, withThinking), options.apiKey, fetchImpl, Math.min(attempt, left), firstByte);
        if (text.trim() === "") throw new Transient("garbled", `${model} : réponse vide`);
        return { ...interpret(model, text), model };
      } catch (error) {
        if (!(error instanceof Transient)) throw error;
        // Seul le refus du réglage de réflexion se retente avec le même modèle (sans ce réglage) ; le reste passe au modèle suivant.
        if (error.message === "thinking" && withThinking) continue;
        failures.push(error.kind);
        log.push(error.message);
        // Deux modèles de suite qui refusent la demande : c'est la photo (inutile de gaspiller les demandes gratuites des autres).
        if (failures.filter((kind) => kind === "rejected").length >= 2) {
          throw new PhotoError("bad-request", "Google n'a pas pu lire cette photo.", log.join(" | "));
        }
        break;
      }
    }
  }

  const detail = log.join(" | ");
  const everyQuota = failures.length > 0 && failures.every((kind) => kind === "quota" || kind === "gone");
  if (failures.includes("quota") && everyQuota) {
    throw new PhotoError("quota", "Le nombre de photos gratuites du jour est atteint.", detail);
  }
  // Tous les modèles ont répondu n'importe quoi : la photo n'est pas assez lisible.
  if (failures.length > 0 && failures.every((kind) => kind === "garbled")) {
    throw new PhotoError("unreadable", "La lecture n'a rien donné d'exploitable.", detail);
  }
  // Plus de temps (aucun essai possible) ou Google saturé : réessayer plus tard.
  if (failures.length === 0 || failures.includes("busy") || failures.includes("quota")) {
    throw new PhotoError("busy", "Google est très sollicité en ce moment.", detail);
  }
  throw new PhotoError("upstream", "La lecture de la photo n'a pas fonctionné.", detail);
}
