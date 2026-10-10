import { describe, expect, it } from "vitest";
import { analyze, cellKey, newWorksheet, type Worksheet } from "@/lib/analysis";
import { importPhotoTable } from "@/lib/import/photo";
import { issueMessage, totalMessage } from "@/lib/labels";
import type { PhotoTable } from "@/lib/photo/types";
import { DEFAULT_SETTINGS, INITIAL_STATE, reduce, type Session } from "@/lib/state";
import { parseSession } from "@/lib/storage";
import { cellView } from "@/lib/table";
import { sheetOf } from "./helpers";

const OPTIONS = { ignoreStar: true };

function table(rows: string[][], uncertain: [number, number][] = []): PhotoTable {
  return { rows, uncertain, message: null };
}

/** Une préparation lue sur une photo, créée comme le fait l'appli (donc avec la vérification des totaux). */
function sessionFrom(photo: PhotoTable): Session {
  const { model, flagged, note } = importPhotoTable(photo);
  const empty = reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS });
  return reduce(empty, { type: "import", model, importedAt: "2026-10-10T10:00:00.000Z", photo: { flagged, note } }).session!;
}

const totalIssues = (ws: Worksheet, options = OPTIONS) => analyze(ws, options).issues.filter((issue) => issue.kind === "total");

/** Un tableau dont le TOTAL est la somme de chaque colonne (Yaourt 9, Fromage 7, Bleu * 2). */
const CONSISTENT = [
  ["Clients", "Yaourt", "Fromage", "Bleu *"],
  ["TOTAL", "9", "7", "2"],
  ["Nature Champs", "4", "3", "1"],
  ["Biocoop", "5", "", "1"],
  ["Marché", "", "4", ""],
];

/** Même tableau, avec un total faux : Fromage dit 8 alors que les quantités lues font 7. */
const WRONG_FROMAGE = CONSISTENT.map((row, i) => (i === 1 ? ["TOTAL", "9", "8", "2"] : row));

describe("vérifier les totaux d'une photo", () => {
  it("un tableau dont les totaux tombent juste ne signale rien", () => {
    expect(analyze(sessionFrom(table(CONSISTENT)), OPTIONS).issues).toEqual([]);
  });

  it("un total qui ne tombe pas juste devient une valeur douteuse, sur la case du total", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    const analysis = analyze(session, OPTIONS);
    expect(analysis.issues).toEqual([{ r: 0, c: 1, kind: "total", value: 8, expected: 7, confirmed: false }]);
    expect(analysis.pending).toHaveLength(1);
    // La ligne TOTAL n'est pas préparée, mais son écart est bien signalé.
    expect(analysis.rows[0]).toMatchObject({ active: false, reason: "total" });
    expect(session.model.rows[0].name).toBe("TOTAL");
    expect(session.model.columns[1].name).toBe("Fromage");
  });

  it("corriger une quantité pour que la somme tombe juste lève le doute tout seul", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    session.cells[3][1] = 5; // Marché : 4 devient 5, la somme fait 8
    expect(totalIssues(session)).toEqual([]);
    expect(analyze(session, OPTIONS).pending).toEqual([]);
  });

  it("corriger le total lui-même le lève aussi", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    session.cells[0][1] = 7;
    expect(totalIssues(session)).toEqual([]);
  });

  it("garder le total tel quel (confirmer) le lève ; il reste visible comme « gardé »", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    session.confirmed[cellKey(0, 1)] = true;
    const analysis = analyze(session, OPTIONS);
    expect(analysis.issues).toEqual([{ r: 0, c: 1, kind: "total", value: 8, expected: 7, confirmed: true }]);
    expect(analysis.pending).toEqual([]);
  });

  it("une quantité douteuse reste à traiter avant le total dans la liste", () => {
    const photo = table(
      [
        ["Clients", "Yaourt", "Fromage"],
        ["TOTAL", "9", "8"],
        ["Nature Champs", "4", "3"],
        ["Biocoop", "5", ""],
        ["Marché", "", "4"],
      ],
      [[3, 1]],
    );
    const { pending } = analyze(sessionFrom(photo), OPTIONS);
    expect(pending.map((issue) => issue.kind)).toEqual(["uncertain", "total"]);
  });

  describe("les lignes marquées * (le TOTAL du fichier d'origine ne les compte pas)", () => {
    const rows = (total: string) => [
      ["Clients", "Yaourt"],
      ["TOTAL", total],
      ["Alice", "4"],
      ["Bon d'ici 17/10*", "12"],
    ];

    it("le total sans les lignes marquées est juste", () => {
      expect(totalIssues(sessionFrom(table(rows("4"))))).toEqual([]);
    });

    it("le total avec toutes les lignes est juste aussi (on ne devine pas la convention)", () => {
      expect(totalIssues(sessionFrom(table(rows("16"))))).toEqual([]);
    });

    it("un autre total est signalé, avec la somme sans les lignes marquées", () => {
      expect(totalIssues(sessionFrom(table(rows("5"))))).toEqual([{ r: 0, c: 0, kind: "total", value: 5, expected: 4, confirmed: false }]);
    });
  });

  describe("ce qui n'est pas vérifié", () => {
    it("un total absent, texte ou décimal", () => {
      for (const total of ["", "x", "2,5", "-1"]) {
        const session = sessionFrom(table([["Clients", "Yaourt"], ["TOTAL", total], ["Alice", "4"], ["Bob", "1"]]));
        expect(totalIssues(session), `total « ${total} »`).toEqual([]);
      }
    });

    it("un tableau sans ligne TOTAL", () => {
      const session = sessionFrom(table([["Clients", "Yaourt"], ["Alice", "4"], ["Bob", "1"]]));
      expect(totalIssues(session)).toEqual([]);
    });

    it("un tableau qui ne vient pas d'une photo (fichier Excel ou CSV)", () => {
      const sheet = sheetOf([["Clients", "Yaourt"], ["TOTAL", 99], ["Alice", 4], ["Bob", 1]]);
      expect(sheet.totalsCheck).toBeUndefined();
      expect(totalIssues(sheet)).toEqual([]);
    });

    it("un produit ignoré par son nom (étoile) tant que le réglage est actif", () => {
      const session = sessionFrom(table([["Clients", "Yaourt", "Bleu *"], ["TOTAL", "5", "99"], ["Alice", "4", "1"], ["Bob", "1", ""]]));
      expect(totalIssues(session)).toEqual([]);
      expect(totalIssues(session, { ignoreStar: false }).map((issue) => issue.c)).toEqual([1]);
    });

    it("un produit désactivé à la main", () => {
      const session = sessionFrom(table(WRONG_FROMAGE));
      session.columnOverrides[1] = "off";
      expect(totalIssues(session)).toEqual([]);
      session.columnOverrides[1] = "on";
      expect(totalIssues(session)).toHaveLength(1);
    });
  });

  it("un total non nul face à une colonne sans aucune quantité lue est signalé (des quantités ont été manquées)", () => {
    const session = sessionFrom(table([["Clients", "Yaourt", "Fromage"], ["TOTAL", "5", "6"], ["Alice", "2", ""], ["Bob", "3", ""]]));
    const analysis = analyze(session, OPTIONS);
    expect(analysis.columns[1]).toMatchObject({ active: false, reason: "no-quantity" });
    expect(analysis.issues).toEqual([{ r: 0, c: 1, kind: "total", value: 6, expected: 0, confirmed: false }]);
  });

  it("plusieurs totaux faux : un doute par produit, dans l'ordre des colonnes", () => {
    // A : somme 3 pour un total de 9 ; B : somme 3 pour un total de 4 ; C : somme 8 pour un total de 8 (juste).
    const session = sessionFrom(table([["Clients", "A", "B", "C"], ["TOTAL", "9", "4", "8"], ["x", "1", "3", "2"], ["y", "2", "", "6"]]));
    expect(totalIssues(session).map((issue) => [issue.c, issue.value, issue.expected])).toEqual([
      [0, 9, 3],
      [1, 4, 3],
    ]);
  });

  it("n'altère pas la préparation : les quantités et les totaux préparés restent ceux des clients", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    const plain = sessionFrom(table(CONSISTENT));
    expect(analyze(session, OPTIONS).activeRows).toEqual(analyze(plain, OPTIONS).activeRows);
    expect(analyze(session, OPTIONS).activeColumns).toEqual(analyze(plain, OPTIONS).activeColumns);
  });
});

describe("l'affichage et la sauvegarde", () => {
  it("la case du total faux est orange même dans la ligne TOTAL, grisée sinon", () => {
    const session = sessionFrom(table(WRONG_FROMAGE));
    const analysis = analyze(session, OPTIONS);
    expect(cellView(8, analysis, 0, 1, false, false, true)).toEqual({ text: "8", tone: "warn", issue: "total" });
    expect(cellView(8, analysis, 0, 1, true, false, true)).toMatchObject({ tone: "kept", issue: "total" });
    expect(cellView(9, analysis, 0, 0, false, false, false).tone).toBe("inactive");
  });

  it("les messages donnent le total lu et la somme", () => {
    const message = totalMessage(56, 53);
    expect(message).toContain("56");
    expect(message).toContain("53");
    expect(message).toMatch(/photo/);
    expect(issueMessage("total", 56)).toMatch(/total/i);
  });

  it("l'import d'une photo active la vérification, pas l'import d'un fichier", () => {
    const empty = reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS });
    const { model } = importPhotoTable(table(CONSISTENT));
    const photo = reduce(empty, { type: "import", model, importedAt: "x", photo: { flagged: {}, note: null } }).session!;
    const file = reduce(empty, { type: "import", model, importedAt: "x" }).session!;
    expect(photo.totalsCheck).toBe(true);
    expect(file).not.toHaveProperty("totalsCheck");
    expect(newWorksheet(model)).not.toHaveProperty("totalsCheck");
  });

  it("se sauvegarde et se relit ; une valeur étrangère est refusée", () => {
    const session = sessionFrom(table(CONSISTENT));
    const stored = JSON.parse(JSON.stringify(session));
    expect(parseSession(stored)).toEqual(session);
    expect(parseSession({ ...stored, totalsCheck: false })).toBeNull();
    expect(parseSession({ ...stored, totalsCheck: "oui" })).toBeNull();
    const { totalsCheck, ...old } = stored;
    void totalsCheck;
    expect(parseSession(old)).not.toBeNull(); // une sauvegarde plus ancienne, sans ce champ
  });
});
