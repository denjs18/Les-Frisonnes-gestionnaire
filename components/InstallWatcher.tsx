"use client";

import { watchInstall } from "@/lib/install";

// Dès le chargement de ce fichier, avant même l'affichage de l'accueil : le navigateur n'envoie
// l'événement d'installation (« beforeinstallprompt ») qu'une fois, peu après le chargement de la page.
watchInstall();

/** Présent dans toutes les pages (voir `app/layout.tsx`) pour que le suivi de l'installation soit chargé partout. */
export function InstallWatcher() {
  return null;
}
