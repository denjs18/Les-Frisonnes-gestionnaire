"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Segmented, Switch } from "@/components/controls";
import { ArrowRightIcon, PlusIcon, TrashIcon, VolumeIcon } from "@/components/icons";
import { Banner, Button, Card, Page, ScreenHeader, Skeleton } from "@/components/ui";
import { usePlatform } from "@/hooks/usePlatform";
import { useRecognitionSupport, useVoice } from "@/hooks/useVoice";
import { describeMic, describeSpeechProblem, SENSITIVITY_TEXT } from "@/lib/labels";
import { DEFAULT_ALIASES, toSpoken, type Alias } from "@/lib/speech-text";
import { RATE_MAX, RATE_MIN, type Settings } from "@/lib/state";
import { browserStorage, clearStorage } from "@/lib/storage";
import { MIC_SENSITIVITIES } from "@/lib/voice/sensitivity";
import { voice } from "@/lib/voice/service";

const SAMPLE = "38 yaourt nature 0,5 litre. 4 pour Nature Champs.";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-serif text-2xl font-bold">{title}</h2>
      {children}
    </Card>
  );
}

const inputClass = "h-12 min-w-0 rounded-xl border-2 border-line bg-surface-2 px-3 text-base font-semibold";

/** Le clavier d'Android met des majuscules et « corrige » les mots : ici le texte doit rester exactement tel qu'on le tape. */
const rawText = { autoCapitalize: "off", autoCorrect: "off", spellCheck: false, autoComplete: "off" } as const;

export function SettingsScreen() {
  const { state, dispatch } = useApp();
  const router = useRouter();
  const snapshot = useVoice();
  const recognition = useRecognitionSupport();
  const platform = usePlatform();
  const [tryName, setTryName] = useState("Yaourt nature 0.5L");
  const { settings } = state;

  if (!state.loaded) {
    return (
      <>
        <ScreenHeader title="Réglages" backHref="/" backLabel="Accueil" />
        <Skeleton />
      </>
    );
  }

  const update = (patch: Partial<Settings>) => dispatch({ type: "updateSettings", patch });
  const speak = (text: string) => {
    voice.unlock();
    voice.speak(text, { rate: settings.voiceRate, voiceURI: settings.voiceURI });
  };
  const setAliases = (aliases: Alias[]) => update({ aliases });
  const editAlias = (index: number, patch: Partial<Alias>) =>
    setAliases(settings.aliases.map((alias, i) => (i === index ? { ...alias, ...patch } : alias)));

  function eraseEverything() {
    if (!window.confirm("Effacer la préparation en cours et tous les réglages de cet appareil ?")) return;
    voice.cancelSpeech();
    dispatch({ type: "resetAll" });
    clearStorage(browserStorage()); // la remise à zéro a réécrit les réglages par défaut : on les retire aussi
    router.push("/");
  }

  return (
    <>
      <ScreenHeader title="Réglages" backHref="/" backLabel="Accueil" />
      <Page className="flex flex-col gap-4">
        <Section title="Voix">
          <div>
            <label htmlFor="rate" className="mb-1 flex items-baseline justify-between text-base font-bold">
              Vitesse de la voix
              <span className="text-xl font-black tabular-nums">{settings.voiceRate.toFixed(2).replace(".", ",")}×</span>
            </label>
            <input
              id="rate"
              type="range"
              min={RATE_MIN}
              max={RATE_MAX}
              step={0.05}
              value={settings.voiceRate}
              onChange={(event) => update({ voiceRate: Number(event.target.value) })}
              className="h-10 w-full accent-primary"
            />
            <div className="flex justify-between text-sm text-muted">
              <span>Lente</span>
              <span>Rapide</span>
            </div>
          </div>

          <div>
            <label htmlFor="voice" className="mb-1 block text-base font-bold">
              Voix française
            </label>
            <select
              id="voice"
              value={settings.voiceURI ?? ""}
              onChange={(event) => update({ voiceURI: event.target.value || null })}
              className={`${inputClass} h-14 w-full`}
            >
              <option value="">Automatique (voix française de l&apos;appareil)</option>
              {snapshot.voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {snapshot.voices.length === 0 && (
              <p className="mt-1 text-sm text-muted">
                Aucune voix française listée par ce navigateur : la voix par défaut de l&apos;appareil sera utilisée.
              </p>
            )}
          </div>

          <Button variant="secondary" size="lg" onClick={() => speak(SAMPLE)}>
            <VolumeIcon className="text-2xl" />
            Tester la voix
          </Button>
          {!snapshot.ttsSupported && (
            <Banner tone="warn">Ce navigateur ne sait pas lire à voix haute : suivez les étapes à l&apos;écran.</Banner>
          )}
          {snapshot.speechProblem && (
            <Banner tone="warn" role="status">
              <p className="font-bold">{describeSpeechProblem(snapshot.speechProblem, platform).title}</p>
              <p>{describeSpeechProblem(snapshot.speechProblem, platform).hint}</p>
            </Banner>
          )}
        </Section>

        <Section title="Micro">
          <Switch
            checked={settings.micEnabled}
            onChange={(micEnabled) => update({ micEnabled })}
            label="Écoute vocale (micro)"
            hint="Dites « suivant », « précédent », « répète », « pause », « reprends » ou « où j'en suis »."
          />
          {recognition === false && (
            <Banner tone="warn">
              {describeMic("unsupported", platform).hint}
              {platform.os === "ios" ? " C'est fréquent sur iPhone." : ""}
            </Banner>
          )}
          {recognition !== false && (
            <div>
              <p className="mb-2 text-base font-bold">Sensibilité du micro</p>
              <Segmented
                label="Sensibilité du micro"
                value={settings.micSensitivity}
                onChange={(micSensitivity) => update({ micSensitivity })}
                options={MIC_SENSITIVITIES.map((level) => ({ value: level, label: SENSITIVITY_TEXT[level].label }))}
              />
              <p className="mt-2 text-sm text-muted" data-testid="settings-sensitivity-hint">
                {SENSITIVITY_TEXT[settings.micSensitivity].hint} Réglable aussi pendant la préparation, avec un essai en direct.
              </p>
            </div>
          )}
          {recognition === true && (
            <p className="text-sm text-muted">
              La reconnaissance vocale est moins fiable dans un endroit bruyant, et celle de Chrome a besoin d&apos;Internet. Les boutons
              restent toujours disponibles.
            </p>
          )}
        </Section>

        <Section title="Affichage">
          <div>
            <p className="mb-2 text-base font-bold">Taille du texte</p>
            <Segmented
              label="Taille du texte"
              value={settings.textScale}
              onChange={(textScale) => update({ textScale })}
              options={[
                { value: "normal", label: "Normal" },
                { value: "large", label: "Grand" },
                { value: "xlarge", label: "Très grand" },
              ]}
            />
          </div>
          <div>
            <p className="mb-2 text-base font-bold">Thème</p>
            <Segmented
              label="Thème"
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: "auto", label: "Auto" },
                { value: "light", label: "Clair" },
                { value: "dark", label: "Sombre" },
              ]}
            />
          </div>
          <Switch
            checked={settings.keepAwake}
            onChange={(keepAwake) => update({ keepAwake })}
            label="Garder l'écran allumé"
            hint="Pendant la préparation, pour ne pas avoir à rallumer le téléphone."
          />
        </Section>

        <Section title="Lecture du tableau">
          <Switch
            checked={settings.ignoreStar}
            onChange={(ignoreStar) => update({ ignoreStar })}
            label="Ignorer les produits marqués *"
            hint="Les colonnes dont le titre contient une étoile ne sont pas préparées."
          />
        </Section>

        <Section title="Prononciation">
          <p className="text-sm text-muted">
            Quand la voix lit mal un nom, ajoutez une règle : le texte tel qu&apos;il est écrit dans le fichier, et comment le dire.
            Exemple : « FB » se dit « fromage blanc ». Les « 0.5L » sont déjà lus « 0,5 litre ».
          </p>
          <ul className="flex flex-col gap-3">
            {settings.aliases.map((alias, index) => (
              <li key={index} className="rounded-xl border border-line bg-surface-2 p-2">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <input
                    aria-label={`Règle ${index + 1} : texte du fichier`}
                    placeholder="Dans le fichier"
                    {...rawText}
                    value={alias.from}
                    onChange={(event) => editAlias(index, { from: event.target.value })}
                    className={inputClass}
                  />
                  <ArrowRightIcon className="text-xl text-muted" />
                  <input
                    aria-label={`Règle ${index + 1} : se prononce`}
                    placeholder="Se dit"
                    {...rawText}
                    value={alias.to}
                    onChange={(event) => editAlias(index, { to: event.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="mt-2 flex gap-2">
                  <Button variant="secondary" className="min-w-0 flex-1" onClick={() => speak(toSpoken(alias.from, settings.aliases))}>
                    <VolumeIcon className="text-xl" />
                    Écouter
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Supprimer la règle ${index + 1}`}
                    className="!px-4 text-xl"
                    onClick={() => setAliases(settings.aliases.filter((_, i) => i !== index))}
                  >
                    <TrashIcon />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setAliases([...settings.aliases, { from: "", to: "" }])}>
              <PlusIcon className="text-xl" />
              Ajouter une règle
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="flex-1"
              onClick={() => {
                if (window.confirm("Rétablir les règles de prononciation d'origine ?")) dispatch({ type: "resetAliases" });
              }}
              disabled={JSON.stringify(settings.aliases) === JSON.stringify(DEFAULT_ALIASES)}
            >
              Rétablir les règles d&apos;origine
            </Button>
          </div>

          <div className="rounded-xl border border-line p-3">
            <label htmlFor="try" className="mb-1 block text-base font-bold">
              Essayer un nom
            </label>
            <input
              id="try"
              {...rawText}
              value={tryName}
              onChange={(event) => setTryName(event.target.value)}
              className={`${inputClass} w-full`}
            />
            <p className="mt-2 text-base">
              <span className="text-muted">Lu : </span>
              <strong data-testid="try-spoken">{toSpoken(tryName, settings.aliases) || "…"}</strong>
            </p>
            <Button variant="secondary" className="mt-2 w-full" onClick={() => speak(toSpoken(tryName, settings.aliases))}>
              <VolumeIcon className="text-xl" />
              Écouter
            </Button>
          </div>
        </Section>

        <Section title="Données">
          <p className="text-sm text-muted">
            Le fichier et les réglages sont enregistrés uniquement sur cet appareil : ils ne sont envoyés nulle part. Effacer supprime la
            préparation en cours et les réglages.
          </p>
          <Button variant="danger" size="lg" onClick={eraseEverything}>
            <TrashIcon className="text-2xl" />
            Effacer les données de cet appareil
          </Button>
        </Section>
      </Page>
    </>
  );
}
