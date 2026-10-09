import { describe, expect, it } from "vitest";
import { buildModel, columnLetter } from "@/lib/grid";
import { F, grid, sampleRows } from "./helpers";

describe("columnLetter", () => {
  it("suit la numérotation d'Excel", () => {
    expect([0, 1, 25, 26, 27, 51, 52, 701, 702].map(columnLetter)).toEqual([
      "A", "B", "Z", "AA", "AB", "AZ", "BA", "ZZ", "AAA",
    ]);
  });
});

describe("buildModel", () => {
  const model = buildModel(grid(sampleRows(), "Magasins"), "essai.xlsx");

  it("garde le nom du fichier et de la feuille", () => {
    expect(model.fileName).toBe("essai.xlsx");
    expect(model.sheetName).toBe("Magasins");
  });

  it("nettoie les espaces parasites des titres et des noms", () => {
    expect(model.columns.map((c) => c.name)).toEqual(["Fromage", "Bleu *", "Yaourt", "", ""]);
    expect(model.rows.map((r) => r.name)).toEqual(["TOTAL", "Alice", "Bob", "Chloé*", "", "Dan"]);
  });

  it("nettoie aussi les espaces insécables, doubles et les caractères invisibles", () => {
    const m = buildModel(
      grid([
        ["﻿Nom", "Yaourt nature   0.5L​ "],
        ["  Amap   Amboise ", 3],
      ]),
      "x.xlsx",
    );
    expect(m.columns[0].name).toBe("Yaourt nature 0.5L");
    expect(m.rows[0].name).toBe("Amap Amboise");
  });

  it("classe les en-têtes : texte, formule, nombre, vide", () => {
    expect(model.columns.map((c) => c.headerKind)).toEqual(["text", "text", "text", "formula", "empty"]);
    const numeric = buildModel(grid([["Nom", 975.45], ["A", 1]]), "x.xlsx");
    expect(numeric.columns[0].headerKind).toBe("number");
  });

  it("conserve les lettres Excel d'origine", () => {
    expect(model.columns.map((c) => c.letter)).toEqual(["B", "C", "D", "E", "F"]);
    expect(model.rows.map((r) => r.number)).toEqual([2, 3, 4, 5, 6, 7]);
  });

  it("ne liste pas une colonne totalement vide, ni une ligne qui ne contient que des formules", () => {
    const m = buildModel(
      grid([
        ["Nom", "Fromage", null, "Yaourt"],
        ["Alice", 1, null, 2],
        [null, F(5), null, F(6)],
        [null, null, null, null],
      ]),
      "x.xlsx",
    );
    expect(m.columns.map((c) => c.name)).toEqual(["Fromage", "Yaourt"]);
    expect(m.rows.map((r) => r.name)).toEqual(["Alice"]);
  });

  it("garde une colonne sans titre si elle contient une note, et une ligne sans nom si elle contient des quantités", () => {
    expect(model.columns[4]).toMatchObject({ letter: "F", name: "", headerKind: "empty" });
    expect(model.rows[4]).toMatchObject({ number: 6, name: "" });
  });

  it("une formule n'est jamais une quantité", () => {
    const m = buildModel(
      grid([
        ["Nom", "Fromage"],
        ["Alice", F(12)],
        ["Bob", 3],
      ]),
      "x.xlsx",
    );
    expect(m.cells).toEqual([[null], [3]]);
  });

  it("aligne les valeurs sur les lignes et colonnes gardées", () => {
    expect(model.cells[1]).toEqual([2, 1, 3, null, "une note"]); // Alice
    expect(model.cells[2]).toEqual([null, 4, 5, null, null]); // Bob
  });

  it("ne transforme pas silencieusement les valeurs : texte, décimal et négatif restent tels quels", () => {
    const m = buildModel(grid([["Nom", "A"], ["x", "3*0,2"], ["y", 2.5], ["z", -1]]), "x.xlsx");
    expect(m.cells).toEqual([["3*0,2"], [2.5], [-1]]);
  });

  it("gère une feuille vide ou sans lignes de données", () => {
    expect(buildModel(grid([]), "x.xlsx")).toMatchObject({ columns: [], rows: [], cells: [] });
    expect(buildModel(grid([["Nom", "A", "B"]]), "x.xlsx")).toMatchObject({ rows: [] });
  });
});
