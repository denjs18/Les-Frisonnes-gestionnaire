"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { FarmScene } from "@/components/brand/Illustrations";
import { HelpIcon, PlayIcon, TableIcon, UploadIcon } from "@/components/icons";
import { Logo } from "@/components/Logo";
import { Banner, Button, ButtonLink, Card, Page, ScreenHeader, Skeleton } from "@/components/ui";
import { count } from "@/lib/format";
import { importFile, ImportError, spreadsheetImporter } from "@/lib/import";
import type { Session } from "@/lib/state";
import { currentStep, type View } from "@/lib/view";
import { voice } from "@/lib/voice/service";

function describe(session: Session, view: View): { title: string; detail: string } {
  const pending = view.analysis.pending.length;
  if (session.status === "done") return { title: "Préparation terminée", detail: "Vous pouvez la refaire ou revoir le tableau." };
  if (session.status === "preparing") {
    const step = currentStep(session, view);
    if (step) {
      return {
        title: "Préparation en cours",
        detail: `Produit ${step.productNumber}/${step.productCount} · Étape ${step.stepNumber}/${step.stepCount}`,
      };
    }
  }
  return pending > 0
    ? { title: "Tableau à vérifier", detail: `${count(pending, "valeur", "valeurs")} à vérifier` }
    : { title: "Tableau prêt", detail: "Vérifiez-le, puis commencez la préparation." };
}

export function HomeScreen() {
  const { state, view, dispatch } = useApp();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const session = state.session;

  function chooseFile() {
    setError(null);
    if (session && !window.confirm("Importer un nouveau fichier remplace la préparation en cours. Continuer ?")) return;
    inputRef.current?.click();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const model = await importFile(file);
      dispatch({ type: "import", model, importedAt: new Date().toISOString() });
      router.push("/verification");
    } catch (e) {
      setError(
        e instanceof ImportError ? e.message : "Ce fichier n'a pas pu être ouvert. Essayez avec un fichier Excel (.xlsx) ou CSV.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function resume() {
    voice.unlock(); // un clic est nécessaire pour que le navigateur autorise la voix
    dispatch({ type: "resume" });
    router.push("/preparation");
  }

  if (!state.loaded) {
    return (
      <>
        <ScreenHeader title="Prépa Commandes" />
        <Skeleton />
      </>
    );
  }

  const summary = session && view ? describe(session, view) : null;
  const canResume =
    session?.status === "preparing" && view !== null && view.plan.steps.length > 0 && view.analysis.pending.length === 0;

  return (
    <>
      <ScreenHeader title="Prépa Commandes" />
      <Page className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Logo size={104} />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Fromagerie des Frisonnes</p>
            <p className="mt-1 font-serif text-2xl font-bold leading-snug">
              Le total à sortir, puis chaque client, à voix haute.
            </p>
          </div>
        </div>
        <FarmScene className="h-auto w-full" />

        {session && summary && (
          <Card className="flex flex-col gap-3 border-2 border-primary">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-muted">En cours</p>
              <h2 className="font-serif text-3xl font-bold leading-tight">{summary.title}</h2>
              <p className="text-lg font-semibold">{summary.detail}</p>
              <p className="mt-1 break-words text-sm text-muted">
                {session.model.fileName} · importé le{" "}
                {new Date(session.importedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
              </p>
            </div>
            {canResume && (
              <Button variant="ok" size="xl" className="w-full" onClick={resume}>
                <PlayIcon className="text-3xl" />
                Reprendre la préparation
              </Button>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <ButtonLink href="/verification" variant={canResume ? "secondary" : "primary"} size="lg">
                <TableIcon className="text-2xl" />
                Voir le tableau
              </ButtonLink>
              {session.status === "done" && (
                <ButtonLink href="/fin" variant="secondary" size="lg">
                  Voir le récapitulatif
                </ButtonLink>
              )}
            </div>
          </Card>
        )}

        <Card className="flex flex-col gap-3">
          <h2 className="font-serif text-2xl font-bold">{session ? "Nouveau fichier" : "Commencer"}</h2>
          <p className="text-base text-muted">
            Choisissez le tableau des commandes ({spreadsheetImporter.label}). Le fichier est lu sur cet appareil et n&apos;est
            envoyé nulle part.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={spreadsheetImporter.accept}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="file-input"
            onChange={(event) => void onFile(event.target.files?.[0])}
          />
          <Button variant={session ? "secondary" : "primary"} size="xl" className="w-full" onClick={chooseFile} disabled={busy}>
            <UploadIcon className="text-3xl" />
            {busy ? "Lecture du fichier…" : "Importer un fichier"}
          </Button>
          {error && (
            <Banner tone="danger" role="alert">
              {error}
            </Banner>
          )}
        </Card>

        <ButtonLink href="/aide" variant="secondary" size="lg">
          <HelpIcon className="text-2xl" />
          Comment ça marche ?
        </ButtonLink>
      </Page>
    </>
  );
}
