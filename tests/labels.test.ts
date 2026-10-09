import { describe, expect, it } from "vitest";
import { canReactivate, COLUMN_REASONS, describeMic, describeSpeechProblem, displayValue, issueMessage, ROW_REASONS } from "@/lib/labels";
import type { Platform } from "@/lib/platform";
import type { ListenerStatus } from "@/lib/voice/listener";
import type { SpeechProblem } from "@/lib/voice/speaker";

const ANDROID_CHROME: Platform = { os: "android", browser: "chrome", inAppBrowser: false };
const ANDROID_FIREFOX: Platform = { os: "android", browser: "firefox", inAppBrowser: false };
const ANDROID_FACEBOOK: Platform = { os: "android", browser: "chrome", inAppBrowser: true };
const IPHONE_SAFARI: Platform = { os: "ios", browser: "safari", inAppBrowser: false };
const IPHONE_FACEBOOK: Platform = { os: "ios", browser: "other", inAppBrowser: true };

describe("describeMic", () => {
  const STATUSES: ListenerStatus[] = ["unsupported", "off", "starting", "listening", "suspended", "denied", "unavailable", "no-mic", "network", "error"];

  it("décrit chaque état du micro, avec une explication pour les problèmes", () => {
    for (const status of STATUSES) {
      const mic = describeMic(status);
      expect(mic.label, status).not.toBe("");
      if (!mic.on && status !== "off") expect(mic.hint, status).toMatch(/\S/);
    }
  });

  it("le micro est « actif » même quand l'écoute est brièvement coupée pendant que l'appli parle", () => {
    expect(describeMic("listening")).toMatchObject({ on: true, listening: true, tone: "ok" });
    expect(describeMic("suspended")).toMatchObject({ on: true, listening: false, tone: "ok" });
    expect(describeMic("off")).toMatchObject({ on: false, label: "Micro inactif" });
  });

  it("distingue un refus d'autorisation d'une reconnaissance indisponible sur l'appareil", () => {
    expect(describeMic("denied").hint).toMatch(/Autorisez le micro/);
    expect(describeMic("unavailable").hint).toMatch(/iPhone/);
    expect(describeMic("unavailable").hint).not.toMatch(/Autorisez/);
  });

  it("donne les bons conseils sur Android : où autoriser le micro, quoi vérifier, quel navigateur ouvrir", () => {
    expect(describeMic("denied", ANDROID_CHROME).hint).toMatch(/Autorisez le micro/);
    expect(describeMic("denied", ANDROID_CHROME).hint).toMatch(/Infos sur l'appli/);
    expect(describeMic("unavailable", ANDROID_CHROME).hint).toMatch(/application Google/);
    expect(describeMic("unavailable", ANDROID_CHROME).hint).not.toMatch(/iPhone/);
    expect(describeMic("unsupported", ANDROID_FIREFOX).hint).toMatch(/Chrome/);
    expect(describeMic("unsupported", ANDROID_CHROME).hint).not.toMatch(/Ouvrez/);
  });

  it("dans le navigateur intégré d'une autre appli, conseille d'ouvrir le vrai navigateur", () => {
    expect(describeMic("unsupported", ANDROID_FACEBOOK).hint).toMatch(/intégré à une autre appli.*Chrome/);
    expect(describeMic("unsupported", IPHONE_FACEBOOK).hint).toMatch(/intégré à une autre appli.*Safari/);
  });

  it("garde les conseils d'origine sur iPhone et sur ordinateur", () => {
    expect(describeMic("unavailable", IPHONE_SAFARI).hint).toBe(describeMic("unavailable").hint);
    expect(describeMic("denied", IPHONE_SAFARI).hint).toBe(describeMic("denied").hint);
    expect(describeMic("unsupported", IPHONE_SAFARI).hint).toBe(describeMic("unsupported").hint);
  });
});

describe("describeSpeechProblem", () => {
  const PROBLEMS: SpeechProblem[] = ["no-voice", "network", "failed"];

  it("donne à chaque panne de la voix un titre court et une explication qui rappelle que l'écran suffit pour continuer", () => {
    for (const problem of PROBLEMS) {
      for (const platform of [ANDROID_CHROME, IPHONE_SAFARI, undefined]) {
        const { title, hint } = describeSpeechProblem(problem, platform);
        expect(title.length, problem).toBeGreaterThan(0);
        expect(title.length, problem).toBeLessThanOrEqual(40); // tient sur une ligne, repliée
        expect(hint, problem).toMatch(/étapes à l'écran|Répéter/);
      }
    }
  });

  it("dit où installer une voix française, selon le téléphone", () => {
    expect(describeSpeechProblem("no-voice", ANDROID_CHROME).hint).toMatch(/Synthèse vocale/);
    expect(describeSpeechProblem("no-voice", IPHONE_SAFARI).hint).toMatch(/Contenu énoncé/);
    expect(describeSpeechProblem("no-voice").hint).toMatch(/voix française/);
  });
});

describe("textes affichés", () => {
  it("chaque raison d'exclusion a une explication courte et une longue", () => {
    for (const reason of [...Object.values(COLUMN_REASONS), ...Object.values(ROW_REASONS)]) {
      expect(reason.short.length).toBeGreaterThan(0);
      expect(reason.short.length).toBeLessThanOrEqual(14);
      expect(reason.long).toMatch(/\.$/);
    }
  });

  it("« sans quantité » ne se réactive pas à la main : une saisie suffit", () => {
    expect(canReactivate("no-quantity")).toBe(false);
    expect(canReactivate("star")).toBe(true);
    expect(canReactivate("manual")).toBe(true);
  });

  it("explique les valeurs douteuses avec la valeur d'origine", () => {
    expect(issueMessage("text", "3*0,2")).toContain("« 3*0,2 » n'est pas un nombre");
    expect(issueMessage("decimal", 2.5)).toContain("2,5 n'est pas un nombre entier");
    expect(issueMessage("negative", -1)).toContain("-1 est négatif");
    expect(issueMessage("too-big", 120)).toContain("120 dépasse 50");
  });

  it("affiche les valeurs avec la virgule française", () => {
    expect(displayValue(null)).toBe("");
    expect(displayValue(2.5)).toBe("2,5");
    expect(displayValue("abc")).toBe("abc");
  });
});
