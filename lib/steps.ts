import { cellKey, columnLabel, rowLabel, type Analysis, type Worksheet } from "./analysis";
import { roundQuantity } from "./format";
import { quantityOf } from "./rules";

export interface ClientLine {
  /** Position dans model.rows. */
  rowPos: number;
  name: string;
  quantity: number;
}

export interface ProductPlan {
  /** Position dans model.columns. */
  colPos: number;
  name: string;
  total: number;
  clients: ClientLine[];
}

/** Où l'on en est dans la préparation (stable même si le tableau est modifié entre-temps). */
export interface Position {
  colPos: number;
  /** null = l'étape TOTAL du produit. */
  rowPos: number | null;
}

export interface Step extends Position {
  id: string;
  kind: "total" | "client";
  productIndex: number;
  productName: string;
  clientName: string | null;
  quantity: number;
  /** « Produit 3/17 » */
  productNumber: number;
  productCount: number;
  /** « Étape 4/9 » : l'étape TOTAL compte pour la première. */
  stepNumber: number;
  stepCount: number;
}

export interface Plan {
  products: ProductPlan[];
  steps: Step[];
}

/**
 * Pour chaque produit retenu (dans l'ordre des colonnes) : une étape TOTAL, puis une étape
 * par client (dans l'ordre des lignes) dont la quantité n'est pas nulle.
 * Un produit dont le total est nul est sauté.
 */
export function buildPlan(ws: Worksheet, analysis: Analysis): Plan {
  const products: ProductPlan[] = [];
  for (const c of analysis.activeColumns) {
    const clients: ClientLine[] = [];
    let total = 0;
    for (const r of analysis.activeRows) {
      const quantity = quantityOf(ws.cells[r][c], Boolean(ws.confirmed[cellKey(r, c)]));
      if (quantity > 0) {
        clients.push({ rowPos: r, name: rowLabel(ws.model.rows[r]), quantity });
        total += quantity;
      }
    }
    if (clients.length === 0) continue;
    products.push({
      colPos: c,
      name: columnLabel(ws.model.columns[c]),
      total: roundQuantity(total),
      clients,
    });
  }

  const steps: Step[] = [];
  products.forEach((product, productIndex) => {
    const stepCount = product.clients.length + 1;
    const common = {
      productIndex,
      colPos: product.colPos,
      productName: product.name,
      productNumber: productIndex + 1,
      productCount: products.length,
      stepCount,
    };
    steps.push({
      ...common,
      id: `${product.colPos}:T`,
      kind: "total",
      rowPos: null,
      clientName: null,
      quantity: product.total,
      stepNumber: 1,
    });
    product.clients.forEach((client, i) => {
      steps.push({
        ...common,
        id: `${product.colPos}:${client.rowPos}`,
        kind: "client",
        rowPos: client.rowPos,
        clientName: client.name,
        quantity: client.quantity,
        stepNumber: i + 2,
      });
    });
  });

  return { products, steps };
}

export function positionOf(step: Step): Position {
  return { colPos: step.colPos, rowPos: step.rowPos };
}

/**
 * Retrouve l'étape correspondant à une position enregistrée.
 * Si le tableau a changé depuis, on retombe sur le début du même produit, sinon sur la première étape.
 */
export function findStepIndex(steps: Step[], position: Position | null): number {
  if (!position || steps.length === 0) return 0;
  const exact = steps.findIndex((s) => s.colPos === position.colPos && s.rowPos === position.rowPos);
  if (exact >= 0) return exact;
  const sameProduct = steps.findIndex((s) => s.colPos === position.colPos);
  return sameProduct >= 0 ? sameProduct : 0;
}
