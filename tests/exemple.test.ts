import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyze, newWorksheet, type Worksheet } from "@/lib/analysis";
import { importBytes } from "@/lib/import";
import { DEFAULT_ALIASES, stepSentence } from "@/lib/speech-text";
import { buildPlan } from "@/lib/steps";
import type { SheetModel } from "@/lib/types";

const FILE = new URL("../exemple/Classeur1.xlsx", import.meta.url);

/** Ces tests lisent le vrai fichier d'exemple ; ils sont sautés si le fichier n'est pas dans le dépôt. */
describe.skipIf(!existsSync(FILE))("fichier d'exemple Classeur1.xlsx", async () => {
  const model: SheetModel = await importBytes(new Uint8Array(readFileSync(FILE)), "Classeur1.xlsx");
  const sheet = (): Worksheet => newWorksheet(model);
  const colNames = (idx: number[]) => idx.map((c) => model.columns[c].name);
  const rowNames = (idx: number[]) => idx.map((r) => model.rows[r].name);
  const reasonsOf = (kind: "columns" | "rows", reason: string) => {
    const status = analyze(sheet(), { ignoreStar: true })[kind];
    return status.flatMap((s, i) => (s.reason === reason ? [i] : []));
  };

  it("lit la feuille et nettoie les espaces parasites", () => {
    expect(model.sheetName).toBe("Magasins (essai)");
    const names = model.columns.map((c) => c.name);
    expect(names).toContain("Yaourt nature 0.5L"); // « Yaourt nature 0.5L » sans l'espace final
    expect(names).toContain("Yaourt Gingembre 0.5L");
    expect(model.rows.map((r) => r.name)).toContain("Quentin");
    expect(model.rows.map((r) => r.name)).toContain("Declic");
    expect(model.rows.map((r) => r.name)).toContain("Coopnat TN");
    expect([...names, ...model.rows.map((r) => r.name)].every((n) => n === n.trim())).toBe(true);
  });

  it("ignore exactement les 5 colonnes marquées *", () => {
    expect(colNames(reasonsOf("columns", "star"))).toEqual([
      "Gourmandise de Leiana*",
      "Bleu *",
      "Friso *",
      "Délice de Marguerite*",
      "Yaourt pamp 0.5L*",
    ]);
  });

  it("ignore aussi la colonne de poids (formule), la colonne de notes (sans titre) et le produit sans quantité", () => {
    const formula = reasonsOf("columns", "formula-header");
    expect(formula).toHaveLength(1);
    expect(model.columns[formula[0]].letter).toBe("W");

    const empty = reasonsOf("columns", "empty-header");
    expect(empty).toHaveLength(1);
    expect(model.columns[empty[0]].letter).toBe("X");

    expect(colNames(reasonsOf("columns", "no-quantity"))).toEqual(["Le Tartinable 150"]);
  });

  it("ignore la ligne TOTAL et la ligne « Bon d'ici 17/10* »", () => {
    expect(rowNames(reasonsOf("rows", "total"))).toEqual(["TOTAL"]);
    expect(rowNames(reasonsOf("rows", "star"))).toEqual(["Bon d'ici 17/10*"]);
  });

  it("ignore les clients sans aucune quantité, dont Quentin (quantités seulement dans des produits à *)", () => {
    expect(rowNames(reasonsOf("rows", "no-quantity"))).toEqual([
      "Kdi fermier morceaux (poids)",
      "Salut Terre",
      "Monmarché",
      "Quentin",
      "courcay",
    ]);
  });

  it("ne liste pas les lignes sans nom qui ne contiennent que des formules", () => {
    expect(model.rows.some((r) => r.name === "")).toBe(false);
  });

  it("garde 15 produits et 15 clients dans l'ordre du fichier", () => {
    const analysis = analyze(sheet(), { ignoreStar: true });
    expect(colNames(analysis.activeColumns)).toEqual([
      "Petit Frison",
      "FB 0,5",
      "FB 1",
      "Le TartiAil/Ciboulette 300gr",
      "Le Tartinable 300",
      "Yaourt nature 0.5L",
      "Yaourt nature 1L",
      "Yaourt Gingembre 0.5L",
      "Yaourt Verveine 0.5L",
      "Yaourt citron 0.5L",
      "Yaourt bergamote 0.5L",
      "Yaourt orange 0.5",
      "Yaourt Rose 0.5L",
      "Yaourt Estragon 0.5L",
      "Yaourt Menthe 0.5L",
    ]);
    expect(rowNames(analysis.activeRows)).toEqual([
      "Saveurs lochoises",
      "Bios du coin",
      "Nature Champs",
      "Biocité",
      "Coopnat Chambray",
      "Coopnat TN",
      "Tours de ferme morceaux",
      "Bonne récolte",
      "4 saisons morceaux",
      "fourchette",
      "Amap Amboise +6l",
      "SPDC",
      "Civray+2L",
      "Poterie +2L",
      "Declic",
    ]);
  });

  it("ne signale aucune valeur douteuse avec les réglages par défaut", () => {
    expect(analyze(sheet(), { ignoreStar: true }).pending).toEqual([]);
  });

  const planByProduct = () => {
    const ws = sheet();
    const plan = buildPlan(ws, analyze(ws, { ignoreStar: true }));
    return new Map(plan.products.map((p) => [p.name, p]));
  };

  it("total « Petit Frison » = 3 (4 saisons morceaux, Amap Amboise +6l, Civray+2L)", () => {
    const product = planByProduct().get("Petit Frison");
    expect(product?.total).toBe(3);
    expect(product?.clients.map((c) => c.name)).toEqual([
      "4 saisons morceaux",
      "Amap Amboise +6l",
      "Civray+2L",
    ]);
  });

  it("total « FB 0,5 » = 56", () => {
    expect(planByProduct().get("FB 0,5")?.total).toBe(56);
  });

  it("total « Yaourt nature 0.5L » = 38", () => {
    expect(planByProduct().get("Yaourt nature 0.5L")?.total).toBe(38);
  });

  it("n'oublie aucun produit : totaux et nombre de clients recoupés avec un calcul indépendant", () => {
    const totals = [...planByProduct().values()].map((p) => [p.name, p.total, p.clients.length]);
    expect(totals).toEqual([
      ["Petit Frison", 3, 3],
      ["FB 0,5", 56, 10],
      ["FB 1", 20, 6],
      ["Le TartiAil/Ciboulette 300gr", 3, 2],
      ["Le Tartinable 300", 2, 1],
      ["Yaourt nature 0.5L", 38, 9],
      ["Yaourt nature 1L", 5, 3],
      ["Yaourt Gingembre 0.5L", 18, 9],
      ["Yaourt Verveine 0.5L", 28, 12],
      ["Yaourt citron 0.5L", 29, 11],
      ["Yaourt bergamote 0.5L", 27, 13],
      ["Yaourt orange 0.5", 18, 8],
      ["Yaourt Rose 0.5L", 9, 5],
      ["Yaourt Estragon 0.5L", 3, 2],
      ["Yaourt Menthe 0.5L", 10, 5],
    ]);
  });

  it("génère l'étape TOTAL puis une étape par client, avec la progression", () => {
    const ws = sheet();
    const { steps } = buildPlan(ws, analyze(ws, { ignoreStar: true }));
    const yaourt = steps.filter((s) => s.productName === "Yaourt nature 0.5L");
    expect(yaourt[0]).toMatchObject({ kind: "total", quantity: 38, stepNumber: 1, stepCount: 10 });
    expect(yaourt.slice(1).every((s) => s.kind === "client")).toBe(true);
    expect(yaourt).toHaveLength(10); // TOTAL + 9 clients
    expect(yaourt[1]).toMatchObject({ clientName: "Saveurs lochoises", quantity: 5, stepNumber: 2 });
    expect(yaourt[0].productCount).toBe(15);
  });

  it("dicte les étapes comme prévu", () => {
    const ws = sheet();
    const { steps } = buildPlan(ws, analyze(ws, { ignoreStar: true }));
    const sentences = steps.map((s) => stepSentence(s, DEFAULT_ALIASES));
    expect(sentences).toContain("38 Yaourt nature 0,5 litre");
    expect(sentences).toContain("56 fromage blanc 0,5");
    expect(sentences).toContain("1 pour Amap Amboise plus 6 litres");
    expect(sentences).toContain("4 pour Nature Champs");
    expect(sentences).toContain("1 pour S P D C");
  });

  describe("réglage « Ignorer les produits marqués * » désactivé", () => {
    it("rend les 5 colonnes actives et signale les 7 textes comme « 3*0,2 »", () => {
      const analysis = analyze(sheet(), { ignoreStar: false });
      expect(colNames(analysis.activeColumns)).toContain("Bleu *");
      expect(analysis.pending).toHaveLength(7);
      expect(analysis.pending.every((i) => i.kind === "text")).toBe(true);
      expect(analysis.pending.map((i) => i.value)).toEqual(
        expect.arrayContaining(["3*0,2", "4*0,2", "2*0,2", "1*0,2", "1*,02"]),
      );
      expect(rowNames(analysis.activeRows)).toContain("Quentin");
    });

    it("la ligne « Bon d'ici 17/10* » reste ignorée (nom marqué *)", () => {
      const analysis = analyze(sheet(), { ignoreStar: false });
      expect(rowNames(analysis.activeRows)).not.toContain("Bon d'ici 17/10*");
    });
  });
});
