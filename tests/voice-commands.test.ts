import { describe, expect, it } from "vitest";
import { DEFAULT_ALIASES } from "@/lib/speech-text";
import {
  CommandGate,
  interpretCandidates,
  matchSimpleCommand,
  parseGoto,
  resolveGoto,
} from "@/lib/voice-commands";
import { buildPlan } from "@/lib/steps";
import { col, row, run, sheetOf } from "./helpers";

describe("matchSimpleCommand : seulement les mots exacts", () => {
  it("reconnaît les six commandes, quelles que soient la casse, les accents et la ponctuation", () => {
    const cases: [string, string][] = [
      ["suivant", "next"],
      ["Suivant !", "next"],
      ["SUIVANTE.", "next"],
      ["précédent", "prev"],
      ["Précédent", "prev"],
      ["répète", "repeat"],
      ["Répéter", "repeat"],
      ["pause", "pause"],
      ["Pause.", "pause"],
      ["reprends", "resume"],
      ["Reprendre", "resume"],
      ["où j'en suis", "where"],
      ["Où en suis-je ?", "where"],
      ["où j’en suis", "where"],
    ];
    for (const [heard, command] of cases) expect(matchSimpleCommand(heard), heard).toBe(command);
  });

  it("ignore tout ce qui n'est pas exactement une commande (bruit, conversations)", () => {
    const noise = [
      "",
      "   ",
      "je suis suivant",
      "suivant s'il vous plaît",
      "le suivant c'est toi",
      "la pause café",
      "oui d'accord",
      "précédemment",
      "suivant suivant",
      "reprends ta place",
      "répète après moi",
      "pas de pause",
    ];
    for (const heard of noise) expect(matchSimpleCommand(heard), heard).toBeNull();
  });
});

describe("parseGoto : « reprendre à <produit> pour <client> »", () => {
  it("sépare le produit et le client", () => {
    expect(parseGoto("reprends à yaourt nature pour Nature Champs")).toEqual({
      product: "yaourt nature",
      client: "nature champs",
    });
    expect(parseGoto("Reprendre au fromage blanc pour Biocité")).toEqual({
      product: "fromage blanc",
      client: "biocite",
    });
  });

  it("accepte un produit seul : on retombe sur son étape TOTAL", () => {
    expect(parseGoto("reprends au yaourt citron")).toEqual({ product: "yaourt citron", client: null });
    expect(parseGoto("aller à petit frison")).toEqual({ product: "petit frison", client: null });
  });

  it("refuse ce qui ne ressemble pas à cette commande", () => {
    expect(parseGoto("reprends")).toBeNull();
    expect(parseGoto("reprends à")).toBeNull();
    expect(parseGoto("je reprends à zéro")).toBeNull();
    expect(parseGoto("suivant")).toBeNull();
  });
});

describe("interpretCandidates", () => {
  it("prend la meilleure hypothèse si c'est une commande", () => {
    expect(interpretCandidates(["suivant", "suivante"])).toEqual({ type: "next" });
    expect(interpretCandidates(["pause"])).toEqual({ type: "pause" });
  });

  it("peut utiliser une hypothèse de secours quand le meilleur texte est très court", () => {
    expect(interpretCandidates(["suivent", "suivant"])).toEqual({ type: "next" });
    expect(interpretCandidates(["sur vent", "suivant"])).toEqual({ type: "next" });
  });

  it("n'utilise jamais une hypothèse de secours pour sauver une vraie phrase", () => {
    expect(interpretCandidates(["je suis en train de parler", "suivant"])).toBeNull();
    expect(interpretCandidates(["oui je pense que", "pause"])).toBeNull();
  });

  it("reconnaît « reprendre à… »", () => {
    expect(interpretCandidates(["reprends à yaourt pour biocité"])).toEqual({
      type: "goto",
      target: { product: "yaourt", client: "biocite" },
    });
  });

  it("ne fait rien sans texte ou sans commande", () => {
    expect(interpretCandidates([])).toBeNull();
    expect(interpretCandidates(["bonjour tout le monde"])).toBeNull();
  });
});

describe("resolveGoto", () => {
  function planFor(rows: (string | number | null)[][]) {
    const ws = sheetOf(rows);
    return { ws, plan: buildPlan(ws, run(ws)) };
  }

  const { ws, plan } = planFor([
    ["Nom", "Fromage", "Yaourt citron", "Yaourt nature 1L", "FB 0,5", "FB 1"],
    ["Alice", 2, 3, 1, 4, null],
    ["Bob", null, 5, null, null, 2],
    ["Nature Champs", 1, null, 2, 1, 1],
  ]);
  const go = (product: string, client: string | null) =>
    resolveGoto(plan, { product, client }, DEFAULT_ALIASES);

  it("retrouve un produit et un client", () => {
    expect(go("yaourt citron", "bob")).toEqual({ colPos: col(ws, "Yaourt citron"), rowPos: row(ws, "Bob") });
    expect(go("fromage", "nature champs")).toEqual({ colPos: col(ws, "Fromage"), rowPos: row(ws, "Nature Champs") });
  });

  it("sans client, vise l'étape TOTAL du produit", () => {
    expect(go("fromage", null)).toEqual({ colPos: col(ws, "Fromage"), rowPos: null });
  });

  it("ignore les petits mots (le, la, du…)", () => {
    expect(go("le fromage", "chez alice")).toEqual({ colPos: col(ws, "Fromage"), rowPos: row(ws, "Alice") });
  });

  it("refuse quand c'est ambigu, inconnu, ou quand le client n'a pas ce produit", () => {
    expect(go("yaourt", null)).toBeNull(); // yaourt citron ET yaourt nature
    expect(go("pizza", null)).toBeNull();
    expect(go("fromage", "bob")).toBeNull(); // Bob n'a pas de fromage
    expect(go("fromage", "zoé")).toBeNull();
    expect(go("", null)).toBeNull();
  });

  it("comprend les alias : « fromage blanc » désigne FB", () => {
    expect(go("fromage blanc 1", null)).toEqual({ colPos: col(ws, "FB 1"), rowPos: null });
    expect(go("fromage blanc", null)).toBeNull(); // FB 0,5 et FB 1
    expect(go("fb 0 5", "alice")).toEqual({ colPos: col(ws, "FB 0,5"), rowPos: row(ws, "Alice") });
  });
});

describe("CommandGate : délai anti-rebond", () => {
  it("refuse une deuxième commande trop proche de la première", () => {
    const gate = new CommandGate(1500);
    expect(gate.allow(1000)).toBe(true);
    expect(gate.allow(1200)).toBe(false);
    expect(gate.allow(2499)).toBe(false);
    expect(gate.allow(2500)).toBe(true);
  });

  it("une commande refusée ne prolonge pas le délai", () => {
    const gate = new CommandGate(1000);
    gate.allow(0);
    gate.allow(900); // refusée
    expect(gate.allow(1000)).toBe(true);
  });

  it("peut être remis à zéro", () => {
    const gate = new CommandGate(1000);
    gate.allow(0);
    gate.reset();
    expect(gate.allow(10)).toBe(true);
  });
});
