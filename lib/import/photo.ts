import { cellKey } from "../analysis";
import { buildModel, columnLetter } from "../grid";
import type { PhotoTable } from "../photo/types";
import type { RawGrid, SheetModel } from "../types";
import { textToCell } from "./csv";
import { ImportError } from "./types";

/** Nom affiché à la place d'un nom de fichier. */
export const PHOTO_SOURCE_NAME = "Photo du tableau";

/** Ce que donne la lecture d'une photo une fois mise au format de l'appli. */
export interface PhotoImport {
  model: SheetModel;
  /** Cases de quantités dont la lecture n'est pas sûre, clé « ligne:colonne » (positions du modèle). */
  flagged: Record<string, true>;
  /** Remarque de la lecture (photo coupée, floue…), ou null. */
  note: string | null;
}

/**
 * Les cellules lues sur la photo, comme celles d'un fichier CSV : « 3 » devient le nombre 3, « 2,5 » reste un texte (donc signalé en
 * orange), le reste est du texte. Une photo ne contient pas de formules.
 */
export function photoToGrid(table: PhotoTable): RawGrid {
  return { sheetName: "Photo", rows: table.rows.map((row, r) => row.map((text) => textToCell(text, r === 0))) };
}

/** Met la lecture d'une photo au format de l'appli : mêmes règles que pour un fichier (colonnes à *, ligne TOTAL…), plus les cases douteuses. */
export function importPhotoTable(table: PhotoTable): PhotoImport {
  const model = buildModel(photoToGrid(table), PHOTO_SOURCE_NAME);
  if (model.columns.length === 0 || model.rows.length === 0) {
    throw new ImportError(
      "Je n'ai trouvé ni produits ni clients sur cette photo. La première ligne du tableau doit porter les noms des produits " +
        "et la première colonne ceux des clients.",
    );
  }

  // `buildModel` laisse de côté les lignes et colonnes sans rien : on retrouve la position de chaque case dans le modèle
  // grâce au numéro de ligne et à la lettre de colonne qu'il a gardés.
  const rowAt = new Map(model.rows.map((row, i) => [row.number - 1, i]));
  const columnAt = new Map(model.columns.map((column, j) => [column.letter, j]));
  const flagged: Record<string, true> = {};
  for (const [r, c] of table.uncertain) {
    // Un doute sur un nom ou un titre ne bloque rien : on les compare avec la photo, comme tout le reste.
    if (r < 1 || c < 1) continue;
    const i = rowAt.get(r);
    const j = columnAt.get(columnLetter(c));
    if (i !== undefined && j !== undefined) flagged[cellKey(i, j)] = true;
  }
  return { model, flagged, note: table.message };
}
