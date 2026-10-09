import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Garde-fou : la charte de couleurs (app/globals.css) doit rester très lisible, en clair comme en sombre.
 * Seuils WCAG : 7:1 pour le texte principal, 4,5:1 pour les autres textes, 3:1 pour les éléments d'interface.
 */
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2].toLowerCase()]));
}

const light = tokens(/:root\s*\{([^}]*)\}/.exec(css)![1]);
const dark = { ...light, ...tokens(/html\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css)![1]) };

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [texte, fond, minimum] */
const PAIRS: [string, string, number][] = [
  ["fg", "bg", 7],
  ["fg", "surface", 7],
  ["fg", "surface-2", 7],
  ["fg", "primary-soft", 7],
  ["fg", "warn-soft", 7],
  ["fg", "ok-soft", 7],
  ["fg", "danger-soft", 7],
  ["muted", "bg", 4.5],
  ["muted", "surface", 4.5],
  ["muted", "surface-2", 4.5],
  ["primary-fg", "primary", 4.5],
  ["accent-fg", "accent", 7],
  ["warn-fg", "warn", 4.5],
  ["ok-fg", "ok", 4.5],
  ["danger-fg", "danger", 4.5],
  ["warn-text", "bg", 4.5],
  ["warn-text", "surface", 4.5],
  ["ok", "bg", 4.5],
  ["ok", "surface", 4.5],
  // éléments d'interface : un bouton ou une pastille doit se détacher du fond
  ["primary", "bg", 3],
  ["primary", "surface", 3],
  ["accent", "bg", 1.3],
];

describe.each([
  ["clair", light],
  ["sombre", dark],
] as const)("contraste du thème %s", (_name, theme) => {
  it("définit tous les jetons attendus", () => {
    for (const [fg, bg] of PAIRS) {
      expect(theme[fg], `jeton --${fg}`).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme[bg], `jeton --${bg}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(PAIRS)("%s sur %s : au moins %s:1", (fg, bg, minimum) => {
    const ratio = contrast(theme[fg], theme[bg]);
    expect(ratio, `${fg} ${theme[fg]} sur ${bg} ${theme[bg]} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimum);
  });
});
