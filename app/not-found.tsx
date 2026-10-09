import type { Metadata } from "next";
import { ButtonLink, Page, ScreenHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <>
      <ScreenHeader title="Page introuvable" />
      <Page className="flex flex-col items-center gap-4 pt-12 text-center">
        <p className="text-xl font-semibold">Cette page n&apos;existe pas.</p>
        <ButtonLink href="/" variant="primary" size="lg">
          Retour à l&apos;accueil
        </ButtonLink>
      </Page>
    </>
  );
}
