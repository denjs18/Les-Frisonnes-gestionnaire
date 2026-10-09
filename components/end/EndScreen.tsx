"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useApp, useRequireSession } from "@/components/AppProvider";
import { CheckIcon, RepeatIcon, TableIcon, UploadIcon } from "@/components/icons";
import { Button, Card, Page, ScreenHeader, Skeleton } from "@/components/ui";
import { count, formatQuantity } from "@/lib/format";
import { voice } from "@/lib/voice/service";

export function EndScreen() {
  const ready = useRequireSession();
  const { state, view, dispatch } = useApp();
  const router = useRouter();
  const session = state.session;
  const status = session?.status;
  const { voiceRate, voiceURI } = state.settings;

  // Cet écran n'a de sens qu'une fois la préparation terminée.
  const redirect = !ready ? null : status === "preparing" ? "/preparation" : status === "verifying" ? "/verification" : null;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);

  const done = ready && status === "done";
  useEffect(() => {
    if (!done) return;
    voice.speak("Préparation terminée.", { rate: voiceRate, voiceURI });
    return () => voice.cancelSpeech();
  }, [done, voiceRate, voiceURI]);

  if (!done || !session || !view) {
    return (
      <>
        <ScreenHeader title="Terminé" />
        <Skeleton />
      </>
    );
  }

  const { plan } = view;

  function restart() {
    voice.unlock(); // un clic est nécessaire pour que le navigateur autorise la voix
    dispatch({ type: "start" });
    router.push("/preparation");
  }

  return (
    <>
      <ScreenHeader title="Terminé" />
      <Page className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className="flex h-24 w-24 items-center justify-center rounded-full bg-ok text-ok-fg">
            <CheckIcon className="text-6xl" />
          </span>
          <h2 className="text-3xl font-extrabold">Préparation terminée !</h2>
          <p data-testid="recap-summary" className="text-lg font-semibold text-muted">
            {count(plan.products.length, "produit", "produits")} · {count(new Set(plan.steps.flatMap((s) => (s.rowPos === null ? [] : [s.rowPos]))).size, "client", "clients")} ·{" "}
            {count(plan.steps.length, "étape", "étapes")}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button variant="primary" size="xl" className="w-full" onClick={restart}>
            <RepeatIcon className="text-3xl" />
            Recommencer
          </Button>
          <Button variant="secondary" size="lg" className="w-full" onClick={() => router.push("/verification")}>
            <TableIcon className="text-2xl" />
            Retour au tableau
          </Button>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => router.push("/")}>
            <UploadIcon className="text-2xl" />
            Nouveau fichier
          </Button>
        </div>

        <Card>
          <h3 className="mb-2 text-xl font-extrabold">Récapitulatif</h3>
          <ul className="divide-y divide-line">
            {plan.products.map((product) => (
              <li key={product.colPos} className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1 break-words font-bold">{product.name}</span>
                <span className="shrink-0 text-sm text-muted">{count(product.clients.length, "client", "clients")}</span>
                <span className="w-14 shrink-0 text-right text-2xl font-black tabular-nums">{formatQuantity(product.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Page>
    </>
  );
}
