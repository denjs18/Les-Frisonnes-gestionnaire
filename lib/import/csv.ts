import { cleanText } from "../text";
import type { RawCell, RawGrid } from "../types";

/** Décode des octets : UTF-8 d'abord, sinon Windows-1252 (CSV exporté par un Excel français). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

const DELIMITERS = [";", "\t", ","];

/** Devine le séparateur (point-virgule, tabulation ou virgule) en comptant hors guillemets. */
export function sniffDelimiter(text: string): string {
  const lines = text
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== "")
    .slice(0, 10);
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  for (const line of lines) {
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (!inQuotes && counts.has(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  let best = ";";
  let bestCount = 0;
  for (const d of DELIMITERS) {
    const n = counts.get(d) ?? 0;
    if (n > bestCount) {
      best = d;
      bestCount = n;
    }
  }
  return best;
}

/** Lecteur CSV (guillemets, "" échappés, retours à la ligne Windows/Unix). */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/**
 * Convertit un champ CSV.
 *
 * Aucun nombre à virgule n'est interprété : « 2,5 » reste du texte (donc signalé en orange)
 * au lieu d'être lu « 25 » comme le font certains lecteurs de CSV.
 */
function csvCell(field: string, isHeader: boolean): RawCell | null {
  const text = cleanText(field);
  if (text === "") return null;
  if (text.startsWith("=")) return { value: null, formula: true };
  if (/^-?\d+$/.test(text)) return { value: Number(text), formula: false };
  // Dans l'en-tête, un nombre est un total exporté en valeur (ex. le poids) : colonne à ignorer.
  if (isHeader && /^-?\d+[.,]\d+$/.test(text)) {
    return { value: Number(text.replace(",", ".")), formula: false };
  }
  return { value: text, formula: false };
}

export function csvToGrid(text: string, sheetName = "CSV"): RawGrid {
  const content = text.replace(/^﻿/, "");
  const records = parseCsv(content, sniffDelimiter(content));
  while (records.length > 0 && records[records.length - 1].every((f) => cleanText(f) === "")) {
    records.pop();
  }
  return {
    sheetName,
    rows: records.map((record, r) => record.map((field) => csvCell(field, r === 0))),
  };
}
