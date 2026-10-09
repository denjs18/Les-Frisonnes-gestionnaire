"use client";

import { useSyncExternalStore } from "react";
import { currentPlatform, UNKNOWN_PLATFORM, type Platform } from "@/lib/platform";

/** Téléphone et navigateur utilisés (inconnus côté serveur : le premier affichage ne donne aucun conseil particulier). */
export function usePlatform(): Platform {
  return useSyncExternalStore(
    () => () => {},
    currentPlatform,
    () => UNKNOWN_PLATFORM,
  );
}
