import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

/** Le fichier d'exemple (il n'est pas forcément présent : les tests qui en ont besoin sont alors sautés). */
export const EXAMPLE_FILE = resolve(__dirname, "../exemple/Classeur1.xlsx");
export const hasExampleFile = existsSync(EXAMPLE_FILE);

/** Un petit tableau CSV, utilisable partout. */
export const SMALL_CSV = [
  "Nom;Fromage;Yaourt nature 0.5L;Bleu *",
  "TOTAL;3;7;1",
  "Alice;2;3;1",
  "Bob;;4;",
  "Chloé;1;;",
].join("\n");

/** Fabrique un classeur Excel (.xlsx) à partir de lignes de cellules. */
export function workbook(rows: (string | number | null)[][], name = "tableau.xlsx") {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Feuil1");
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** Une vraie image PNG (un quadrillage sur fond clair), pour jouer le rôle de la photo du tableau. */
export function samplePhoto(width = 240, height = 160, name = "tableau.png") {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); // le premier octet de chaque ligne est le filtre (0 : aucun)
    for (let x = 0; x < width; x++) {
      const line = x % 30 === 0 || y % 20 === 0;
      row.set(line ? [50, 60, 55] : [242, 240, 228], 1 + x * 3);
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, couleurs RVB, sans entrelacement
  const buffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return { name, mimeType: "image/png", buffer };
}

declare global {
  interface Window {
    __spoken: string[];
    __rec: unknown;
    __recStarts: number;
    /** Code d'erreur que la fausse reconnaissance vocale renvoie à chaque démarrage (null : elle démarre normalement). */
    __recError: string | null;
    __say: (text: string, isFinal?: boolean, confidence?: number) => boolean;
  }
}

/**
 * Remplace la parole et la reconnaissance vocale du navigateur par de fausses versions :
 * - window.__spoken liste tout ce que l'appli a « dit » ;
 * - window.__say("suivant") fait comme si l'utilisateur l'avait prononcé.
 */
export async function installFakeVoice(page: Page, options: { recognition?: boolean; recognitionError?: string } = {}) {
  await page.addInitScript(([withRecognition, recognitionError]: [boolean, string | null]) => {
    const w = window as unknown as Record<string, unknown> & Window;
    w.__spoken = [];
    w.__recStarts = 0;
    w.__recError = recognitionError;

    class Utterance {
      text: string;
      lang = "";
      rate = 1;
      volume = 1;
      voice = null;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    }
    w.SpeechSynthesisUtterance = Utterance;
    const synth = {
      speaking: false,
      speak(utterance: Utterance) {
        if (utterance.text.trim() !== "") w.__spoken.push(utterance.text);
        setTimeout(() => {
          utterance.onstart?.();
          utterance.onend?.();
        }, 40);
      },
      cancel() {},
      getVoices: () => [{ name: "Voix de test", lang: "fr-FR", voiceURI: "voix-de-test", default: true, localService: true }],
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });

    if (withRecognition) {
      class Recognition {
        lang = "";
        continuous = false;
        interimResults = false;
        maxAlternatives = 1;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: ((event: { error: string }) => void) | null = null;
        onresult: ((event: unknown) => void) | null = null;
        start() {
          w.__rec = this;
          w.__recStarts += 1;
          setTimeout(() => (w.__recError ? this.onerror?.({ error: w.__recError }) : this.onstart?.()), 0);
        }
        stop() {}
        abort() {
          if (w.__rec === this) w.__rec = null;
        }
      }
      Object.defineProperty(window, "webkitSpeechRecognition", { value: Recognition, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: Recognition, configurable: true });
      w.__say = (text: string, isFinal = true, confidence = 0.9) => {
        const rec = w.__rec as { onresult: ((event: unknown) => void) | null } | null;
        if (!rec?.onresult) return false;
        const result = Object.assign([{ transcript: text, confidence }], { isFinal });
        rec.onresult({ resultIndex: 0, results: [result] });
        return true;
      };
    } else {
      Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined, configurable: true });
      Object.defineProperty(window, "SpeechRecognition", { value: undefined, configurable: true });
    }
  }, [options.recognition ?? true, options.recognitionError ?? null] as [boolean, string | null]);
}

/** Importe un fichier depuis l'accueil et attend l'écran de vérification. */
export async function importFile(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page).toHaveURL(/\/verification$/);
}

export async function importCsv(page: Page, csv = SMALL_CSV) {
  await importFile(page, { name: "commande.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
}

/** Ce que l'appli a dit à voix haute, jusqu'ici. */
export const spoken = (page: Page) => page.evaluate(() => window.__spoken);

/** Attend que l'appli ait dit (en dernier) exactement cette phrase. */
export async function expectLastSpoken(page: Page, text: string) {
  await expect.poll(async () => (await spoken(page)).at(-1)).toBe(text);
}

/**
 * Fait comme si l'utilisateur avait prononcé ce texte (attend que le micro soit prêt).
 * `confidence` : la certitude du micro (0 à 1) ; `isFinal` faux = résultat provisoire.
 */
export async function say(page: Page, text: string, isFinal = true, confidence = 0.9) {
  await page.waitForFunction(() => Boolean(window.__rec));
  await page.evaluate(([t, f, c]) => window.__say(t as string, f as boolean, c as number), [text, isFinal, confidence] as const);
}

/** Enregistre une capture d'écran quand SHOTS_DIR est défini (pour regarder le rendu). */
export async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${name}.png`, fullPage: false });
}
