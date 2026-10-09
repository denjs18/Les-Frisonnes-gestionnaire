import { describe, expect, it } from "vitest";
import {
  canKeep,
  checkCell,
  cleanIntegerText,
  hasContent,
  hasStar,
  isTotalName,
  MAX_QUANTITY,
  quantityOf,
} from "@/lib/rules";

describe("checkCell : quantité valide = entier de 0 à 50", () => {
  it("une cellule vide ou à 0 est valide : le client est sauté", () => {
    expect(checkCell(null)).toEqual({ empty: true, issue: null });
    expect(checkCell(0)).toEqual({ empty: true, issue: null });
    expect(checkCell("")).toEqual({ empty: true, issue: null });
    expect(checkCell("   ")).toEqual({ empty: true, issue: null });
  });

  it("accepte les entiers jusqu'à 50 inclus", () => {
    expect(MAX_QUANTITY).toBe(50);
    expect(checkCell(1)).toEqual({ empty: false, issue: null });
    expect(checkCell(50)).toEqual({ empty: false, issue: null });
  });

  it("signale (sans rien convertir) les textes, décimaux, négatifs et valeurs > 50", () => {
    expect(checkCell("3*0,2").issue).toBe("text");
    expect(checkCell("1*,02").issue).toBe("text");
    expect(checkCell("5").issue).toBe("text"); // un « 5 » écrit comme du texte reste à confirmer
    expect(checkCell(2.5).issue).toBe("decimal");
    expect(checkCell(-3).issue).toBe("negative");
    expect(checkCell(-2.5).issue).toBe("negative");
    expect(checkCell(51).issue).toBe("too-big");
    expect(checkCell(120).issue).toBe("too-big");
    expect(checkCell(Number.NaN).issue).toBe("text");
    expect(checkCell(Number.POSITIVE_INFINITY).issue).toBe("text");
  });
});

describe("quantityOf : une valeur douteuse vaut 0 tant qu'elle n'est pas corrigée ou confirmée", () => {
  it("renvoie les quantités valides", () => {
    expect(quantityOf(7, false)).toBe(7);
    expect(quantityOf(null, false)).toBe(0);
    expect(quantityOf(0, true)).toBe(0);
  });

  it("garde un décimal ou un grand nombre seulement après confirmation", () => {
    expect(quantityOf(2.5, false)).toBe(0);
    expect(quantityOf(2.5, true)).toBe(2.5);
    expect(quantityOf(120, false)).toBe(0);
    expect(quantityOf(120, true)).toBe(120);
  });

  it("un texte ou un négatif ne peuvent jamais être gardés", () => {
    expect(quantityOf("3*0,2", true)).toBe(0);
    expect(quantityOf(-4, true)).toBe(0);
    expect(canKeep("text")).toBe(false);
    expect(canKeep("negative")).toBe(false);
    expect(canKeep("decimal")).toBe(true);
    expect(canKeep("too-big")).toBe(true);
  });
});

describe("autres règles", () => {
  it("hasContent : ni vide ni zéro", () => {
    expect(hasContent(null)).toBe(false);
    expect(hasContent(0)).toBe(false);
    expect(hasContent("  ")).toBe(false);
    expect(hasContent(3)).toBe(true);
    expect(hasContent("abc")).toBe(true);
    expect(hasContent(-1)).toBe(true);
  });

  it("hasStar repère l'étoile n'importe où dans le nom", () => {
    expect(hasStar("Bleu *")).toBe(true);
    expect(hasStar("Yaourt pamp 0.5L*")).toBe(true);
    expect(hasStar("Yaourt nature")).toBe(false);
  });

  it("isTotalName reconnaît la ligne de totaux sans confondre un client", () => {
    for (const name of ["TOTAL", "total", " Total ", "Totaux"]) expect(isTotalName(name)).toBe(true);
    for (const name of ["Total Bio", "Subtotal", "", "Biocité"]) expect(isTotalName(name)).toBe(false);
  });

  it("cleanIntegerText propose une correction pour un entier écrit en texte", () => {
    expect(cleanIntegerText("5")).toBe(5);
    expect(cleanIntegerText(" 12 ")).toBe(12);
    expect(cleanIntegerText("3*0,2")).toBeNull();
    expect(cleanIntegerText("2,5")).toBeNull();
    expect(cleanIntegerText(5)).toBeNull();
    expect(cleanIntegerText(null)).toBeNull();
  });
});
