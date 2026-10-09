import { describe, expect, it } from "vitest";
import { cellKey, columnLabel, rowLabel } from "@/lib/analysis";
import { col, F, names, row, run, sampleRows, sheetOf } from "./helpers";

describe("analyze : colonnes et lignes ignorées, avec la raison", () => {
  const ws = sheetOf(sampleRows());
  const a = run(ws);

  it("donne la raison de chaque colonne ignorée", () => {
    expect(a.columns.map((c) => c.reason)).toEqual([
      null, // Fromage
      "star", // Bleu *
      null, // Yaourt
      "formula-header", // titre = formule
      "empty-header", // note sans titre
    ]);
  });

  it("donne la raison de chaque ligne ignorée", () => {
    expect(a.rows.map((r) => r.reason)).toEqual([
      "total", // TOTAL
      null, // Alice
      null, // Bob
      "star", // Chloé*
      "empty-name", // ligne sans nom mais avec une quantité
      "no-quantity", // Dan
    ]);
  });

  it("ne garde que les produits et clients retenus, dans l'ordre du fichier", () => {
    expect(names(ws, "columns", a.activeColumns)).toEqual(["Fromage", "Yaourt"]);
    expect(names(ws, "rows", a.activeRows)).toEqual(["Alice", "Bob"]);
  });

  it("ne signale rien quand tout est valide", () => {
    expect(a.issues).toEqual([]);
    expect(a.pending).toEqual([]);
  });

  it("le réglage « ignorer les * » désactivé rend les produits marqués actifs", () => {
    const withStars = run(ws, { ignoreStar: false });
    expect(names(ws, "columns", withStars.activeColumns)).toEqual(["Fromage", "Bleu *", "Yaourt"]);
    // la règle sur les lignes ne dépend pas du réglage : « Chloé* » reste ignorée
    expect(names(ws, "rows", withStars.activeRows)).toEqual(["Alice", "Bob"]);
  });
});

describe("analyze : réactiver ou désactiver à la main", () => {
  it("réactiver une colonne à * la rend active et marquée « forcée »", () => {
    const ws = sheetOf(sampleRows());
    ws.columnOverrides[col(ws, "Bleu *")] = "on";
    const a = run(ws);
    expect(a.columns[col(ws, "Bleu *")]).toEqual({ active: true, reason: null, forced: true });
  });

  it("réactiver une ligne ignorée la rend active", () => {
    const ws = sheetOf(sampleRows());
    ws.rowOverrides[row(ws, "Chloé*")] = "on";
    const a = run(ws);
    expect(a.rows[row(ws, "Chloé*")].active).toBe(true);
    expect(names(ws, "rows", a.activeRows)).toContain("Chloé*");
  });

  it("désactiver à la main donne la raison « manual »", () => {
    const ws = sheetOf(sampleRows());
    ws.columnOverrides[col(ws, "Fromage")] = "off";
    ws.rowOverrides[row(ws, "Alice")] = "off";
    const a = run(ws);
    expect(a.columns[col(ws, "Fromage")]).toMatchObject({ active: false, reason: "manual" });
    expect(a.rows[row(ws, "Alice")]).toMatchObject({ active: false, reason: "manual" });
  });
});

describe("analyze : « aucune quantité » suit les saisies", () => {
  it("un client sans quantité devient actif dès qu'on lui en saisit une", () => {
    const ws = sheetOf(sampleRows());
    const dan = row(ws, "Dan");
    expect(run(ws).rows[dan].reason).toBe("no-quantity");
    ws.cells[dan][col(ws, "Fromage")] = 4;
    expect(run(ws).rows[dan]).toMatchObject({ active: true, reason: null });
  });

  it("un client dont les quantités sont toutes à zéro est ignoré", () => {
    const ws = sheetOf([["Nom", "A"], ["x", 0], ["y", 2]]);
    expect(run(ws).rows.map((r) => r.reason)).toEqual(["no-quantity", null]);
  });

  it("un client qui n'a des quantités que dans des produits ignorés est ignoré (jusqu'à ce qu'on les réactive)", () => {
    const ws = sheetOf([["Nom", "A", "B *"], ["x", 1, null], ["y", null, 5]]);
    expect(run(ws).rows.map((r) => r.reason)).toEqual([null, "no-quantity"]);
    expect(run(ws, { ignoreStar: false }).rows.map((r) => r.reason)).toEqual([null, null]);
  });

  it("un produit dont les seules quantités sont sur des lignes ignorées est ignoré", () => {
    const ws = sheetOf([["Nom", "A", "B"], ["x", 1, null], ["Bon*", 9, 9]]);
    expect(run(ws).columns.map((c) => c.reason)).toEqual([null, "no-quantity"]);
  });

  it("une valeur douteuse compte comme du contenu : la ligne reste visible pour être corrigée", () => {
    const ws = sheetOf([["Nom", "A"], ["x", "oups"], ["y", 2]]);
    const a = run(ws);
    expect(a.rows.map((r) => r.reason)).toEqual([null, null]);
    expect(a.pending).toHaveLength(1);
  });
});

describe("analyze : valeurs douteuses (orange)", () => {
  const rows = [
    ["Nom", "A", "B", "C", "D *"],
    ["x", "abc", 2.5, 51, "3*0,2"],
    ["y", -1, 3, null, null],
    ["z*", 99, 99, 99, 99],
  ];

  it("signale texte, décimal, > 50 et négatif, ligne par ligne", () => {
    const ws = sheetOf(rows);
    const a = run(ws);
    expect(a.issues.map((i) => [ws.model.rows[i.r].name, ws.model.columns[i.c].name, i.kind])).toEqual([
      ["x", "A", "text"],
      ["x", "B", "decimal"],
      ["x", "C", "too-big"],
      ["y", "A", "negative"],
    ]);
    expect(a.pending).toHaveLength(4);
  });

  it("ne signale rien dans les lignes ni les colonnes ignorées", () => {
    const ws = sheetOf(rows);
    const a = run(ws);
    expect(a.issues.some((i) => ws.model.rows[i.r].name === "z*")).toBe(false);
    expect(a.issues.some((i) => ws.model.columns[i.c].name === "D *")).toBe(false);
  });

  it("signale les valeurs d'une colonne dès qu'on la réactive", () => {
    const ws = sheetOf(rows);
    expect(run(ws, { ignoreStar: false }).pending).toHaveLength(5);
  });

  it("une valeur décimale ou trop grande peut être confirmée, pas un texte ni un négatif", () => {
    const ws = sheetOf(rows);
    const x = row(ws, "x");
    const y = row(ws, "y");
    ws.confirmed[cellKey(x, col(ws, "A"))] = true; // texte : sans effet
    ws.confirmed[cellKey(y, col(ws, "A"))] = true; // négatif : sans effet
    ws.confirmed[cellKey(x, col(ws, "B"))] = true;
    ws.confirmed[cellKey(x, col(ws, "C"))] = true;
    const a = run(ws);
    expect(a.pending.map((i) => i.kind)).toEqual(["text", "negative"]);
    expect(a.issues.filter((i) => i.confirmed).map((i) => i.kind)).toEqual(["decimal", "too-big"]);
  });

  it("corriger une valeur fait disparaître l'anomalie", () => {
    const ws = sheetOf(rows);
    ws.cells[row(ws, "x")][col(ws, "A")] = 4;
    expect(run(ws).issues.map((i) => i.kind)).toEqual(["decimal", "too-big", "negative"]);
  });

  it("mettre à 0 la seule quantité d'une ligne l'ignore ensuite", () => {
    const ws = sheetOf([["Nom", "A"], ["x", "oups"], ["y", 2]]);
    ws.cells[0][0] = 0;
    const a = run(ws);
    expect(a.rows[0].reason).toBe("no-quantity");
    expect(a.pending).toEqual([]);
  });
});

describe("libellés de secours", () => {
  it("nomme les colonnes et lignes sans titre", () => {
    const ws = sheetOf(sampleRows());
    expect(columnLabel(ws.model.columns[3])).toBe("Colonne E");
    expect(rowLabel(ws.model.rows[row(ws, "")])).toBe("Ligne 6");
    expect(columnLabel(ws.model.columns[0])).toBe("Fromage");
  });

  it("n'a besoin d'aucune formule : F() sert seulement à bâtir les cas de test", () => {
    const ws = sheetOf([["Nom", "A"], ["x", F(4)], ["y", 2]]);
    expect(ws.cells).toEqual([[null], [2]]);
  });
});
