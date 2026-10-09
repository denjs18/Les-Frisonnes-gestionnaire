"use client";

import { Segmented, Sheet } from "@/components/controls";
import { Button } from "@/components/ui";
import type { Decision } from "@/hooks/usePrep";
import { SENSITIVITY_TEXT } from "@/lib/labels";
import { MIC_SENSITIVITIES, type MicSensitivity } from "@/lib/voice/sensitivity";
import type { Heard } from "@/lib/voice/service";

interface Props {
  value: MicSensitivity;
  onChange: (value: MicSensitivity) => void;
  /** Le micro est-il allumé ? */
  micOn: boolean;
  /** Dernier texte entendu et ce que l'appli en a fait (en « essai » : rien ne bouge à l'écran de préparation). */
  heard: Heard | null;
  decision: Decision | null;
  onClose: () => void;
}

/**
 * Régler la sensibilité du micro sur place, avec un essai en direct : on dit « suivant », on voit ce que l'appli a entendu,
 * avec quelle certitude, et si elle l'aurait pris en compte. Pratique dans la chambre froide, ventilateurs allumés.
 */
export function SensitivitySheet({ value, onChange, micOn, heard, decision, onClose }: Props) {
  const shown = heard && decision?.heard === heard.text ? decision : null;
  return (
    <Sheet title="Sensibilité du micro" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-base">
          Dans un endroit bruyant (ventilateurs, chambre froide), baissez la sensibilité : le micro réagit moins aux bruits.
        </p>
        <Segmented
          label="Sensibilité du micro"
          value={value}
          onChange={onChange}
          options={MIC_SENSITIVITIES.map((level) => ({ value: level, label: SENSITIVITY_TEXT[level].label }))}
        />
        <p data-testid="sensitivity-hint" className="text-sm text-muted">
          {SENSITIVITY_TEXT[value].hint}
        </p>

        <div className="rounded-2xl border-2 border-line bg-surface-2 p-3">
          <p className="font-extrabold">Essai : dites « suivant »</p>
          <p data-testid="sensitivity-test" aria-live="polite" className="mt-1 min-h-12 text-lg leading-snug">
            {heard ? (
              <>
                Entendu : «&nbsp;<strong>{heard.text}</strong>&nbsp;»
                {heard.confidence !== null && <span className="text-muted"> · {Math.round(heard.confidence * 100)} %</span>}
                {heard.rejected ? (
                  <strong className="ml-1 whitespace-nowrap text-warn-text">→ ignoré (pas assez net)</strong>
                ) : shown ? (
                  <strong className={`ml-1 whitespace-nowrap ${shown.label ? "text-ok" : "text-muted"}`}>
                    {shown.label ? `→ ${shown.label}` : "→ pas une commande"}
                  </strong>
                ) : null}
              </>
            ) : micOn ? (
              <span className="text-muted">J&apos;écoute…</span>
            ) : (
              <span className="text-muted">Le micro est coupé : touchez le badge « Micro » pour l&apos;allumer.</span>
            )}
          </p>
          <p className="text-sm text-muted">Pendant cet essai, rien ne change à l&apos;écran de préparation.</p>
        </div>

        <Button variant="primary" size="lg" onClick={onClose}>
          OK
        </Button>
      </div>
    </Sheet>
  );
}
