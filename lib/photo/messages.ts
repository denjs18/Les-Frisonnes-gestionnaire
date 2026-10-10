import { PhotoError, type PhotoErrorCode } from "./types";

const MESSAGES: Record<PhotoErrorCode, string> = {
  "not-configured": "La lecture de photo n'est pas activée sur ce site. Importez plutôt un fichier Excel ou CSV.",
  forbidden: "Le code d'accès est absent ou faux. Vérifiez-le, puis réessayez.",
  "bad-request": "Cette photo n'a pas pu être envoyée (trop lourde ou format inconnu). Essayez avec une autre photo.",
  "bad-key":
    "La lecture de photo est mal réglée sur ce site (la clé du service est refusée). Prévenez la personne qui s'occupe du site, et importez un fichier Excel ou CSV en attendant.",
  quota: "Le nombre de photos gratuites du jour est atteint. Réessayez demain, ou importez un fichier Excel ou CSV.",
  busy: "Le service de lecture est très sollicité en ce moment. Réessayez dans une minute.",
  "no-table": "Je ne vois pas de tableau lisible sur cette photo.",
  "too-big":
    "Le tableau est beaucoup trop grand pour être lu d'un coup. Photographiez seulement les clients et les produits de la semaine.",
  unreadable: "La lecture n'a rien donné d'exploitable. Réessayez avec une photo plus nette.",
  offline: "Pas de connexion à Internet : la lecture d'une photo en a besoin. Réessayez avec du réseau, ou importez un fichier Excel ou CSV.",
  upstream: "La lecture de la photo n'a pas fonctionné. Réessayez dans un instant.",
};

const PHOTO_TIPS = "Cadrez le tableau en entier, bien à plat, avec une bonne lumière, puis réessayez.";

/** Ce que l'on dit quand la lecture d'une photo échoue : ce qui s'est passé et que faire (en français, sans jargon). */
export function describePhotoError(error: unknown): string {
  if (!(error instanceof PhotoError)) return MESSAGES.upstream;
  // Pour « aucun tableau », le service précise parfois pourquoi (photo floue, tableau coupé…) : on le garde.
  if (error.code === "no-table") return `${error.message.trim() || MESSAGES["no-table"]} ${PHOTO_TIPS}`;
  return MESSAGES[error.code];
}

/** Les codes d'erreur que le serveur peut renvoyer (le reste est traité comme une erreur du service). */
export function isPhotoErrorCode(value: unknown): value is PhotoErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MESSAGES, value);
}
