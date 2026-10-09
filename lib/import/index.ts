import { buildModel } from "../grid";
import type { RawGrid, SheetModel } from "../types";
import { csvToGrid, decodeText } from "./csv";
import { ImportError, type TableImporter } from "./types";
import { xlsxToGrid } from "./xlsx";

export { ImportError, type TableImporter } from "./types";

const MAX_BYTES = 8 * 1024 * 1024;
const SPREADSHEET_EXTENSIONS = ["xlsx", "xlsm", "xls", "ods"];

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
  return isSpreadsheetBinary(bytes, fileName)
    ? xlsxToGrid(bytes)
    : csvToGrid(decodeText(bytes), "CSV");
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
