"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { CameraIcon } from "@/components/icons";
import { Banner, Button, Card } from "@/components/ui";
import { usePhotoStatus } from "@/hooks/usePhotoStatus";
import { ImportError } from "@/lib/import";
import { importPhotoTable } from "@/lib/import/photo";
import { preparePhoto, sendPhoto } from "@/lib/photo/client";
import { describePhotoError } from "@/lib/photo/messages";
import { browserStorage, PHOTO_CODE_KEY, writePhotoCopy } from "@/lib/storage";

type Phase = "idle" | "preparing" | "reading";

function savedCode(): string {
  try {
    return browserStorage()?.getItem(PHOTO_CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

/**
 * Importer le tableau depuis une photo. N'apparaît que si le site a une clé pour la lire (voir /api/lire-photo) :
 * sans elle, l'accueil reste exactement comme avant.
 */
export function PhotoCard() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const status = usePhotoStatus();
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Le code d'accès n'est affiché qu'après la réponse du site, donc après l'affichage de la page : le lire ici ne crée pas de décalage.
  const [code, setCode] = useState(savedCode);
  const session = state.session;

  // Quitter l'accueil pendant la lecture l'annule : on ne veut pas être ramené à la vérification sans l'avoir demandé.
  useEffect(() => () => abortRef.current?.abort(), []);

  if (!status?.available) return null;

  function changeCode(value: string) {
    setCode(value);
    try {
      browserStorage()?.setItem(PHOTO_CODE_KEY, value);
    } catch {
      // Stockage plein ou interdit : le code devra être retapé la prochaine fois.
    }
  }

  function choosePhoto() {
    setError(null);
    if (status?.needsCode && code.trim() === "") {
      setError("Tapez d'abord le code d'accès, puis choisissez la photo.");
      return;
    }
    inputRef.current?.click();
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    // La confirmation vient après le choix de la photo : le sélecteur doit s'ouvrir tout de suite au toucher.
    if (session && !window.confirm("Lire cette photo remplace la préparation en cours. Continuer ?")) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPhase("preparing");
    let done = false;
    try {
      const prepared = await preparePhoto(file);
      if (controller.signal.aborted) return;
      setPhase("reading");
      const table = await sendPhoto(prepared.upload, { code: status?.needsCode ? code.trim() : null, signal: controller.signal });
      const imported = importPhotoTable(table);
      // La copie doit être en place avant l'import : l'écran de vérification la cherche en s'ouvrant.
      writePhotoCopy(browserStorage(), prepared.copy);
      dispatch({
        type: "import",
        model: imported.model,
        importedAt: new Date().toISOString(),
        photo: { flagged: imported.flagged, note: imported.note },
      });
      done = true;
      router.push("/verification");
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof ImportError ? e.message : describePhotoError(e));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!done) setPhase("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const busy = phase !== "idle";

  return (
    <Card className="flex flex-col gap-3" data-testid="photo-card">
      <h2 className="font-serif text-2xl font-bold">Ou : une photo du tableau</h2>
      <p className="text-base text-muted">
        Prenez en photo le tableau (sur papier ou à l&apos;écran) : l&apos;appli le reconstitue. Vous comparerez le résultat avec la photo avant de
        commencer.
      </p>
      <p className="text-sm text-muted">
        La photo est envoyée à Google (service Gemini) pour être lue, avec une connexion Internet ; l&apos;appli ne la garde que sur ce
        téléphone.
      </p>
      {status.needsCode && (
        <div>
          <label htmlFor="photo-code" className="mb-1 block text-base font-bold">
            Code d&apos;accès
          </label>
          <input
            id="photo-code"
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            value={code}
            onChange={(event) => changeCode(event.target.value)}
            disabled={busy}
            className="h-12 w-full min-w-0 rounded-xl border-2 border-line bg-surface-2 px-3 text-base font-semibold"
          />
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        // L'appareil photo ou la galerie, au choix du téléphone.
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="photo-input"
        onChange={(event) => void onPhoto(event.target.files?.[0])}
      />
      <Button variant="secondary" size="xl" className="w-full" onClick={choosePhoto} disabled={busy}>
        <CameraIcon className="text-3xl" />
        Photo du tableau
      </Button>
      {busy && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl border-2 border-primary bg-primary-soft p-3" data-testid="photo-progress">
          <p className="animate-pulse text-lg font-bold">
            {phase === "preparing" ? "Préparation de la photo…" : "Lecture du tableau en cours…"}
          </p>
          {phase === "reading" && <p className="text-sm text-muted">Cela prend en général 10 à 30 secondes.</p>}
          <Button variant="ghost" className="self-start" onClick={cancel}>
            Annuler
          </Button>
        </div>
      )}
      {error && (
        <Banner tone="danger" role="alert">
          {error}
        </Banner>
      )}
    </Card>
  );
}
