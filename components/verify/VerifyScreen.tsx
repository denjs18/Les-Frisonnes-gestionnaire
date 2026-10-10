"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useApp, useRequireSession } from "@/components/AppProvider";
import { Switch } from "@/components/controls";
import { AlertIcon, CameraIcon, CheckIcon } from "@/components/icons";
import { Banner, Button, Card, Page, ScreenHeader, Skeleton } from "@/components/ui";
import { columnLabel, rowLabel } from "@/lib/analysis";
import { count } from "@/lib/format";
import { browserStorage, readPhotoCopy } from "@/lib/storage";
import { voice } from "@/lib/voice/service";
import { BottomBar } from "./BottomBar";
import { CellEditor } from "./CellEditor";
import { GridTable } from "./GridTable";
import { IgnoredLists } from "./IgnoredLists";
import { ItemSheet } from "./ItemSheet";
import { PhotoSheet } from "./PhotoSheet";

type Open =
  | { type: "cell"; r: number; c: number }
  | { type: "item"; kind: "column" | "row"; index: number }
  /** La photo d'où vient le tableau ; `back` : la valeur qu'on était en train de vérifier, qui se rouvre à la fermeture. */
  | { type: "photo"; back: { r: number; c: number } | null }
  | null;

export function VerifyScreen() {
  const ready = useRequireSession();
  const { state, view, dispatch } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  const session = state.session;
  const fromPhoto = session?.source === "photo";
  const importedAt = session?.importedAt;
  // La copie de la photo est lue une fois par import (elle est lourde), et seulement quand l'écran est prêt (donc après l'affichage).
  const photoCopy = useMemo(
    () => (ready && fromPhoto && importedAt !== undefined ? readPhotoCopy(browserStorage()) : null),
    [ready, fromPhoto, importedAt],
  );

  if (!ready || !session || !view) {
    return (
      <>
        <ScreenHeader title="Vérification" backHref="/" backLabel="Accueil" />
        <Skeleton />
      </>
    );
  }

  const { analysis, plan } = view;
  const pending = analysis.pending;
  const canStart = pending.length === 0 && plan.steps.length > 0;
  const blocked =
    pending.length > 0
      ? `Il reste ${count(pending.length, "valeur", "valeurs")} à vérifier (en orange).`
      : plan.steps.length === 0
        ? "Rien à préparer : réactivez des produits ou des clients, ou saisissez des quantités."
        : null;

  function begin(kind: "start" | "resume") {
    voice.unlock(); // un clic est nécessaire pour que le navigateur autorise la voix
    dispatch({ type: kind });
    router.push("/preparation");
  }

  const focus = open?.type === "cell" ? { r: open.r, c: open.c } : null;

  return (
    <>
      <ScreenHeader title="Vérification" backHref="/" backLabel="Accueil" />
      <Page className="flex flex-col gap-4">
        <Card className="flex flex-col gap-1">
          <p className="text-xl font-extrabold leading-snug" data-testid="summary">
            {count(analysis.activeColumns.length, "produit", "produits")} · {count(analysis.activeRows.length, "client", "clients")} ·{" "}
            <span className={pending.length > 0 ? "text-warn-text" : "text-ok"}>
              {count(pending.length, "valeur à vérifier", "valeurs à vérifier")}
            </span>
          </p>
          <p className="break-words text-sm text-muted">
            {fromPhoto ? "Tableau lu sur une photo" : `${session.model.fileName} · feuille « ${session.model.sheetName} »`}
          </p>
          <Switch
            checked={state.settings.ignoreStar}
            onChange={(ignoreStar) => dispatch({ type: "updateSettings", patch: { ignoreStar } })}
            label="Ignorer les produits marqués *"
            hint="Les produits dont le nom contient une étoile ne sont pas préparés."
          />
        </Card>

        {fromPhoto && (
          <Banner tone="info" data-testid="photo-banner">
            <p className="font-bold">Tableau lu sur une photo : la lecture peut se tromper.</p>
            <p className="text-sm">Comparez chaque ligne avec la photo, surtout les chiffres, avant de commencer.</p>
            {session.note && (
              <p className="mt-1 text-sm" data-testid="photo-note">
                Remarque de la lecture : {session.note}
              </p>
            )}
            {photoCopy ? (
              <Button variant="secondary" className="mt-2" onClick={() => setOpen({ type: "photo", back: null })}>
                <CameraIcon className="text-xl" />
                Voir la photo
              </Button>
            ) : (
              <p className="mt-1 text-sm font-semibold">La photo n&apos;a pas pu être gardée sur cet appareil : comparez avec celle de votre téléphone.</p>
            )}
          </Banner>
        )}

        {pending.length > 0 ? (
          <Banner tone="warn">
            <p className="font-bold">
              {count(pending.length, "valeur est douteuse", "valeurs sont douteuses")} (cellules orange).
            </p>
            <p className="text-sm">Corrigez-les ou confirmez-les : la préparation ne peut pas commencer avant.</p>
            <Button variant="warn" className="mt-2 max-w-full" onClick={() => setOpen({ type: "cell", r: pending[0].r, c: pending[0].c })}>
              <AlertIcon className="text-xl" />
              Vérifier la première
            </Button>
          </Banner>
        ) : (
          <Banner tone="ok" icon={false}>
            <span className="flex items-center gap-2 font-bold">
              <CheckIcon className="text-xl" />
              Toutes les valeurs sont correctes.
            </span>
          </Banner>
        )}

        <GridTable
          session={session}
          analysis={analysis}
          focus={focus}
          onCell={(r, c) => setOpen({ type: "cell", r, c })}
          onColumn={(index) => setOpen({ type: "item", kind: "column", index })}
          onRow={(index) => setOpen({ type: "item", kind: "row", index })}
        />
        <p className="text-sm text-muted">
          Touchez une valeur pour la modifier, un nom de client ou de produit pour l&apos;ignorer ou le réactiver. Les lignes et colonnes
          grisées sont ignorées.
        </p>

        <IgnoredLists />

        <BottomBar>
          {blocked && (
            <p role="status" className="text-center text-sm font-bold text-warn-text">
              {blocked}
            </p>
          )}
          {session.status === "preparing" && canStart ? (
            // Le bouton Retour d'Android (ou un geste de retour) ramène ici en pleine préparation : reprendre doit être le choix évident.
            <>
              <Button variant="ok" size="xl" className="w-full" onClick={() => begin("resume")}>
                Reprendre la préparation en cours
              </Button>
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => {
                  if (window.confirm("Recommencer au premier produit ? Votre avancement actuel sera perdu.")) begin("start");
                }}
              >
                Recommencer depuis le début
              </Button>
            </>
          ) : (
            // Le libellé d'un tableau lu sur une photo est long : un cran plus petit, pour qu'il tienne sur deux lignes.
            <Button variant="ok" size="xl" className={`w-full ${fromPhoto ? "!text-xl" : ""}`} disabled={!canStart} onClick={() => begin("start")}>
              {fromPhoto ? "J'ai comparé avec la photo : tout est correct, commencer" : "Tout est correct, commencer"}
            </Button>
          )}
        </BottomBar>
      </Page>

      {open?.type === "cell" && (
        <CellEditor
          key={`${open.r}:${open.c}`}
          r={open.r}
          c={open.c}
          onClose={() => setOpen(null)}
          onJump={(r, c) => setOpen({ type: "cell", r, c })}
          onShowPhoto={photoCopy ? () => setOpen({ type: "photo", back: { r: open.r, c: open.c } }) : undefined}
        />
      )}
      {open?.type === "photo" && (
        <PhotoSheet
          src={photoCopy}
          look={
            open.back && session.model.rows[open.back.r] && session.model.columns[open.back.c]
              ? { client: rowLabel(session.model.rows[open.back.r]), product: columnLabel(session.model.columns[open.back.c]) }
              : null
          }
          onClose={() => setOpen(open.back ? { type: "cell", r: open.back.r, c: open.back.c } : null)}
        />
      )}
      {open?.type === "item" && (
        <ItemSheet key={`${open.kind}:${open.index}`} kind={open.kind} index={open.index} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
