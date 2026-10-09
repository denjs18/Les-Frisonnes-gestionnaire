import { describe, expect, it } from "vitest";
import { DEFAULT_ALIASES } from "@/lib/speech-text";
import {
  CommandGate,
  interpretCandidates,
  matchSimpleCommand,
  parseGoto,
  parseSpokenNumber,
  resolveGoto,
  resolveGotoDetailed,
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

describe("sensibilité réduite : seuls les mots principaux comptent", () => {
  const strict = { strict: true };

  it("écarte les variantes qu'un bruit de fond déclenche trop facilement", () => {
    for (const noise of ["stop", "retour", "next", "repeat", "suivante", "precedente", "reprend", "Où en suis-je ?"]) {
      expect(matchSimpleCommand(noise, strict), noise).toBeNull();
      expect(interpretCandidates([noise], strict), noise).toBeNull();
    }
  });

  it("garde tous les mots donnés dans l'aide", () => {
    const main: [string, string][] = [
      ["suivant", "next"],
      ["précédent", "prev"],
      ["répète", "repeat"],
      ["répéter", "repeat"],
      ["pause", "pause"],
      ["reprends", "resume"],
      ["reprendre", "resume"],
      ["où j'en suis", "where"],
    ];
    for (const [heard, command] of main) expect(matchSimpleCommand(heard, strict), heard).toBe(command);
  });

  it("en sensibilité normale, les variantes restent comprises", () => {
    expect(matchSimpleCommand("stop")).toBe("pause");
    expect(matchSimpleCommand("retour")).toBe("prev");
    expect(matchSimpleCommand("next")).toBe("next");
  });

  it("les commandes « reprends à… » ne changent pas", () => {
    expect(interpretCandidates(["reprends à fromage blanc"], strict)).toEqual({
      type: "goto",
      target: { product: "fromage blanc", client: null },
    });
  });
});

describe("parseSpokenNumber : les nombres dits à voix haute", () => {
  it("lit les chiffres et les nombres en toutes lettres de 1 à 99", () => {
    const cases: [string, number][] = [
      ["5", 5],
      ["12", 12],
      ["cinq", 5],
      ["Douze", 12],
      ["seize", 16],
      ["dix-sept", 17],
      ["dix huit", 18],
      ["vingt", 20],
      ["vingt et un", 21],
      ["vingt-deux", 22],
      ["trente", 30],
      ["quarante cinq", 45],
      ["soixante", 60],
      ["soixante-dix", 70],
      ["soixante et onze", 71],
      ["soixante-dix-sept", 77],
      ["quatre-vingts", 80],
      ["quatre vingt un", 81],
      ["quatre-vingt-dix", 90],
      ["quatre-vingt-dix-neuf", 99],
    ];
    for (const [spoken, number] of cases) expect(parseSpokenNumber(spoken), spoken).toBe(number);
  });

  it("refuse ce qui n'est pas un nombre de produit valable", () => {
    for (const spoken of ["", "zéro", "0", "cent", "100", "vingt dix", "trente quinze", "bonjour", "cinq six", "un yaourt"]) {
      expect(parseSpokenNumber(spoken), spoken).toBeNull();
    }
  });
});

describe("parseGoto : plus de façons de le dire", () => {
  it("comprend reviens, retourne, va, passe… avec à, au, sur, chez", () => {
    expect(parseGoto("reviens à fromage blanc")).toEqual({ product: "fromage blanc", client: null });
    expect(parseGoto("Retourne au yaourt citron pour Bob")).toEqual({ product: "yaourt citron", client: "bob" });
    expect(parseGoto("va chez Biocité")).toEqual({ product: "biocite", client: null });
    expect(parseGoto("passe au fromage")).toEqual({ product: "fromage", client: null });
    expect(parseGoto("reprendre sur petit frison")).toEqual({ product: "petit frison", client: null });
  });

  it("accepte « chez » ou « avec » pour séparer le produit du client", () => {
    expect(parseGoto("reprends à yaourt citron chez Bob")).toEqual({ product: "yaourt citron", client: "bob" });
    expect(parseGoto("reprends à fromage blanc avec Alice")).toEqual({ product: "fromage blanc", client: "alice" });
  });

  it("comprend « produit 5 », « numéro cinq » et « étape 3 », avec ou sans verbe", () => {
    expect(parseGoto("produit 5")).toEqual({ product: "", client: null, productNumber: 5 });
    expect(parseGoto("Produit numéro douze")).toEqual({ product: "", client: null, productNumber: 12 });
    expect(parseGoto("reprends au produit cinq pour Bob")).toEqual({ product: "", client: "bob", productNumber: 5 });
    expect(parseGoto("aller au numéro trois")).toEqual({ product: "", client: null, productNumber: 3 });
    expect(parseGoto("étape 3")).toEqual({ product: "", client: null, stepNumber: 3 });
    expect(parseGoto("reprends à l'étape quatre")).toEqual({ product: "", client: null, stepNumber: 4 });
  });

  it("comprend « reprends au début »", () => {
    expect(parseGoto("reprends au début")).toEqual({ product: "", client: null, start: true });
    expect(parseGoto("aller au premier produit")).toEqual({ product: "", client: null, start: true });
  });

  it("sans verbe, seules les phrases numérotées sont des commandes", () => {
    expect(parseGoto("fromage blanc")).toBeNull();
    expect(parseGoto("le produit est bon")).toBeNull();
    expect(parseGoto("produit")).toBeNull();
    expect(parseGoto("produit blanc")).toBeNull();
    expect(parseGoto("début")).toBeNull();
  });

  it("un produit dont le nom ressemble à « produit … » reste utilisable avec un verbe", () => {
    expect(parseGoto("reprends au produit blanc")).toEqual({ product: "produit blanc", client: null });
  });
});

describe("interpretCandidates : « aller à » tout seul", () => {
  it("donne de l'aide au lieu de ne rien faire", () => {
    for (const heard of ["aller à", "Reprendre à", "reviens au", "va sur"]) {
      expect(interpretCandidates([heard]), heard).toEqual({ type: "gotoHelp" });
    }
  });

  it("« reprends » seul reste « reprendre après la pause »", () => {
    expect(interpretCandidates(["reprends"])).toEqual({ type: "resume" });
  });

  it("comprend « produit 5 » dit seul", () => {
    expect(interpretCandidates(["produit 5"])).toEqual({ type: "goto", target: { product: "", client: null, productNumber: 5 } });
  });
});

describe("resolveGotoDetailed : trouver, hésiter ou ne rien trouver", () => {
  const rows = [
    ["Nom", "Fromage", "4 saisons morceaux", "Yaourt nature 0.5L", "FB 0,5", "FB 1", "Petit Frison"],
    ["Alice", 2, 3, 1, 4, null, 1],
    ["Bob", null, 5, null, null, 2, 2],
    ["Biocité", 1, null, 2, 1, 1, null],
    ["Amap Amboise +6l", 3, 1, null, null, null, 4],
  ];
  const ws = sheetOf(rows);
  const plan = buildPlan(ws, run(ws));
  const pos = (product: string, client: string | null) => ({ colPos: col(ws, product), rowPos: client === null ? null : row(ws, client) });
  const go = (target: Parameters<typeof resolveGotoDetailed>[1], current: { colPos: number; rowPos: number | null } | null = null) =>
    resolveGotoDetailed(plan, target, DEFAULT_ALIASES, current);

  it("retrouve un client seul dans le produit en cours (« reprends à Biocité »)", () => {
    const current = pos("Yaourt nature 0.5L", null);
    expect(go({ product: "biocité", client: null }, current)).toEqual({ kind: "found", position: pos("Yaourt nature 0.5L", "Biocité") });
    expect(go({ product: "amap amboise", client: null }, pos("Fromage", "Alice"))).toEqual({
      kind: "found",
      position: pos("Fromage", "Amap Amboise +6l"),
    });
  });

  it("un client qui n'a pas ce produit est introuvable (on ne saute pas ailleurs sans le dire)", () => {
    expect(go({ product: "bob", client: null }, pos("Fromage", null))).toEqual({ kind: "missing" });
  });

  it("un nom de produit l'emporte sur un nom de client", () => {
    expect(go({ product: "fromage", client: null }, pos("4 saisons morceaux", null))).toEqual({ kind: "found", position: pos("Fromage", null) });
  });

  it("dit quels produits conviennent quand c'est ambigu", () => {
    expect(go({ product: "fromage blanc", client: null })).toEqual({ kind: "ambiguous", noun: "produits", names: ["FB 0,5", "FB 1"] });
  });

  it("un client qui n'achète qu'un des produits possibles lève l'ambiguïté", () => {
    expect(go({ product: "fromage blanc", client: "alice" })).toEqual({ kind: "found", position: pos("FB 0,5", "Alice") });
    expect(go({ product: "fromage blanc", client: "bob" })).toEqual({ kind: "found", position: pos("FB 1", "Bob") });
    expect(go({ product: "fromage blanc", client: "biocité" })).toEqual({
      kind: "ambiguous",
      noun: "produits",
      names: ["FB 0,5", "FB 1"],
    });
    expect(go({ product: "fromage blanc", client: "amap" })).toEqual({ kind: "missing" });
  });

  it("dit quels clients conviennent quand c'est ambigu", () => {
    const twins = sheetOf([
      ["Nom", "Fromage"],
      ["Nature Champs", 1],
      ["Nature Plus", 2],
    ]);
    const twinPlan = buildPlan(twins, run(twins));
    expect(resolveGotoDetailed(twinPlan, { product: "fromage", client: "nature" }, DEFAULT_ALIASES)).toEqual({
      kind: "ambiguous",
      noun: "clients",
      names: ["Nature Champs", "Nature Plus"],
    });
  });

  it("comprend les nombres dits en toutes lettres et les mots coupés ou collés autrement", () => {
    expect(go({ product: "quatre saisons morceaux", client: null })).toEqual({ kind: "found", position: pos("4 saisons morceaux", null) });
    expect(go({ product: "yaourt nature zéro virgule cinq litre", client: null })).toEqual({
      kind: "found",
      position: pos("Yaourt nature 0.5L", null),
    });
    expect(go({ product: "petit frison", client: "bio cité" })).toEqual({ kind: "missing" }); // Biocité n'achète pas de Petit Frison
    expect(go({ product: "fromage", client: "bio cité" })).toEqual({ kind: "found", position: pos("Fromage", "Biocité") });
    expect(go({ product: "fromage blanc un", client: null })).toEqual({ kind: "found", position: pos("FB 1", null) });
  });

  it("ne tient pas compte du pluriel, ni d'une faute d'une lettre du micro", () => {
    expect(go({ product: "yaourts nature", client: null })).toEqual({ kind: "found", position: pos("Yaourt nature 0.5L", null) });
    expect(go({ product: "petit frizon", client: null })).toEqual({ kind: "found", position: pos("Petit Frison", null) });
    expect(go({ product: "petit pizon", client: null })).toEqual({ kind: "missing" });
  });

  it("« produit 3 » et « étape 3 »", () => {
    expect(go({ product: "", client: null, productNumber: 3 })).toEqual({ kind: "found", position: pos("Yaourt nature 0.5L", null) });
    expect(go({ product: "", client: "bio cité", productNumber: 1 })).toEqual({ kind: "found", position: pos("Fromage", "Biocité") });
    expect(go({ product: "", client: null, productNumber: 99 })).toEqual({ kind: "missing" });
    const here = pos("Fromage", null);
    expect(go({ product: "", client: null, stepNumber: 1 }, here)).toEqual({ kind: "found", position: pos("Fromage", null) });
    expect(go({ product: "", client: null, stepNumber: 2 }, here)).toEqual({ kind: "found", position: pos("Fromage", "Alice") });
    expect(go({ product: "", client: null, stepNumber: 4 }, here)).toEqual({ kind: "found", position: pos("Fromage", "Amap Amboise +6l") });
    expect(go({ product: "", client: null, stepNumber: 9 }, here)).toEqual({ kind: "missing" });
  });

  it("« reprends au début » vise la première étape", () => {
    expect(go({ product: "", client: null, start: true }, pos("FB 1", "Bob"))).toEqual({ kind: "found", position: pos("Fromage", null) });
  });

  it("sans produit à préparer, rien n'est trouvé", () => {
    const empty = buildPlan(sheetOf([["Nom", "Fromage"], ["Alice", null]]), run(sheetOf([["Nom", "Fromage"], ["Alice", null]])));
    expect(resolveGotoDetailed(empty, { product: "fromage", client: null }, DEFAULT_ALIASES)).toEqual({ kind: "missing" });
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
