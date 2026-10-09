import { describe, expect, it } from "vitest";
import { cellKey } from "@/lib/analysis";
import { buildPlan, findStepIndex, positionOf } from "@/lib/steps";
import { col, F, row, run, sheetOf } from "./helpers";

const rows = () => [
  ["Nom", "Fromage", "Yaourt", "Vide"],
  ["TOTAL", F(), F(), F()],
  ["Alice", 2, 3, null],
  ["Bob", null, 5, null],
  ["Chloé", 1, null, null],
];

function planOf(rowsData = rows(), mutate?: (ws: ReturnType<typeof sheetOf>) => void) {
  const ws = sheetOf(rowsData);
  mutate?.(ws);
  return { ws, plan: buildPlan(ws, run(ws)) };
}

describe("buildPlan", () => {
  it("un produit par colonne retenue, les clients dans l'ordre des lignes", () => {
    const { plan } = planOf();
    expect(plan.products.map((p) => [p.name, p.total, p.clients.map((c) => [c.name, c.quantity])])).toEqual([
      ["Fromage", 3, [["Alice", 2], ["Chloé", 1]]],
      ["Yaourt", 8, [["Alice", 3], ["Bob", 5]]],
    ]);
  });

  it("une étape TOTAL, puis une étape par client à quantité non nulle", () => {
    const { plan } = planOf();
    expect(plan.steps.map((s) => [s.kind, s.productName, s.clientName, s.quantity])).toEqual([
      ["total", "Fromage", null, 3],
      ["client", "Fromage", "Alice", 2],
      ["client", "Fromage", "Chloé", 1],
      ["total", "Yaourt", null, 8],
      ["client", "Yaourt", "Alice", 3],
      ["client", "Yaourt", "Bob", 5],
    ]);
  });

  it("numérote « Produit 2/2 · Étape 3/3 » (le TOTAL est la première étape)", () => {
    const { plan } = planOf();
    expect(plan.steps.map((s) => [s.productNumber, s.productCount, s.stepNumber, s.stepCount])).toEqual([
      [1, 2, 1, 3],
      [1, 2, 2, 3],
      [1, 2, 3, 3],
      [2, 2, 1, 3],
      [2, 2, 2, 3],
      [2, 2, 3, 3],
    ]);
  });

  it("donne un identifiant unique à chaque étape", () => {
    const { plan } = planOf();
    expect(new Set(plan.steps.map((s) => s.id)).size).toBe(plan.steps.length);
  });

  it("saute un produit dont le total est nul", () => {
    const { plan } = planOf([["Nom", "A", "B"], ["x", 0, 2]]);
    expect(plan.products.map((p) => p.name)).toEqual(["B"]);
  });

  it("une valeur douteuse non confirmée compte pour 0 ; confirmée, elle est gardée", () => {
    const data = [["Nom", "A"], ["x", 2.5], ["y", 1]];
    expect(planOf(data).plan.products[0]).toMatchObject({ total: 1, clients: [{ name: "y", quantity: 1 }] });
    const confirmed = planOf(data, (ws) => {
      ws.confirmed[cellKey(row(ws, "x"), col(ws, "A"))] = true;
    });
    expect(confirmed.plan.products[0]).toMatchObject({ total: 3.5 });
    expect(confirmed.plan.steps[1]).toMatchObject({ clientName: "x", quantity: 2.5 });
  });

  it("arrondit les totaux décimaux sans erreur de virgule flottante", () => {
    const data = [["Nom", "A"], ["x", 0.1], ["y", 0.2]];
    const { plan } = planOf(data, (ws) => {
      ws.confirmed[cellKey(0, 0)] = true;
      ws.confirmed[cellKey(1, 0)] = true;
    });
    expect(plan.products[0].total).toBe(0.3);
  });

  it("ne produit aucune étape si rien n'est à préparer", () => {
    expect(planOf([["Nom", "A"], ["x", null]]).plan.steps).toEqual([]);
  });
});

describe("findStepIndex : reprendre au bon endroit même si le tableau a changé", () => {
  it("retrouve l'étape exacte", () => {
    const { plan, ws } = planOf();
    const bob = plan.steps.findIndex((s) => s.clientName === "Bob");
    expect(findStepIndex(plan.steps, positionOf(plan.steps[bob]))).toBe(bob);
    expect(findStepIndex(plan.steps, { colPos: col(ws, "Yaourt"), rowPos: null })).toBe(3);
  });

  it("retombe sur le début du produit si le client n'a plus de quantité", () => {
    const { plan, ws } = planOf();
    expect(findStepIndex(plan.steps, { colPos: col(ws, "Yaourt"), rowPos: row(ws, "Chloé") })).toBe(3);
  });

  it("retombe sur la première étape si le produit a disparu ou s'il n'y a pas de position", () => {
    const { plan } = planOf();
    expect(findStepIndex(plan.steps, { colPos: 99, rowPos: null })).toBe(0);
    expect(findStepIndex(plan.steps, null)).toBe(0);
    expect(findStepIndex([], { colPos: 0, rowPos: null })).toBe(0);
  });
});
