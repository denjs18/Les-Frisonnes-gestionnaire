"use client";

import { useSyncExternalStore } from "react";
import { install, type InstallSnapshot } from "@/lib/install";

/** Où en est l'installation de l'appli sur l'écran d'accueil (bouton « Installer » possible, déjà installée, carte masquée). */
export function useInstall(): InstallSnapshot {
  return useSyncExternalStore(install.subscribe, install.getSnapshot, install.getServerSnapshot);
}
