"use client";

import { DownloadIcon, PhoneIcon } from "@/components/icons";
import { Banner, Button, Card } from "@/components/ui";
import { useInstall } from "@/hooks/useInstall";
import { usePlatform } from "@/hooks/usePlatform";
import { install } from "@/lib/install";
import type { Platform } from "@/lib/platform";

/** Comment ajouter l'appli à l'écran d'accueil quand le navigateur ne propose pas lui-même de bouton. */
export function installSteps(platform: Platform): string[] | null {
  if (platform.os === "ios") {
    return [
      ...(platform.browser === "safari" ? [] : ["Ouvrez d'abord cette adresse dans Safari."]),
      "Touchez le bouton Partager (le carré avec une flèche vers le haut).",
      "Faites défiler, touchez « Sur l'écran d'accueil », puis « Ajouter ».",
    ];
  }
  if (platform.os !== "android") return null;
  switch (platform.browser) {
    case "samsung":
      return ["Touchez le menu ☰ (trois traits, en bas à droite).", "Touchez « Ajouter la page à », puis « Écran d'accueil »."];
    case "firefox":
      return ["Touchez le menu ⋮ (trois points).", "Touchez « Installer », puis confirmez."];
    case "chrome":
      return [
        "Touchez le menu ⋮ (trois points, en haut à droite).",
        "Touchez « Installer l'application » (ou « Ajouter à l'écran d'accueil »), puis « Installer ».",
      ];
    default:
      return ["Ouvrez le menu du navigateur.", "Touchez « Installer » ou « Ajouter à l'écran d'accueil »."];
  }
}

/** Avertit quand l'adresse est ouverte dans le navigateur intégré d'une autre appli (Facebook, Messenger…). */
function InAppBrowserNotice({ platform }: { platform: Platform }) {
  const target = platform.os === "ios" ? "Safari" : platform.os === "android" ? "Chrome" : "votre navigateur";
  return (
    <Banner tone="warn" data-testid="in-app-notice">
      <p className="font-bold">Vous êtes dans le navigateur d&apos;une autre appli.</p>
      <p className="mt-1">
        La voix et l&apos;installation y fonctionnent mal. Ouvrez cette adresse dans {target} : touchez le menu de la page (⋮ ou « Partager »),
        puis « Ouvrir dans {platform.os === "ios" ? "Safari" : "le navigateur"} ».
      </p>
    </Banner>
  );
}

/** Invite à installer l'appli sur l'écran d'accueil : bouton si le navigateur le permet, sinon les étapes à suivre. */
export function InstallCard() {
  const platform = usePlatform();
  const { canPrompt, installed, hidden } = useInstall();

  if (installed) return null;
  if (platform.inAppBrowser) return <InAppBrowserNotice platform={platform} />;
  const steps = installSteps(platform);
  if (hidden || (!canPrompt && !steps)) return null;

  return (
    <Card className="flex flex-col gap-3" data-testid="install-card">
      <div className="flex items-start gap-3">
        <PhoneIcon className="mt-1 shrink-0 text-3xl text-primary" />
        <div className="min-w-0">
          <h2 className="font-serif text-2xl font-bold">Installer sur le téléphone</h2>
          <p className="text-base text-muted">Une icône sur l&apos;écran d&apos;accueil, le plein écran, et l&apos;appli s&apos;ouvre même sans réseau.</p>
        </div>
      </div>
      {canPrompt ? (
        <Button variant="primary" size="lg" className="w-full" onClick={() => void install.prompt()}>
          <DownloadIcon className="text-2xl" />
          Installer l&apos;application
        </Button>
      ) : (
        steps && (
          <ol className="list-decimal space-y-1 pl-6 text-base">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )
      )}
      <Button variant="ghost" className="self-start" onClick={install.hide} aria-label="Masquer cette carte (les explications restent dans l'aide)">
        Masquer
      </Button>
    </Card>
  );
}
