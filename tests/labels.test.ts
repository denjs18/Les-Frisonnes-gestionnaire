import { describe, expect, it } from "vitest";
import { canReactivate, COLUMN_REASONS, describeMic, displayValue, issueMessage, ROW_REASONS } from "@/lib/labels";
import type { ListenerStatus } from "@/lib/voice/listener";

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
