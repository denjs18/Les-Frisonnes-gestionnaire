import type { RawGrid } from "../types";

/** Erreur d'import dont le message, en français, peut être affiché tel quel à l'utilisateur. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportError";
  }
}

/**
 * Une source de tableau : lit un fichier (aujourd'hui Excel ou CSV) et renvoie un `RawGrid`.
 *
 * Tout le reste de l'appli (vérification, étapes, voix) part du `RawGrid` : ajouter une
 * nouvelle source de fichiers ne demande donc d'écrire qu'un nouvel importeur et de l'ajouter à `importers`.
 * (La photo d'un tableau est lue par un service sur Internet, puis mise au même format : voir `lib/import/photo.ts`.)
 */
export interface TableImporter {
  id: string;
  label: string;
  /** Valeur de l'attribut `accept` du sélecteur de fichier. */
  accept: string;
  read(file: File): Promise<RawGrid>;
}
