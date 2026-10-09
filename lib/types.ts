/** Valeur d'une cellule après lecture : un nombre, un texte, ou vide (null). */
export type CellValue = number | string | null;

/** Cellule brute lue dans un fichier, avant toute règle. */
export interface RawCell {
  value: CellValue;
  /** Vrai si la cellule contient une formule : ce n'est jamais une quantité. */
  formula: boolean;
}

/** Tableau brut d'une feuille : ligne 1 = en-têtes, colonne A = noms des clients. */
export interface RawGrid {
  sheetName: string;
  /** rows[ligne][colonne] ; null ou trou = cellule absente. */
  rows: (RawCell | null)[][];
}

export type HeaderKind = "text" | "empty" | "formula" | "number";

export interface ColumnInfo {
  /** Lettre de la colonne dans Excel ("B", "AA"). */
  letter: string;
  /** Nom du produit nettoyé ("" si absent ou si l'en-tête est une formule). */
  name: string;
  headerKind: HeaderKind;
}

export interface RowInfo {
  /** Numéro de la ligne dans Excel (la ligne 1 est celle des en-têtes). */
  number: number;
  /** Nom du client nettoyé ("" si absent). */
  name: string;
}

/** Résultat de l'import : toutes les colonnes et lignes candidates, sans filtrage. */
export interface SheetModel {
  fileName: string;
  sheetName: string;
  columns: ColumnInfo[];
  rows: RowInfo[];
  /** Valeurs importées, cells[ligne][colonne], alignées sur `rows` et `columns`. */
  cells: CellValue[][];
}
