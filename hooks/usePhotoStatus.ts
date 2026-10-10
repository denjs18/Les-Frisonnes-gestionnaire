"use client";

import { useEffect, useState } from "react";
import { fetchPhotoStatus } from "@/lib/photo/client";
import type { PhotoStatus } from "@/lib/photo/types";

/**
 * La lecture de photo est-elle prête sur ce site (la clé du service est-elle installée côté serveur) ?
 * `undefined` : on interroge encore le site ; `null` : on ne sait pas (pas de connexion) ; sinon la réponse du site.
 */
export function usePhotoStatus(): PhotoStatus | null | undefined {
  const [status, setStatus] = useState<PhotoStatus | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    void fetchPhotoStatus().then((result) => {
      if (!cancelled) setStatus(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return status;
}
