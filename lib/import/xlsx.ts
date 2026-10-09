import type { CellObject } from "xlsx";
import type { RawCell, RawGrid } from "../types";
import { ImportError } from "./types";

/** Garde-fous : certains fichiers déclarent des millions de cellules mises en forme mais vides. */
const MAX_ROWS = 5000;
const MAX_COLUMNS = 500;

function toRawCell(cell: CellObject | undefined): RawCell | null {
  if (!cell) return null;
  const formula = cell.f !== undefined || cell.F !== undefined;
  switch (cell.t) {
    case "n":
      return { value: typeof cell.v === "number" ? cell.v : null, formula };
    case "s":
      return { value: String(cell.v ?? ""), formula };
    case "b":
      return { value: cell.v ? "VRAI" : "FAUX", formula };
    case "e":
      return { value: cell.w ?? "#ERREUR", formula };
    case "d":
      return { value: cell.w ?? String(cell.v), formula };
    default:
      return null; // "z" : cellule vide mise en forme
  }
}

/** Lit la première feuille d'un classeur Excel (.xlsx, .xlsm, .xls, .ods). SheetJS n'est chargé qu'à ce moment-là. */
export async function xlsxToGrid(data: Uint8Array): Promise<RawGrid> {
  const XLSX = await import("xlsx");
  let workbook;
  try {
    workbook = XLSX.read(data, { type: "array" });
  } catch {
    throw new ImportError(
      "Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un fichier Excel (.xlsx) ou CSV.",
    );
  }
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new ImportError("Ce fichier ne contient aucune feuille.");

  // On parcourt les cellules réellement présentes, avec leurs adresses absolues (A1 = en haut à gauche).
  const rows: (RawCell | null)[][] = [];
  for (const address of Object.keys(sheet)) {
    if (address.startsWith("!")) continue;
    const { r, c } = XLSX.utils.decode_cell(address);
    if (r >= MAX_ROWS || c >= MAX_COLUMNS) continue;
    const cell = toRawCell(sheet[address] as CellObject | undefined);
    if (!cell) continue;
    while (rows.length <= r) rows.push([]);
    rows[r][c] = cell;
  }
  return { sheetName, rows };
}
