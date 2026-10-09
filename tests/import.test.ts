import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { analyze, newWorksheet } from "@/lib/analysis";
import { csvToGrid, decodeText, parseCsv, sniffDelimiter } from "@/lib/import/csv";
import { importBytes, ImportError } from "@/lib/import";
import { buildPlan } from "@/lib/steps";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("lecture CSV", () => {
  it("devine le séparateur : point-virgule, virgule, tabulation", () => {
    expect(sniffDelimiter("Nom;FB 0,5;FB 1\nA;1;2")).toBe(";");
    expect(sniffDelimiter("Nom,FB 1,Yaourt\nA,1,2")).toBe(",");
    expect(sniffDelimiter("Nom\tFB 1\tYaourt\nA\t1\t2")).toBe("\t");
  });

  it("ignore les séparateurs entre guillemets", () => {
    expect(sniffDelimiter('Nom,"FB 0;5","Yaourt, nature"\nA,1,2')).toBe(",");
  });

  it("lit les guillemets, les guillemets doublés et les retours à la ligne Windows", () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;2;3\r\n', ";")).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("a;b\n\nc;d", ";")).toEqual([["a", "b"], [""], ["c", "d"]]);
  });

  it("ne transforme jamais « 2,5 » en 25 : un nombre à virgule reste du texte (donc orange)", () => {
    const g = csvToGrid("Nom;Fromage\nAlice;2,5\nBob;6\nChloé;1.5");
    expect(g.rows[1][1]).toEqual({ value: "2,5", formula: false });
    expect(g.rows[2][1]).toEqual({ value: 6, formula: false });
    expect(g.rows[3][1]).toEqual({ value: "1.5", formula: false });
  });

  it("lit les entiers (même négatifs) comme des nombres, le reste comme du texte", () => {
    const g = csvToGrid("Nom;A\nx;-3\ny;3*0,2\nz;");
    expect(g.rows[1][1]?.value).toBe(-3);
    expect(g.rows[2][1]?.value).toBe("3*0,2");
    expect(g.rows[3][1]).toBeNull();
  });

  it("repère les formules recopiées telles quelles et ignore le BOM", () => {
    const g = csvToGrid("﻿Nom;A\nTOTAL;=SUM(B2:B3)");
    expect(g.rows[0][0]?.value).toBe("Nom");
    expect(g.rows[1][1]).toEqual({ value: null, formula: true });
  });

  it("un total exporté en valeur dans l'en-tête (ex. 975,45) est un en-tête numérique", () => {
    const g = csvToGrid("Nom;Fromage;975,45\nAlice;2;9,6");
    expect(g.rows[0][2]).toEqual({ value: 975.45, formula: false });
  });

  it("décode l'UTF-8, puis le Windows-1252 des exports Excel français", () => {
    expect(decodeText(utf8("Biocité"))).toBe("Biocité");
    expect(decodeText(Uint8Array.from(Buffer.from("Biocité;Élevage", "latin1")))).toBe("Biocité;Élevage");
  });
});

describe("import d'un fichier CSV complet", () => {
  // Comme l'exemple une fois enregistré en CSV : le total de poids (une formule dans Excel) devient
  // un simple nombre dans l'en-tête, et les poids des clients des nombres à virgule.
  const csv = [
    "Nom;FB 0,5;Bleu *;Yaourt nature 0.5L ;975,45",
    "TOTAL;13;1;7;",
    "Biocité;10;1;2;4,8",
    "Declic  ;3;;5;9,6",
    "Bon d'ici 17/10*;12;;;",
    "Vide;;;;",
  ].join("\r\n");

  it("applique les mêmes règles que pour un fichier Excel", async () => {
    const model = await importBytes(utf8(csv), "commande.csv");
    const ws = newWorksheet(model);
    const a = analyze(ws, { ignoreStar: true });
    const plan = buildPlan(ws, a);
    expect(plan.products.map((p) => [p.name, p.total])).toEqual([
      ["FB 0,5", 13],
      ["Yaourt nature 0.5L", 7],
    ]);
    expect(a.columns.map((c) => c.reason)).toEqual([null, "star", null, "number-header"]);
    expect(model.rows.map((r) => r.name)).toEqual(["TOTAL", "Biocité", "Declic", "Bon d'ici 17/10*", "Vide"]);
  });

  it("lit aussi un CSV en Windows-1252", async () => {
    const model = await importBytes(Uint8Array.from(Buffer.from(csv, "latin1")), "commande.csv");
    expect(model.rows.map((r) => r.name)).toContain("Biocité");
  });
});

describe("import d'un classeur Excel (aller-retour avec de vraies formules)", () => {
  function workbookBytes(): Uint8Array {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Nom", "Fromage", "Poids"],
      ["TOTAL", null, null],
      ["Alice", 2, null],
      ["Bob", 3, null],
    ]);
    sheet["B2"] = { t: "n", f: "SUM(B3:B4)", v: 5 }; // ligne TOTAL
    sheet["C1"] = { t: "n", f: "SUM(C3:C4)", v: 9.5 }; // en-tête = formule
    sheet["C3"] = { t: "n", f: "B3*3.6", v: 7.2 }; // cellule de données = formule
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Feuil1");
    return new Uint8Array(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);
  }

  it("ne prend jamais une formule pour une quantité", async () => {
    const model = await importBytes(workbookBytes(), "classeur.xlsx");
    expect(model.sheetName).toBe("Feuil1");
    expect(model.columns.map((c) => c.headerKind)).toEqual(["text", "formula"]);
    expect(model.cells).toEqual([[null, null], [2, null], [3, null]]);
    const ws = newWorksheet(model);
    const plan = buildPlan(ws, analyze(ws, { ignoreStar: true }));
    expect(plan.products).toHaveLength(1);
    expect(plan.products[0]).toMatchObject({ name: "Fromage", total: 5 });
  });

  it("choisit la lecture Excel d'après le contenu du fichier, pas seulement son extension", async () => {
    const model = await importBytes(workbookBytes(), "export.csv");
    expect(model.sheetName).toBe("Feuil1");
  });
});

describe("erreurs d'import lisibles", () => {
  it("refuse un fichier vide", async () => {
    await expect(importBytes(new Uint8Array(), "vide.xlsx")).rejects.toThrow(ImportError);
  });

  it("refuse un tableau sans produits ni clients", async () => {
    await expect(importBytes(utf8("Nom;A;B\n"), "x.csv")).rejects.toThrow(/ni produits ni clients/);
    await expect(importBytes(utf8("juste du texte"), "x.csv")).rejects.toThrow(ImportError);
  });

  it("refuse un fichier trop gros", async () => {
    await expect(importBytes(new Uint8Array(9 * 1024 * 1024), "gros.csv")).rejects.toThrow(/trop gros/);
  });

  it("refuse un tableau démesuré plutôt que de geler l'affichage", async () => {
    const wide = ["Nom", ...Array.from({ length: 150 }, (_, i) => `P${i}`)].join(";");
    const rows = Array.from({ length: 300 }, (_, r) => [`C${r}`, ...Array.from({ length: 150 }, () => "1")].join(";"));
    await expect(importBytes(utf8([wide, ...rows].join("\n")), "enorme.csv")).rejects.toThrow(/beaucoup trop grand/);
  });

  it("refuse un faux fichier Excel", async () => {
    const fake = Uint8Array.from([0x50, 0x4b, 0x00, 0x00, 1, 2, 3, 4]);
    await expect(importBytes(fake, "faux.xlsx")).rejects.toThrow(ImportError);
  });
});
