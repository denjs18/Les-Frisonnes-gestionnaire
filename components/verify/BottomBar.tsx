"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Au-delà de cette part de la hauteur de l'écran, la barre ne reste plus collée en bas : elle cacherait le tableau. */
const MAX_SHARE = 0.4;

/**
 * La barre du bas de l'écran de vérification (le gros bouton « commencer »). Collée en bas de l'écran pour rester à portée,
 * sauf quand elle en prend une trop grande part (texte très agrandi sur un petit téléphone) : elle passe alors à la fin de la
 * page, sans quoi elle recouvrirait le tableau et empêcherait de toucher les valeurs.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [floating, setFloating] = useState(true);

  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const measure = () => setFloating(bar.offsetHeight <= window.innerHeight * MAX_SHARE);
    // L'observateur mesure dès qu'il commence, puis à chaque changement de taille de la barre (texte plus long, autre réglage).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(bar);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-floating={floating}
      className={`${floating ? "sticky bottom-0" : ""} z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_14px_-12px_rgb(0_0_0/0.35)]`}
    >
      {children}
    </div>
  );
}
