/** Un tableau lu sur une photo, avant toute règle de l'appli (étoiles, TOTAL…). */
export interface PhotoTable {
  /** Les cellules, ligne par ligne : la première ligne porte les noms des produits, la première colonne ceux des clients. Toutes les lignes ont la même largeur. */
  rows: string[][];
  /** Cellules dont la lecture n'est pas sûre : [ligne, colonne] dans `rows`, à partir de 0. */
  uncertain: [number, number][];
  /** Remarque de la lecture (photo coupée, floue…), ou null. */
  message: string | null;
}

export type PhotoErrorCode =
  | "not-configured" // pas de clé Gemini sur le serveur
  | "forbidden" // code d'accès absent ou faux
  | "bad-request" // image absente, trop lourde ou illisible
  | "bad-key" // la clé est refusée par Google
  | "quota" // le quota gratuit du jour est atteint pour tous les modèles essayés
  | "busy" // Google est saturé ou trop lent
  | "no-table" // la photo ne montre aucun tableau lisible
  | "too-big" // le tableau lu est démesuré
  | "unreadable" // réponse inutilisable
  | "offline" // pas de connexion (côté téléphone)
  | "upstream"; // autre erreur de Google

export class PhotoError extends Error {
  constructor(
    readonly code: PhotoErrorCode,
    message: string,
    /** Pour les journaux du serveur (jamais montré à l'utilisateur, jamais de clé ni de photo). */
    readonly detail?: string,
  ) {
    super(message);
    this.name = "PhotoError";
  }
}

export const PHOTO_LIMITS = {
  /** Poids maximal de la photo envoyée (le serveur de Vercel refuse les envois de plus de 4,5 Mo). */
  maxBytes: 4 * 1024 * 1024,
  maxRows: 300,
  maxColumns: 100,
  maxCellLength: 120,
} as const;

/** Ce que renvoie /api/lire-photo en cas de succès. */
export interface PhotoReadResponse extends PhotoTable {
  /** Modèle Gemini qui a répondu (pour s'y retrouver en cas de souci). */
  model: string;
}

/** Ce que renvoie GET /api/lire-photo : la lecture de photo est-elle prête sur ce serveur ? */
export interface PhotoStatus {
  available: boolean;
  /** Un code d'accès est demandé pour lire une photo. */
  needsCode: boolean;
}
