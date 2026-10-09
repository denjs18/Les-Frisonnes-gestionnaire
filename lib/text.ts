/** Retire les espaces parasites (début, fin, doublons, insécables, caractères invisibles). */
export function cleanText(input: string): string {
  return input
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripAccents(input: string): string {
  return input.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** Clé de comparaison : minuscules, sans accents, sans ponctuation, espaces simples. */
export function normalizeKey(input: string): string {
  return stripAccents(input)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
