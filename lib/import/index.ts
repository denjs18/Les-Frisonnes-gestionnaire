import { buildModel } from "../grid";
import type { RawGrid, SheetModel } from "../types";
import { csvToGrid, decodeText, hasUtf16Bom } from "./csv";
import { ImportError, type TableImporter } from "./types";
import { xlsxToGrid } from "./xlsx";

export { ImportError, type TableImporter } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
/** Au-delà (plusieurs centaines de lignes par plusieurs dizaines de colonnes), l'affichage du tableau deviendrait trop lent. */
const MAX_CELLS = 40_000;
const SPREADSHEET_EXTENSIONS = ["xlsx", "xlsm", "xls", "ods"];

/** Commence par ces octets ? */
function startsWith(bytes: Uint8Array, ...signature: number[]): boolean {
  return signature.every((byte, i) => bytes[i] === byte);
}

/**
 * Sur Android, le sélecteur de fichiers n'est pas filtré (un filtre griserait les fichiers que le téléphone ne
 * reconnaît pas comme Excel) : on peut donc recevoir n'importe quoi. Reconnaît, à ses premiers octets, ce qui n'est
 * manifestement pas un tableau.
 */
function describeNonTable(bytes: Uint8Array): string | null {
  if (startsWith(bytes, 0x25, 0x50, 0x44, 0x46)) return "un PDF"; // %PDF
  if (
    startsWith(bytes, 0xff, 0xd8, 0xff) || // JPEG
    startsWith(bytes, 0x89, 0x50, 0x4e, 0x47) || // PNG
    startsWith(bytes, 0x47, 0x49, 0x46, 0x38) || // GIF
    (startsWith(bytes, 0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) // WebP
  ) {
    return "une image";
  }
  // Photo HEIC, vidéo MP4… : « ftyp » aux octets 4 à 7.
  if (bytes.length >= 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return "une photo ou une vidéo";
  return null;
}

/** Un texte (CSV) ne contient jamais d'octet nul, sauf en UTF-16 ; sinon c'est un fichier binaire inconnu. */
function looksBinary(bytes: Uint8Array): boolean {
  if (hasUtf16Bom(bytes)) return false;
  const end = Math.min(bytes.length, 2048);
  for (let i = 0; i < end; i++) if (bytes[i] === 0) return true;
  return false;
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
}

/** Un classeur Excel est un ZIP ("PK") ou un ancien format OLE ; le reste est lu comme du texte (CSV). */
function isSpreadsheetBinary(bytes: Uint8Array, fileName: string): boolean {
  if (bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b) return true;
  if (bytes.length >= 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    return true;
  }
  return SPREADSHEET_EXTENSIONS.includes(extensionOf(fileName));
}

export async function readGrid(bytes: Uint8Array, fileName: string): Promise<RawGrid> {
  if (bytes.length === 0) throw new ImportError("Ce fichier est vide.");
  if (bytes.length > MAX_BYTES) throw new ImportError("Ce fichier est trop gros (8 Mo maximum).");
  if (isSpreadsheetBinary(bytes, fileName)) return xlsxToGrid(bytes);
  const nonTable = describeNonTable(bytes);
  if (nonTable) throw new ImportError(`Ce fichier est ${nonTable}, pas un tableau. Choisissez le fichier Excel (.xlsx) ou CSV.`);
  if (looksBinary(bytes)) {
    throw new ImportError("Ce fichier n'est pas un tableau Excel ou CSV. Choisissez un fichier .xlsx ou .csv.");
  }
  return csvToGrid(decodeText(bytes), "CSV");
}

/** Lit un fichier (en mémoire) et renvoie le modèle, ou lève une ImportError lisible. */
export async function importBytes(bytes: Uint8Array, fileName: string): Promise<SheetModel> {
  const model = buildModel(await readGrid(bytes, fileName), fileName);
  if (model.columns.length === 0 || model.rows.length === 0) {
    throw new ImportError(
      "Je n'ai trouvé ni produits ni clients. La ligne 1 doit contenir les noms des produits " +
        "et la colonne A les noms des clients.",
    );
  }
  if (model.rows.length * model.columns.length > MAX_CELLS) {
    throw new ImportError(
      `Ce tableau est beaucoup trop grand (${model.rows.length} lignes × ${model.columns.length} colonnes). ` +
        "Gardez seulement les clients et les produits de la semaine.",
    );
  }
  return model;
}

export async function importFile(file: File): Promise<SheetModel> {
  return importBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

/** Importeur actuel : fichier Excel ou CSV. Une future lecture de photo viendrait s'ajouter ici. */
export const spreadsheetImporter: TableImporter = {
  id: "spreadsheet",
  label: "Fichier Excel ou CSV",
  accept: ".xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,text/csv",
  async read(file) {
    return readGrid(new Uint8Array(await file.arrayBuffer()), file.name);
  },
};

export const importers: TableImporter[] = [spreadsheetImporter];
