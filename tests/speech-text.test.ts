import { describe, expect, it } from "vitest";
import { DEFAULT_ALIASES, stepSentence, toSpoken, whereSentence } from "@/lib/speech-text";
import type { Step } from "@/lib/steps";

const say = (name: string, aliases = DEFAULT_ALIASES) => toSpoken(name, aliases);

describe("toSpoken : lecture naturelle des noms", () => {
  it("lit « 0.5L » comme « 0,5 litre »", () => {
    expect(say("Yaourt nature 0.5L")).toBe("Yaourt nature 0,5 litre");
    expect(say("Yaourt Menthe 0,5L")).toBe("Yaourt Menthe 0,5 litre");
    expect(say("Yaourt citron 0.5 L")).toBe("Yaourt citron 0,5 litre");
  });

  it("met « litre » au pluriel à partir de 2", () => {
    expect(say("Yaourt nature 1L")).toBe("Yaourt nature 1 litre");
    expect(say("Poterie +2L")).toBe("Poterie plus 2 litres");
    expect(say("Amap Amboise +6l")).toBe("Amap Amboise plus 6 litres");
    expect(say("Civray+2L")).toBe("Civray plus 2 litres");
  });

  it("lit les grammes et les autres unités", () => {
    expect(say("Le Tartinable 300gr")).toBe("Le Tartinable 300 grammes");
    expect(say("Fromage 150g")).toBe("Fromage 150 grammes");
    expect(say("Beurre 2kg")).toBe("Beurre 2 kilos");
    expect(say("Beurre 1,5kg")).toBe("Beurre 1,5 kilo");
    expect(say("Crème 50cl")).toBe("Crème 50 centilitres");
    expect(say("Lait 33 ml")).toBe("Lait 33 millilitres");
  });

  it("ne confond pas une unité avec le début d'un mot", () => {
    expect(say("3 lait")).toBe("3 lait");
    expect(say("2 gros pots")).toBe("2 gros pots");
    expect(say("5 gâteaux")).toBe("5 gâteaux");
  });

  it("applique les alias par défaut : FB devient fromage blanc", () => {
    expect(say("FB 0,5")).toBe("fromage blanc 0,5");
    expect(say("FB 1")).toBe("fromage blanc 1");
    expect(say("Le TartiAil/Ciboulette 300gr")).toBe("Le tarti ail Ciboulette 300 grammes");
    expect(say("Yaourt pamp 0.5L*")).toBe("Yaourt pamplemousse 0,5 litre");
    expect(say("SPDC")).toBe("S P D C");
    expect(say("Coopnat TN")).toBe("Coopnat T N");
  });

  it("applique les alias en mot entier et sans tenir compte de la casse", () => {
    expect(say("fb nature")).toBe("fromage blanc nature");
    expect(say("FBI")).toBe("FBI");
    expect(say("Rouge FB")).toBe("Rouge fromage blanc");
    expect(say("FB FB")).toBe("fromage blanc fromage blanc");
  });

  it("accepte des alias personnalisés, même avec des caractères spéciaux", () => {
    const aliases = [
      { from: "C++", to: "c plus plus" },
      { from: "Nature Champs", to: "nature champ" },
      { from: "  ", to: "ignoré" },
      { from: "", to: "ignoré aussi" },
    ];
    expect(toSpoken("Club C++ 2", aliases)).toBe("Club c plus plus 2");
    expect(toSpoken("Nature Champs", aliases)).toBe("nature champ");
    expect(toSpoken("Rien à changer", aliases)).toBe("Rien à changer");
  });

  it("préfère l'alias le plus long", () => {
    const aliases = [
      { from: "FB", to: "fromage blanc" },
      { from: "FB 0,5", to: "fromage blanc demi-litre" },
    ];
    expect(toSpoken("FB 0,5", aliases)).toBe("fromage blanc demi-litre");
  });

  it("nettoie les symboles et les espaces", () => {
    expect(say("  Pain  &  beurre (bio) ")).toBe("Pain et beurre bio");
    expect(say("Yaourt orange 0.5")).toBe("Yaourt orange 0,5");
  });
});

function step(overrides: Partial<Step>): Step {
  return {
    id: "1:T",
    kind: "total",
    colPos: 1,
    rowPos: null,
    productIndex: 2,
    productName: "Yaourt nature 0.5L",
    clientName: null,
    quantity: 38,
    productNumber: 3,
    productCount: 17,
    stepNumber: 1,
    stepCount: 9,
    ...overrides,
  };
}

describe("phrases dictées", () => {
  it("TOTAL : « 38 yaourt nature 0,5 litre »", () => {
    expect(stepSentence(step({}), DEFAULT_ALIASES)).toBe("38 Yaourt nature 0,5 litre");
  });

  it("client : « 4 pour Nature Champs »", () => {
    const s = step({ kind: "client", clientName: "Nature Champs", quantity: 4, stepNumber: 4, rowPos: 3 });
    expect(stepSentence(s, DEFAULT_ALIASES)).toBe("4 pour Nature Champs");
  });

  it("lit les quantités décimales avec une virgule", () => {
    const s = step({ kind: "client", clientName: "Biocité", quantity: 2.5 });
    expect(stepSentence(s, DEFAULT_ALIASES)).toBe("2,5 pour Biocité");
  });

  it("« où j'en suis » donne le produit, l'étape et la phrase en cours", () => {
    const s = step({ kind: "client", clientName: "Nature Champs", quantity: 4, stepNumber: 4 });
    expect(whereSentence(s, DEFAULT_ALIASES)).toBe(
      "Produit 3 sur 17, Yaourt nature 0,5 litre. Étape 4 sur 9 : 4 pour Nature Champs.",
    );
  });
});
