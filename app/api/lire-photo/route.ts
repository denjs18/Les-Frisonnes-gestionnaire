import { timingSafeEqual } from "node:crypto";
import { parseModelList, readTableFromPhoto } from "@/lib/photo/gemini";
import { PHOTO_LIMITS, PhotoError, type PhotoErrorCode, type PhotoStatus } from "@/lib/photo/types";

/** La lecture d'une photo prend quelques secondes (parfois plus quand Google est sollicité). */
export const maxDuration = 60;
/** Les réglages (clé, code d'accès) sont lus à chaque demande, jamais figés à la construction du site. */
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

/** Le code HTTP renvoyé pour chaque sorte d'erreur. */
const STATUS: Record<PhotoErrorCode, number> = {
  "not-configured": 503,
  forbidden: 403,
  "bad-request": 400,
  "bad-key": 502,
  quota: 429,
  busy: 503,
  "no-table": 422,
  "too-big": 422,
  unreadable: 502,
  offline: 503,
  upstream: 502,
};

function reply(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

function fail(error: PhotoError): Response {
  // Le détail (modèles essayés…) va dans les journaux du serveur ; ni la clé ni la photo n'y figurent.
  if (error.detail) console.error(`lire-photo : ${error.code} : ${error.detail}`);
  return reply({ error: error.code, message: error.message }, STATUS[error.code]);
}

/** Les réglages du serveur, lus à chaque demande (la clé n'existe que dans les variables secrètes de Vercel). */
function settings(): { key: string | null; code: string | null } {
  const key = process.env.GEMINI_API_KEY?.trim();
  const code = process.env.PHOTO_ACCESS_CODE?.trim();
  return { key: key ? key : null, code: code ? code : null };
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** La demande vient-elle d'une page de ce site (et non d'un autre site ouvert dans le navigateur) ? */
function fromThisSite(request: Request): boolean {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

/** Reconnaît une vraie photo à ses premiers octets (jamais sur la foi de l'en-tête seul). */
function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return "image/webp";
  }
  return null;
}

/** La lecture de photo est-elle prête (clé présente) et faut-il un code d'accès ? */
export async function GET() {
  const { key, code } = settings();
  const status: PhotoStatus = { available: key !== null, needsCode: key !== null && code !== null };
  return reply(status);
}

/** Reçoit une photo (octets bruts), la fait lire par Gemini, renvoie les lignes du tableau. */
export async function POST(request: Request) {
  const { key, code } = settings();
  if (key === null) return fail(new PhotoError("not-configured", "La lecture de photo n'est pas activée sur ce site."));
  if (!fromThisSite(request)) return fail(new PhotoError("forbidden", "Demande refusée."));
  if (code !== null && !sameText(request.headers.get("x-access-code") ?? "", code)) {
    return fail(new PhotoError("forbidden", "Le code d'accès est absent ou faux."));
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > PHOTO_LIMITS.maxBytes) return fail(new PhotoError("bad-request", "Cette photo est trop lourde."));
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length === 0) return fail(new PhotoError("bad-request", "Aucune photo reçue."));
  if (bytes.length > PHOTO_LIMITS.maxBytes) return fail(new PhotoError("bad-request", "Cette photo est trop lourde."));
  const mimeType = imageType(bytes);
  if (mimeType === null) return fail(new PhotoError("bad-request", "Ce fichier n'est pas une photo (JPEG, PNG ou WebP)."));

  try {
    const table = await readTableFromPhoto(bytes, mimeType, { apiKey: key, models: parseModelList(process.env.GEMINI_MODEL) });
    return reply(table);
  } catch (error) {
    if (error instanceof PhotoError) return fail(error);
    console.error("lire-photo : erreur inattendue", error instanceof Error ? error.name : "inconnue");
    return fail(new PhotoError("upstream", "La lecture de la photo n'a pas fonctionné."));
  }
}
