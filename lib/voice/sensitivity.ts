/**
 * Sensibilité du micro. Le navigateur ne laisse pas régler le volume d'écoute lui-même : ce réglage rend l'appli
 * plus ou moins exigeante sur ce que le micro lui rapporte (utile dans le bruit : ventilateurs, chambre froide…).
 */
export type MicSensitivity = "normal" | "low" | "very-low";

export const MIC_SENSITIVITIES: MicSensitivity[] = ["normal", "low", "very-low"];

export interface SensitivityProfile {
  /** Ne tenir compte que des résultats définitifs : un résultat provisoire resté stable n'est plus exécuté (ni affiché). */
  finalOnly: boolean;
  /** Confiance minimale (0 à 1) d'un résultat définitif ; en dessous, il est ignoré. Sans confiance indiquée, il est gardé. */
  minConfidence: number;
  /** Ne regarder que la meilleure hypothèse du micro, pas ses hypothèses de secours. */
  bestOnly: boolean;
}

export const SENSITIVITY_PROFILES: Record<MicSensitivity, SensitivityProfile> = {
  normal: { finalOnly: false, minConfidence: 0, bestOnly: false },
  low: { finalOnly: true, minConfidence: 0.6, bestOnly: true },
  "very-low": { finalOnly: true, minConfidence: 0.8, bestOnly: true },
};
