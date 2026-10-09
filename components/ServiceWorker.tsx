"use client";

import { useEffect } from "react";

/** Enregistre le service worker (utilisation hors connexion, installation sur l'écran d'accueil). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(async () => {
        // Rafraîchit le cache hors connexion (nouvelle version éventuelle de l'appli).
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage("precache");
        // Charge dès maintenant le lecteur Excel (mis en cache par le service worker) :
        // sans cela, importer un fichier hors connexion ne marcherait pas la première fois.
        const warmUp = () => void import("@/lib/import/xlsx").catch(() => {});
        if ("requestIdleCallback" in window) window.requestIdleCallback(warmUp);
        else setTimeout(warmUp, 3000);
      })
      .catch(() => {
        // pas grave : l'appli fonctionne très bien sans
      });
  }, []);
  return null;
}
