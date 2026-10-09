"use client";

import { useRouter } from "next/navigation";
import { Cow } from "@/components/brand/Illustrations";
import { Banner, Button, Page, ScreenHeader } from "@/components/ui";
import { browserStorage, clearStorage } from "@/lib/storage";

/** Écran de secours en cas d'erreur inattendue : jamais de page blanche, et une sortie même si les données enregistrées sont abîmées. */
export default function ErrorScreen({ reset }: { error: Error; reset: () => void }) {
  const router = useRouter();

  function eraseAndRestart() {
    clearStorage(browserStorage());
    window.location.reload(); // rechargement complet : repart d'un état propre
  }

  return (
    <>
      <ScreenHeader title="Oups" actions={<span />} />
      <Page className="flex flex-col gap-4">
        <Cow className="mx-auto h-auto w-44" />
        <Banner tone="danger" role="alert">
          <p className="font-bold">Quelque chose s&apos;est mal passé.</p>
          <p>Rien n&apos;a été envoyé nulle part. Réessayez d&apos;abord.</p>
        </Banner>
        <Button variant="primary" size="lg" onClick={reset}>
          Réessayer
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => {
            reset();
            router.push("/");
          }}
        >
          Retour à l&apos;accueil
        </Button>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <p className="mb-2 text-sm text-muted">
            Si le problème revient à chaque fois, effacez les données enregistrées sur cet appareil (vous devrez réimporter le
            fichier).
          </p>
          <Button variant="danger" size="lg" className="w-full" onClick={eraseAndRestart}>
            Effacer les données et recommencer
          </Button>
        </div>
      </Page>
    </>
  );
}
