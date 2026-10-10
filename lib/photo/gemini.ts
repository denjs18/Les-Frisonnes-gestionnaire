import { normalizePhotoTable } from "./normalize";
import { PHOTO_PROMPT, PHOTO_RESPONSE_SCHEMA } from "./prompt";
import { PhotoError, type PhotoReadResponse } from "./types";

/**
 * Les modèles essayés l'un après l'autre. Google en retire régulièrement (les « 2.5 » ne sont déjà plus offerts aux nouveaux
 * comptes) et l'offre gratuite plafonne chaque modèle séparément (20 demandes par jour) : on passe donc au suivant quand
 * un modèle est saturé, épuisé ou retiré. Le dernier est un alias que Google tient à jour.
 */
export const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest"];

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
  /** Durée maximale d'un essai avec un modèle (ms). */
  attemptMs?: number;
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

/** Texte de la réponse de Gemini (les « parts » de la première proposition). */
function answerText(body: unknown): string {
  const parts = (body as { candidates?: { content?: { parts?: { text?: unknown }[] } }[] } | null)?.candidates?.[0]?.content?.parts;
  return (parts ?? []).map((part) => (typeof part.text === "string" ? part.text : "")).join("");
}

class Transient extends Error {
  constructor(
    readonly kind: "quota" | "busy" | "gone" | "upstream",
    message: string,
  ) {
    super(message);
  }
}

async function ask(model: string, body: unknown, key: string, fetchImpl: typeof fetch, timeoutMs: number) {
  let response: Response;
  try {
    response = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      // La clé voyage dans l'en-tête, jamais dans l'adresse (les adresses se retrouvent dans les journaux).
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    throw new Transient(name === "TimeoutError" || name === "AbortError" ? "busy" : "upstream", `${model} : pas de réponse`);
  }
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return json;

  const message = errorMessage(json);
  if (response.status === 401 || response.status === 403 || (response.status === 400 && /api key/i.test(message))) {
    throw new PhotoError("bad-key", "La clé Gemini est refusée par Google.");
  }
  if (response.status === 400) {
    // Un modèle qui ne connaît pas le réglage de réflexion : on le redemandera sans (voir readTableFromPhoto).
    if (/thinking/i.test(message)) throw new Transient("upstream", "thinking");
    throw new PhotoError("bad-request", "Google n'a pas pu lire cette photo.");
  }
  if (response.status === 404) throw new Transient("gone", `${model} : modèle retiré`);
  if (response.status === 429) throw new Transient("quota", `${model} : quota atteint`);
  throw new Transient(response.status >= 500 ? "busy" : "upstream", `${model} : erreur ${response.status}`);
}

/**
 * Envoie la photo à Gemini et en tire le tableau. Essaie les modèles dans l'ordre ; s'arrête tout de suite si la clé est refusée,
 * si la photo est refusée ou si la réponse est inutilisable (changer de modèle n'y changerait rien).
 */
export async function readTableFromPhoto(image: Uint8Array, mimeType: string, options: ReadOptions): Promise<PhotoReadResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const budget = options.budgetMs ?? 52_000;
  const attempt = options.attemptMs ?? 20_000;
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
        const json = await ask(model, buildRequest(base64, mimeType, withThinking), options.apiKey, fetchImpl, Math.min(attempt, left));
        const text = answerText(json);
        if (text === "") throw new PhotoError("unreadable", "Google n'a rien répondu pour cette photo.");
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new PhotoError("unreadable", "La réponse de la lecture est inutilisable.");
        }
        return { ...normalizePhotoTable(raw), model };
      } catch (error) {
        if (!(error instanceof Transient)) throw error;
        // Seul le refus du réglage de réflexion se retente avec le même modèle (sans ce réglage) ; le reste passe au modèle suivant.
        if (error.message === "thinking" && withThinking) continue;
        failures.push(error.kind);
        log.push(error.message);
        break;
      }
    }
  }

  const detail = log.join(" | ");
  const everyQuota = failures.length > 0 && failures.every((kind) => kind === "quota" || kind === "gone");
  if (failures.includes("quota") && everyQuota) {
    throw new PhotoError("quota", "Le nombre de photos gratuites du jour est atteint.", detail);
  }
  // Plus de temps (aucun essai possible) ou Google saturé : réessayer plus tard.
  if (failures.length === 0 || failures.includes("busy") || failures.includes("quota")) {
    throw new PhotoError("busy", "Google est très sollicité en ce moment.", detail);
  }
  throw new PhotoError("upstream", "La lecture de la photo n'a pas fonctionné.", detail);
}
