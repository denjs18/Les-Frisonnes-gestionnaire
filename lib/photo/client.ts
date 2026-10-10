import { isPhotoErrorCode } from "./messages";
import { normalizePhotoTable } from "./normalize";
import { PHOTO_LIMITS, PhotoError, type PhotoReadResponse, type PhotoStatus } from "./types";

const ENDPOINT = "/api/lire-photo";

/** Côté le plus long de la photo envoyée à la lecture : assez pour lire de petits chiffres, assez léger pour un réseau mobile. */
const UPLOAD_SIDE = 2000;
/** Poids visé pour la photo envoyée (le serveur en refuse plus de 4 Mo). */
const UPLOAD_TARGET_BYTES = 3.5 * 1024 * 1024;
/** Copie gardée sur l'appareil pour comparer avec le tableau lu : plus petite, pour ne pas remplir le stockage du navigateur. */
const COPY_SIDE = 1600;
const COPY_MAX_CHARS = 1_500_000;
/** Une photo plus lourde que cela (avant réduction) n'est même pas ouverte. */
const MAX_SOURCE_BYTES = 60 * 1024 * 1024;

/** La lecture de photo est-elle prête sur ce site ? Null si on ne peut pas le savoir (pas de connexion, site sans serveur…). */
export async function fetchPhotoStatus(fetchImpl: typeof fetch = fetch): Promise<PhotoStatus | null> {
  try {
    const response = await fetchImpl(ENDPOINT, { cache: "no-store" });
    if (!response.ok) return null;
    const json: unknown = await response.json();
    const { available, needsCode } = (json ?? {}) as { available?: unknown; needsCode?: unknown };
    return typeof available === "boolean" ? { available, needsCode: needsCode === true } : null;
  } catch {
    return null;
  }
}

export interface SendOptions {
  /** Code d'accès, quand le site en demande un. */
  code?: string | null;
  fetchImpl?: typeof fetch;
  /** Pour annuler l'attente. */
  signal?: AbortSignal;
  /** Durée maximale de l'attente (ms) : un peu plus que celle du serveur. */
  timeoutMs?: number;
}

/** Envoie la photo au serveur et renvoie le tableau lu. Lève une `PhotoError` dont le message se traduit avec `describePhotoError`. */
export async function sendPhoto(image: Blob, options: SendOptions = {}): Promise<PhotoReadResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  if (options.signal?.aborted) throw new DOMException("Envoi annulé.", "AbortError");
  // Un seul signal pour « annulé par l'utilisateur » et « trop long » (AbortSignal.any n'existe pas sur les anciens navigateurs).
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? 65_000);
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });

  try {
    let response: Response;
    try {
      response = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": image.type || "image/jpeg", ...(options.code ? { "x-access-code": options.code } : {}) },
        body: image,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (error) {
      if (timedOut) throw new PhotoError("busy", "");
      if (options.signal?.aborted) throw error;
      // Le navigateur ne dit pas pourquoi l'envoi a échoué : c'est presque toujours le réseau.
      throw new PhotoError("offline", "");
    }

    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const body = (json ?? {}) as { error?: unknown; message?: unknown };
      // Vercel répond lui-même 504 quand la lecture dépasse le temps permis, et 413 quand l'envoi est trop gros.
      const code = isPhotoErrorCode(body.error)
        ? body.error
        : response.status === 504
          ? "busy"
          : response.status === 413
            ? "bad-request"
            : "upstream";
      throw new PhotoError(code, typeof body.message === "string" ? body.message : "");
    }
    // La réponse est revérifiée comme si elle venait de n'importe où (un intermédiaire peut renvoyer autre chose qu'un tableau).
    const table = normalizePhotoTable(json);
    const model = typeof (json as { model?: unknown }).model === "string" ? (json as { model: string }).model : "";
    return { ...table, model };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

/** Taille qui tient dans un carré de `maxSide` pixels sans changer les proportions (et sans agrandir). */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** La photo prête à partir : un JPEG réduit pour la lecture, et une copie plus petite à garder pour la comparaison. */
export interface PreparedPhoto {
  upload: Blob;
  /** Data URL de la copie à garder, ou null si elle serait trop lourde pour le stockage du navigateur. */
  copy: string | null;
}

function openImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new PhotoError("bad-request", "Cette photo n'a pas pu être ouverte."));
    };
    image.src = url;
  });
}

function drawScaled(image: HTMLImageElement, maxSide: number): HTMLCanvasElement {
  const { width, height } = fitWithin(image.naturalWidth, image.naturalHeight, maxSide);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoError("bad-request", "Cette photo n'a pas pu être préparée.");
  // Un JPEG n'a pas de transparence : une photo PNG transparente deviendrait noire sans ce fond blanc.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PhotoError("bad-request", "Cette photo n'a pas pu être préparée."))),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Prépare la photo choisie : la redresse (selon l'orientation enregistrée par l'appareil photo), la réduit et la convertit en JPEG.
 * Une photo de téléphone fait plusieurs Mo : réduite, elle part vite même avec peu de réseau, et la lecture n'y perd rien.
 */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  if (file.size === 0) throw new PhotoError("bad-request", "Cette photo est vide.");
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoError("bad-request", "Cette photo est trop lourde.");
  const image = await openImage(file);

  let upload: Blob | null = null;
  for (const [side, quality] of [
    [UPLOAD_SIDE, 0.88],
    [1600, 0.8],
    [1200, 0.7],
  ] as const) {
    upload = await canvasToJpeg(drawScaled(image, side), quality);
    if (upload.size <= Math.min(UPLOAD_TARGET_BYTES, PHOTO_LIMITS.maxBytes)) break;
  }
  if (upload === null || upload.size > PHOTO_LIMITS.maxBytes) throw new PhotoError("bad-request", "Cette photo est trop lourde.");

  let copy: string | null = null;
  for (const [side, quality] of [
    [COPY_SIDE, 0.72],
    [1100, 0.6],
  ] as const) {
    const url = drawScaled(image, side).toDataURL("image/jpeg", quality);
    if (url.startsWith("data:image/jpeg") && url.length <= COPY_MAX_CHARS) {
      copy = url;
      break;
    }
  }
  return { upload, copy };
}
