"use client";

import { useState } from "react";
import { Sheet } from "@/components/controls";
import { Button } from "@/components/ui";

interface Props {
  /** La copie de la photo gardée sur l'appareil (data URL), ou null si elle n'a pas pu être gardée. */
  src: string | null;
  /** La case à repérer sur la photo, quand on vient d'une valeur à vérifier. */
  look: { client: string; product: string } | null;
  onClose: () => void;
}

/** La photo d'où vient le tableau, à comparer avec lui. « Agrandir » la montre à 2,5 fois sa taille, qu'on fait défiler avec le doigt. */
export function PhotoSheet({ src, look, onClose }: Props) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <Sheet title="La photo du tableau" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {look && (
          <p className="text-base" data-testid="photo-look">
            À repérer sur la photo : <strong>{look.client}</strong> · <strong>{look.product}</strong>
          </p>
        )}
        {src ? (
          <>
            <div
              role="region"
              aria-label="Photo du tableau, à faire défiler"
              tabIndex={0}
              className="max-h-[52dvh] overflow-auto overscroll-contain rounded-2xl border-2 border-line bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- une copie enregistrée sur l'appareil, pas une image du site */}
              <img
                src={src}
                alt="Photo du tableau"
                data-testid="photo-image"
                className={zoomed ? "h-auto max-w-none" : "h-auto w-full"}
                style={zoomed ? { width: "250%" } : undefined}
              />
            </div>
            <Button variant="secondary" size="lg" onClick={() => setZoomed(!zoomed)} aria-pressed={zoomed}>
              {zoomed ? "Voir en entier" : "Agrandir"}
            </Button>
          </>
        ) : (
          <p className="text-base" data-testid="photo-missing">
            La photo n&apos;a pas pu être gardée sur cet appareil. Comparez avec la photo de votre téléphone.
          </p>
        )}
        <Button variant="primary" size="lg" onClick={onClose}>
          Fermer
        </Button>
      </div>
    </Sheet>
  );
}
