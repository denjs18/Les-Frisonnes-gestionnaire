/** Arrondit à 3 décimales pour éviter les 0,1 + 0,2 = 0,30000000000000004. */
export function roundQuantity(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** 38 -> "38" ; 2.5 -> "2,5" (virgule française, lue correctement par la voix). */
export function formatQuantity(n: number): string {
  return String(roundQuantity(n)).replace(".", ",");
}

/** En français, 0 et 1 sont au singulier. */
export function plural(n: number, one: string, many: string): string {
  return n >= 2 ? many : one;
}

/** "1 client" / "15 clients". */
export function count(n: number, one: string, many: string): string {
  return `${n} ${plural(n, one, many)}`;
}
