"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  SettingsIcon,
  TableIcon,
  VolumeIcon,
} from "@/components/icons";
import { Banner, Button, buttonClass, FoldedBanner, ScreenHeader, Skeleton } from "@/components/ui";
import { usePlatform } from "@/hooks/usePlatform";
import { usePrep } from "@/hooks/usePrep";
import { describeMic, describeSpeechProblem } from "@/lib/labels";
import { voice } from "@/lib/voice/service";
import { MicBadge } from "./MicBadge";
import { MiniTable } from "./MiniTable";

export function PrepScreen() {
  const prep = usePrep();
  const platform = usePlatform();
  const { dispatch } = useApp();
  const { snapshot, settings, step, plan, actions } = prep;

  if (!prep.ready || !step || !plan) {
    return (
      <>
        <ScreenHeader title="Préparation" backHref="/verification" backLabel="Tableau" />
        <Skeleton />
      </>
    );
  }

  const mic = describeMic(snapshot.micStatus, platform);
  const speechProblem = snapshot.speechProblem ? describeSpeechProblem(snapshot.speechProblem, platform) : null;
  const heard = snapshot.heard;
  const decision = heard && prep.decision?.heard === heard.text ? prep.decision : null;
  const isTotal = step.kind === "total";

  function onMicPress() {
    if (!settings.micEnabled) {
      dispatch({ type: "updateSettings", patch: { micEnabled: true } });
    } else if (
      ["denied", "no-mic", "network", "error"].includes(snapshot.micStatus) ||
      (snapshot.micStatus === "unavailable" && platform.os === "android") // sur Android, on peut corriger (appli Google) puis réessayer
    ) {
      voice.retryMic();
    } else if (snapshot.micStatus !== "unsupported") {
      dispatch({ type: "updateSettings", patch: { micEnabled: false } });
    }
  }

  function enableSound() {
    voice.unlock(); // le navigateur n'autorise la voix qu'après un toucher
    actions.repeat();
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-20 shrink-0 border-b border-line bg-bg pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-2 py-1">
          <Link href="/verification" aria-label="Retour au tableau" className={buttonClass("ghost", "md", "!px-3 text-2xl")}>
            <TableIcon />
          </Link>
          <h1 data-testid="progress" className="min-w-0 flex-1 text-center text-lg font-extrabold leading-tight">
            Produit {step.productNumber}/{step.productCount} <span className="text-muted">·</span> Étape {step.stepNumber}/
            {step.stepCount}
          </h1>
          <Link href="/reglages" aria-label="Réglages" className={buttonClass("ghost", "md", "!px-3 text-2xl")}>
            <SettingsIcon />
          </Link>
        </div>
        <div className="h-1.5 bg-surface-2" aria-hidden="true">
          <div className="h-full bg-primary transition-all" style={{ width: `${((prep.index + 1) / prep.total) * 100}%` }} />
        </div>
      </header>

      {/* Tout tient dans l'écran : seul le mini-tableau défile (dans son cadre). Sur un écran vraiment trop petit, la zone défile. */}
      <div data-testid="prep-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex h-full min-h-[28rem] w-full max-w-5xl flex-col gap-3 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 landscape:min-h-[17rem] landscape:flex-row landscape:gap-4">
          <section
            aria-live="polite"
            className={`flex shrink-0 flex-col items-center justify-center gap-1 rounded-3xl border-4 bg-surface px-3 py-2 text-center landscape:flex-1 ${
              isTotal ? "border-accent" : "border-primary"
            }`}
          >
            <p
              data-testid="product"
              className="text-balance break-words text-[clamp(1.5rem,min(7vw,4.2dvh),3rem)] font-extrabold leading-tight"
            >
              {step.productName}
            </p>
            <span
              className={`rounded-full px-4 py-0.5 text-[min(1rem,4.2vw)] font-black uppercase tracking-wider ${
                isTotal ? "bg-accent text-accent-fg" : "bg-primary-soft text-fg"
              }`}
            >
              {isTotal ? "Total à sortir" : "Pour"}
            </span>
            <p
              data-testid="quantity"
              className="text-[clamp(3.5rem,min(40vw,17dvh),13rem)] font-black leading-none tabular-nums landscape:text-[clamp(3.5rem,40dvh,12rem)]"
            >
              {new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(step.quantity)}
            </p>
            {!isTotal && (
              <p
                data-testid="client"
                className="text-balance break-words text-[clamp(1.6rem,min(8vw,4.6dvh),3.25rem)] font-extrabold leading-tight"
              >
                {step.clientName}
              </p>
            )}
            {prep.paused && (
              <Banner tone="warn" role="status" className="mt-2 w-full text-left">
                <strong>En pause.</strong> Touchez « Reprendre » ou dites « reprends ».
              </Banner>
            )}
          </section>

          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <MiniTable
              plan={plan}
              current={prep.index}
              className="min-h-16 flex-initial [@media(max-height:600px)]:hidden [[data-scale=xlarge]_&]:hidden"
            />

            <div className="mt-auto flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1">
              <MicBadge status={snapshot.micStatus} onPress={onMicPress} />
              {/* Avec un texte très agrandi (réglages d'Android), le texte passe sous le badge au lieu d'être écrasé à côté. */}
              <p data-testid="heard" aria-live="polite" className="min-w-[9rem] flex-1 text-sm leading-snug text-muted">
                {heard ? (
                  <>
                    Entendu : «&nbsp;
                    <span className={heard.isFinal ? "font-bold text-fg" : "italic"}>{heard.text}</span>&nbsp;»
                    {decision && (
                      <span className={`ml-1 font-extrabold ${decision.label ? "text-ok" : "text-muted"}`}>
                        {decision.label ? `→ ${decision.label}` : "(ignoré)"}
                      </span>
                    )}
                  </>
                ) : mic.on ? (
                  "Dites : suivant · précédent · répète · pause"
                ) : (
                  "Utilisez les gros boutons."
                )}
              </p>
            </div>

            {/* Repliées sur une ligne : ces explications sont longues et ne doivent pas pousser les gros boutons hors de l'écran. */}
            {mic.hint && snapshot.micStatus !== "off" && (
              <FoldedBanner tone={mic.tone === "danger" ? "danger" : "warn"} title="Micro : que faire ?" data-testid="mic-hint">
                {mic.hint}
              </FoldedBanner>
            )}
            {speechProblem && !snapshot.speechBlocked && (
              <FoldedBanner tone="warn" title={speechProblem.title} data-testid="speech-problem">
                {speechProblem.hint}
              </FoldedBanner>
            )}
            {prep.snapshot.speechBlocked && (
              <Button variant="warn" size="lg" onClick={enableSound}>
                <VolumeIcon className="text-2xl" />
                Touchez ici pour activer la voix
              </Button>
            )}

            <div className="grid shrink-0 gap-3">
              <Button
                variant="primary"
                size="none"
                className="min-h-[clamp(4.5rem,11dvh,6.5rem)] w-full rounded-3xl px-6 text-[min(2.25rem,9vw)]"
                onClick={actions.next}
              >
                {prep.isLast ? (
                  <>
                    Terminer <CheckIcon className="text-[min(3rem,11vw)]" />
                  </>
                ) : (
                  <>
                    Suivant <ArrowRightIcon className="text-[min(3rem,11vw)]" />
                  </>
                )}
              </Button>
              <div className="grid grid-cols-3 gap-3">
                <Button
                  variant="secondary"
                  size="none"
                  className="min-h-[clamp(3.75rem,9dvh,5rem)] flex-col gap-0.5 rounded-2xl px-1 text-[min(1rem,4vw)]"
                  disabled={prep.index === 0}
                  onClick={actions.prev}
                >
                  <ArrowLeftIcon className="text-[min(1.875rem,8vw)]" />
                  Précédent
                </Button>
                <Button
                  variant="secondary"
                  size="none"
                  className="min-h-[clamp(3.75rem,9dvh,5rem)] flex-col gap-0.5 rounded-2xl px-1 text-[min(1rem,4vw)]"
                  onClick={actions.repeat}
                >
                  <RepeatIcon className="text-[min(1.875rem,8vw)]" />
                  Répéter
                </Button>
                <Button
                  variant={prep.paused ? "ok" : "accent"}
                  size="none"
                  className="min-h-[clamp(3.75rem,9dvh,5rem)] flex-col gap-0.5 rounded-2xl px-1 text-[min(1rem,4vw)]"
                  onClick={prep.paused ? actions.resume : actions.pause}
                >
                  {prep.paused ? <PlayIcon className="text-[min(1.875rem,8vw)]" /> : <PauseIcon className="text-[min(1.875rem,8vw)]" />}
                  {prep.paused ? "Reprendre" : "Pause"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
