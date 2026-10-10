import { describe, expect, it } from "vitest";
import { analyze, cellKey, isUnsure, newWorksheet, type Worksheet } from "@/lib/analysis";
import { importPhotoTable, photoToGrid, PHOTO_SOURCE_NAME } from "@/lib/import/photo";
import { ImportError } from "@/lib/import";
import { issueMessage } from "@/lib/labels";
import type { PhotoTable } from "@/lib/photo/types";
import { DEFAULT_SETTINGS, INITIAL_STATE, reduce, type Action, type AppState } from "@/lib/state";
import { buildPlan } from "@/lib/steps";
import { cellView } from "@/lib/table";
import { sheetOf } from "./helpers";

function table(rows: string[][], uncertain: [number, number][] = [], message: string | null = null): PhotoTable {
  return { rows, uncertain, message };
}

/** Un tableau lu sur une photo, comme l'appli le prépare à l'import. */
function worksheetFrom(photo: PhotoTable): Worksheet {
  const { model, flagged } = importPhotoTable(photo);
  return { ...newWorksheet(model), flagged };
}

const BASIC = table(
  [
    ["Clients", "Yaourt", "Fromage"],
    ["Alice", "3", "2"],
    ["Bob", "", "5"],
  ],
  [[1, 1]],
);

describe("tableau lu sur une photo : mise au format de l'appli", () => {
  it("lit les cellules comme un fichier CSV : entiers en nombres, le reste en texte", () => {
    const { rows } = photoToGrid(table([["Clients", "Yaourt 0,5L", "12,5"], ["Alice", "3", "2,5"], ["Bob", "", "-1"], ["TOTAL", "3*0,2", "007"]]));
    expect(rows[0].map((cell) => cell?.value)).toEqual(["Clients", "Yaourt 0,5L", 12.5]); // un nombre à virgule en titre : une colonne de total
    expect(rows[1].map((cell) => cell?.value)).toEqual(["Alice", 3, "2,5"]);
    expect(rows[2].map((cell) => cell?.value)).toEqual(["Bob", undefined, -1]);
    expect(rows[3].map((cell) => cell?.value)).toEqual(["TOTAL", "3*0,2", 7]);
  });

  it("une photo n'a pas de formules : un texte qui commence par « = » reste un texte (donc signalé)", () => {
    const grid = photoToGrid(table([["Clients", "A"], ["Alice", "=3"]]));
    expect(grid.rows[1][1]).toEqual({ value: "=3", formula: false });
  });

  it("donne un nom propre à la source, à la place d'un nom de fichier", () => {
    const { model } = importPhotoTable(BASIC);
    expect(model.fileName).toBe(PHOTO_SOURCE_NAME);
    expect(model.columns.map((column) => column.name)).toEqual(["Yaourt", "Fromage"]);
    expect(model.rows.map((row) => row.name)).toEqual(["Alice", "Bob"]);
    expect(model.cells).toEqual([
      [3, 2],
      [null, 5],
    ]);
  });

  it("applique les mêmes règles qu'un fichier : ligne TOTAL, produit marqué *, colonne sans titre", () => {
    const ws = worksheetFrom(
      table([
        ["Clients", "Yaourt", "Bleu *", ""],
        ["TOTAL", "3", "1", "9"],
        ["Alice", "3", "1", "note"],
      ]),
    );
    const analysis = analyze(ws, { ignoreStar: true });
    expect(analysis.activeRows.map((r) => ws.model.rows[r].name)).toEqual(["Alice"]);
    expect(analysis.activeColumns.map((c) => ws.model.columns[c].name)).toEqual(["Yaourt"]);
  });

  it("garde la remarque de la lecture", () => {
    expect(importPhotoTable({ ...BASIC, message: "Le bas de la photo est coupé." }).note).toBe("Le bas de la photo est coupé.");
    expect(importPhotoTable(BASIC).note).toBeNull();
  });

  it("refuse une photo sans produits ou sans clients", () => {
    for (const rows of [
      [["", ""], ["", ""]],
      [["Clients", "A"], ["", ""]],
      [["Clients", ""], ["Alice", ""]],
    ]) {
      expect(() => importPhotoTable(table(rows))).toThrow(ImportError);
    }
  });

  describe("cases douteuses", () => {
    it("retrouve la case dans le modèle", () => {
      const { flagged } = importPhotoTable(BASIC);
      expect(flagged).toEqual({ [cellKey(0, 0)]: true });
    });

    it("tient compte des lignes et colonnes vides que le modèle laisse de côté", () => {
      const photo = table(
        [
          ["Clients", "Yaourt", "", "Fromage"],
          ["Alice", "3", "", "2"],
          ["", "", "", ""],
          ["Bob", "1", "", "5"],
        ],
        [
          [3, 3],
          [1, 3],
        ],
      );
      const { model, flagged } = importPhotoTable(photo);
      expect(flagged).toEqual({ [cellKey(1, 1)]: true, [cellKey(0, 1)]: true });
      expect(model.cells[1][1]).toBe(5); // Bob, Fromage
      expect(model.cells[0][1]).toBe(2); // Alice, Fromage
    });

    it("ignore une case douteuse d'une ligne ou d'une colonne laissée de côté", () => {
      const photo = table(
        [
          ["Clients", "Yaourt", "", "Fromage"],
          ["Alice", "3", "", "2"],
          ["", "", "", ""],
        ],
        [
          [2, 1],
          [1, 2],
        ],
      );
      expect(importPhotoTable(photo).flagged).toEqual({});
    });

    it("ne signale pas un doute sur un nom de client ou un titre de produit (on les compare avec la photo)", () => {
      expect(importPhotoTable(table(BASIC.rows, [[0, 1], [1, 0], [0, 0]])).flagged).toEqual({});
    });
  });
});

describe("cases douteuses à la vérification", () => {
  const ws = () => worksheetFrom(BASIC);
  const issueAt = (sheet: Worksheet, r: number, c: number) => analyze(sheet, { ignoreStar: true }).issues.find((i) => i.r === r && i.c === c);

  it("une quantité valable mais mal lue reste à vérifier", () => {
    const sheet = ws();
    expect(isUnsure(sheet, 0, 0)).toBe(true);
    expect(issueAt(sheet, 0, 0)).toMatchObject({ kind: "uncertain", value: 3, confirmed: false });
    expect(analyze(sheet, { ignoreStar: true }).pending).toHaveLength(1);
  });

  it("les autres cases ne sont pas concernées", () => {
    const sheet = ws();
    expect(isUnsure(sheet, 0, 1)).toBe(false);
    expect(isUnsure(sheet, 1, 0)).toBe(false);
    expect(analyze(sheet, { ignoreStar: true }).issues).toHaveLength(1);
  });

  it("la confirmer lève le doute", () => {
    const sheet = ws();
    sheet.confirmed[cellKey(0, 0)] = true;
    expect(isUnsure(sheet, 0, 0)).toBe(false);
    expect(analyze(sheet, { ignoreStar: true }).pending).toHaveLength(0);
  });

  it("la corriger lève le doute ; retaper la valeur lue, non", () => {
    const sheet = ws();
    sheet.cells[0][0] = 4;
    expect(isUnsure(sheet, 0, 0)).toBe(false);
    expect(analyze(sheet, { ignoreStar: true }).pending).toHaveLength(0);
    sheet.cells[0][0] = 3;
    expect(isUnsure(sheet, 0, 0)).toBe(true);
  });

  it("une case lue vide mais douteuse se confirme aussi (« oui, elle est vide »)", () => {
    const sheet = worksheetFrom(table(BASIC.rows, [[2, 1]]));
    expect(issueAt(sheet, 1, 0)).toMatchObject({ kind: "uncertain", value: null });
    sheet.confirmed[cellKey(1, 0)] = true;
    expect(analyze(sheet, { ignoreStar: true }).pending).toHaveLength(0);
  });

  it("un vrai problème passe avant le doute, et le confirmer ou le corriger lève les deux", () => {
    const sheet = worksheetFrom(table([["Clients", "Yaourt"], ["Alice", "3*0,2"], ["Bob", "1"]], [[1, 1]]));
    expect(issueAt(sheet, 0, 0)).toMatchObject({ kind: "text" });
    sheet.cells[0][0] = 2;
    expect(analyze(sheet, { ignoreStar: true }).issues).toHaveLength(0);
  });

  it("un nombre décimal douteux se garde tel quel en une seule confirmation", () => {
    const sheet: Worksheet = { ...sheetOf([["Clients", "Yaourt"], ["Alice", 2.5], ["Bob", 1]]), flagged: { [cellKey(0, 0)]: true } };
    expect(issueAt(sheet, 0, 0)).toMatchObject({ kind: "decimal", confirmed: false });
    sheet.confirmed[cellKey(0, 0)] = true;
    expect(issueAt(sheet, 0, 0)).toMatchObject({ kind: "decimal", confirmed: true });
    expect(analyze(sheet, { ignoreStar: true }).pending).toHaveLength(0);
  });

  it("ignore les cases des lignes et colonnes que l'appli n'utilise pas", () => {
    const photo = table(
      [
        ["Clients", "Yaourt", "Bleu *"],
        ["TOTAL", "5", "5"],
        ["Alice", "3", "2"],
        ["Bob", "2", "3"],
      ],
      [
        [1, 1], // la ligne TOTAL
        [2, 2], // le produit marqué *
      ],
    );
    const sheet = worksheetFrom(photo);
    expect(analyze(sheet, { ignoreStar: true }).issues).toHaveLength(0);
    // Si on réactive les produits marqués *, la case douteuse compte.
    expect(analyze(sheet, { ignoreStar: false }).issues.map((i) => i.kind)).toEqual(["uncertain"]);
  });

  it("un tableau sans case douteuse (fichier Excel) n'est pas touché", () => {
    const sheet = sheetOf([["Clients", "Yaourt"], ["Alice", 3], ["Bob", 1]]);
    expect(sheet.flagged).toBeUndefined();
    expect(isUnsure(sheet, 0, 0)).toBe(false);
    expect(analyze(sheet, { ignoreStar: true }).issues).toHaveLength(0);
  });

  it("la quantité douteuse compte dans le plan (elle bloque le démarrage, pas le calcul)", () => {
    const sheet = ws();
    const plan = buildPlan(sheet, analyze(sheet, { ignoreStar: true }));
    expect(plan.products[0]).toMatchObject({ name: "Yaourt", total: 3 });
  });

  it("isUnsure ne plante pas hors du tableau", () => {
    expect(isUnsure(ws(), 9, 9)).toBe(false);
  });

  it("l'affichage de la case : orange, comme une valeur douteuse", () => {
    const sheet = ws();
    const analysis = analyze(sheet, { ignoreStar: true });
    expect(cellView(3, analysis, 0, 0, false, true)).toEqual({ text: "3", tone: "warn", issue: "uncertain" });
    expect(cellView(null, analysis, 1, 0, false, true)).toMatchObject({ text: "", tone: "warn", issue: "uncertain" });
    expect(cellView(3, analysis, 0, 0, false, false)).toMatchObject({ tone: "ok", issue: null });
    // Une case d'une ligne ou colonne ignorée reste grisée, douteuse ou non.
    const ignored = analyze(worksheetFrom(table([["Clients", "A *"], ["Alice", "1"], ["Bob", "2"]])), { ignoreStar: true });
    expect(cellView(1, ignored, 0, 0, false, true).tone).toBe("inactive");
  });

  it("le message explique quoi faire", () => {
    expect(issueMessage("uncertain", 3)).toMatch(/photo/i);
    expect(issueMessage("uncertain", 3)).toContain("3");
    expect(issueMessage("uncertain", null)).toContain("vide");
  });
});

describe("importer une photo dans l'état de l'appli", () => {
  const model = importPhotoTable(BASIC).model;
  const empty: AppState = reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS });
  const apply = (state: AppState, ...actions: Action[]) => actions.reduce(reduce, state);
  const importPhoto = (note: string | null = null): Action => ({
    type: "import",
    model,
    importedAt: "2026-10-10T10:00:00.000Z",
    photo: { flagged: { [cellKey(0, 0)]: true }, note },
  });

  it("note d'où vient le tableau, les cases douteuses et la remarque", () => {
    const { session } = apply(empty, importPhoto("Photo un peu floue."));
    expect(session).toMatchObject({ source: "photo", flagged: { "0:0": true }, note: "Photo un peu floue.", status: "verifying", position: null });
  });

  it("sans remarque : pas de champ « note »", () => {
    expect(apply(empty, importPhoto()).session).not.toHaveProperty("note");
  });

  it("un fichier Excel ou CSV n'a ni origine photo, ni cases douteuses, ni remarque", () => {
    const { session } = apply(empty, { type: "import", model, importedAt: "2026-10-10T10:00:00.000Z" });
    expect(session).not.toHaveProperty("source");
    expect(session).not.toHaveProperty("flagged");
    expect(session).not.toHaveProperty("note");
  });

  it("importer un fichier après une photo efface l'origine photo", () => {
    const { session } = apply(empty, importPhoto("x"), { type: "import", model, importedAt: "2026-10-10T11:00:00.000Z" });
    expect(session).not.toHaveProperty("source");
    expect(session).not.toHaveProperty("flagged");
    expect(session).not.toHaveProperty("note");
  });

  it("corriger une case ne touche pas à la liste des cases douteuses (le doute se lève par la valeur)", () => {
    const state = apply(empty, importPhoto(), { type: "setCell", r: 0, c: 0, value: 4 });
    expect(state.session?.flagged).toEqual({ "0:0": true });
    expect(isUnsure(state.session!, 0, 0)).toBe(false);
  });

  it("confirmer une case lève le doute ; modifier ensuite la case le fait revenir", () => {
    let state = apply(empty, importPhoto(), { type: "confirmCell", r: 0, c: 0 });
    expect(isUnsure(state.session!, 0, 0)).toBe(false);
    state = apply(state, { type: "setCell", r: 0, c: 0, value: 5 }, { type: "setCell", r: 0, c: 0, value: 3 });
    expect(isUnsure(state.session!, 0, 0)).toBe(true);
  });
});
