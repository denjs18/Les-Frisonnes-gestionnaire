"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useApp } from "@/components/AppProvider";
import { ambiguousSentence, GOTO_HELP_SENTENCE, stepSentence, whereSentence } from "@/lib/speech-text";
import { findStepIndex, positionOf, type Plan, type Position, type Step } from "@/lib/steps";
import {
  CommandGate,
  interpretCandidates,
  resolveGotoDetailed,
  type GotoTarget,
  type VoiceCommand,
} from "@/lib/voice-commands";
import { voice } from "@/lib/voice/service";
import { keepScreenAwake } from "@/lib/wake-lock";

const COMMAND_LABELS: Record<VoiceCommand["type"], string> = {
  next: "Suivant",
  prev: "Précédent",
  repeat: "Répéter",
  pause: "Pause",
  resume: "Reprendre",
  where: "Où j'en suis",
  goto: "Reprendre à…",
  gotoHelp: "Aide",
};

/** Les fenêtres de l'écran de préparation : choisir un endroit, régler la sensibilité du micro. */
export type PrepSheet = "goto" | "sensitivity";

/** Ce que l'appli a fait du dernier texte entendu (pour l'afficher à côté de ce texte). */
export interface Decision {
  heard: string;
  /** Commande exécutée, ou null si le texte a été ignoré (ce n'était pas exactement une commande). */
  label: string | null;
}

/**
 * Le cœur de l'écran de préparation : quelle étape, la dictée à voix haute,
 * les boutons et les commandes vocales (qui font exactement la même chose que les boutons).
 */
export function usePrep() {
  const { state, view, dispatch } = useApp();
  const router = useRouter();
  const session = state.session;
  const settings = state.settings;
  const plan: Plan | null = view?.plan ?? null;
  const steps = plan?.steps ?? [];
  const index = session ? findStepIndex(steps, session.position) : 0;
  const step: Step | null = steps[index] ?? null;
  const stepId = step?.id ?? null;
  const sentence = step ? stepSentence(step, settings.aliases) : null;
  const pendingCount = view?.analysis.pending.length ?? 0;

  const [paused, setPaused] = useState(false);
  const [repeatNonce, setRepeatNonce] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [sheet, setSheet] = useState<PrepSheet | null>(null);
  const snapshot = useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getServerSnapshot);

  // Les callbacks de la voix ne sont créés qu'une fois : ils lisent ici les dernières valeurs.
  const live = useRef({ steps, index, paused, settings, plan, sheet });
  useEffect(() => {
    live.current = { steps, index, paused, settings, plan, sheet };
  });

  // Cet écran n'a de sens que pour une préparation vérifiée et en cours.
  const redirect = !state.loaded
    ? null
    : !session
      ? "/"
      : session.status === "done"
        ? "/fin"
        : session.status === "verifying" || pendingCount > 0 || steps.length === 0
          ? "/verification"
          : null;
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);
  const ready = state.loaded && session !== null && redirect === null && step !== null;

  const say = useCallback((text: string) => {
    const { settings: current } = live.current;
    voice.speak(text, { rate: current.voiceRate, voiceURI: current.voiceURI });
  }, []);

  const goTo = useCallback(
    (target: number) => {
      const { steps: all } = live.current;
      if (target < 0) {
        say("C'est la première étape.");
        return;
      }
      if (target >= all.length) {
        dispatch({ type: "finish" });
        router.replace("/fin");
        return;
      }
      setPaused(false);
      dispatch({ type: "setPosition", position: positionOf(all[target]) });
    },
    [dispatch, router, say],
  );

  const next = useCallback(() => goTo(live.current.index + 1), [goTo]);
  const prev = useCallback(() => goTo(live.current.index - 1), [goTo]);
  const repeat = useCallback(() => {
    setPaused(false);
    setRepeatNonce((n) => n + 1);
  }, []);
  const pause = useCallback(() => {
    setPaused(true);
    voice.cancelSpeech();
  }, []);
  const resume = useCallback(() => setPaused(false), []);
  const where = useCallback(() => {
    const { steps: all, index: i, settings: current } = live.current;
    const here = all[i];
    if (here) say(whereSentence(here, current.aliases));
  }, [say]);
  const closeSheet = useCallback(() => setSheet(null), []);

  /** Va à une étape précise et la dicte (même si c'est déjà l'étape en cours). */
  const jumpTo = useCallback(
    (position: Position) => {
      setPaused(false);
      dispatch({ type: "setPosition", position });
      setRepeatNonce((n) => n + 1);
    },
    [dispatch],
  );
  const goto = useCallback(
    (target: GotoTarget): "found" | "ambiguous" | "missing" => {
      const { plan: current, steps: all, index: i, settings: s } = live.current;
      const here = all[i];
      const result = current ? resolveGotoDetailed(current, target, s.aliases, here ? positionOf(here) : null) : null;
      if (result?.kind === "found") {
        jumpTo(result.position);
        return "found";
      }
      if (result?.kind === "ambiguous") {
        say(ambiguousSentence(result.noun, result.names, s.aliases));
        return "ambiguous";
      }
      say("Je n'ai pas trouvé.");
      return "missing";
    },
    [jumpTo, say],
  );
  const gotoHelp = useCallback(() => say(GOTO_HELP_SENTENCE), [say]);

  // Dicte l'étape à chaque changement d'étape, sur « Répéter » et à la reprise après une pause.
  useEffect(() => {
    if (!ready || sentence === null) return;
    if (paused) {
      voice.cancelSpeech();
      return;
    }
    say(sentence);
  }, [ready, stepId, sentence, repeatNonce, paused, say]);
  useEffect(() => () => voice.cancelSpeech(), []);

  // Écoute vocale : allumée tant que cet écran est ouvert et que le micro est activé dans les réglages.
  const micEnabled = settings.micEnabled;
  useEffect(() => {
    if (!ready) return;
    voice.setMicWanted(micEnabled);
    return () => voice.setMicWanted(false);
  }, [ready, micEnabled]);

  useEffect(() => {
    if (!ready) return;
    const gate = new CommandGate(1500);
    voice.setCandidatesHandler((candidates) => {
      const heard = candidates[0] ?? "";
      // Sensibilité réduite : seuls les mots principaux comptent (pas « stop », « retour »… que le bruit déclenche trop facilement).
      const command = interpretCandidates(candidates, { strict: live.current.settings.micSensitivity !== "normal" });
      if (!command) {
        setDecision({ heard, label: null });
        return;
      }
      // Une fenêtre est ouverte : on choisit à la main (ou on règle le micro), rien ne doit bouger derrière.
      // Dans la fenêtre de réglage du micro, la commande est seulement reconnue (« essai »), pour juger de la sensibilité.
      if (live.current.sheet !== null) {
        setDecision({ heard, label: live.current.sheet === "sensitivity" ? `${COMMAND_LABELS[command.type]} (essai)` : null });
        return;
      }
      // En pause, l'appli n'obéit qu'à « reprends » (et « où j'en suis », ou « reprends à… » qui reprend à un endroit précis) : pas d'avance accidentelle.
      if (live.current.paused && command.type !== "resume" && command.type !== "where" && command.type !== "goto" && command.type !== "gotoHelp") {
        setDecision({ heard, label: null });
        return;
      }
      if (!gate.allow(performance.now())) return; // doublon d'une commande qui vient d'être exécutée
      try {
        navigator.vibrate?.(40);
      } catch {
        // pas de vibration sur cet appareil
      }
      let label = COMMAND_LABELS[command.type];
      switch (command.type) {
        case "next":
          next();
          break;
        case "prev":
          prev();
          break;
        case "repeat":
          repeat();
          break;
        case "pause":
          pause();
          break;
        case "resume":
          resume();
          break;
        case "where":
          where();
          break;
        case "goto": {
          const outcome = goto(command.target);
          if (outcome === "ambiguous") label = "À préciser";
          else if (outcome === "missing") label = "Introuvable";
          break;
        }
        case "gotoHelp":
          gotoHelp();
          break;
      }
      setDecision({ heard, label });
    });
    return () => voice.setCandidatesHandler(null);
  }, [ready, next, prev, repeat, pause, resume, where, goto, gotoHelp]);

  // Sensibilité du micro (réglée dans les Réglages, ou ici même, dans le bruit).
  const micSensitivity = settings.micSensitivity;
  useEffect(() => {
    voice.setSensitivity(micSensitivity);
  }, [micSensitivity]);

  // Les mains occupées : l'écran ne doit pas s'éteindre pendant la préparation.
  const keepAwake = settings.keepAwake;
  useEffect(() => {
    if (!ready || !keepAwake) return;
    return keepScreenAwake();
  }, [ready, keepAwake]);

  // Raccourcis clavier (ordinateur, clavier Bluetooth) : flèches, R, P.
  useEffect(() => {
    if (!ready) return;
    const onKey = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") prev();
      else if (event.key === "r" || event.key === "R") repeat();
      else if (event.key === "p" || event.key === "P") (live.current.paused ? resume : pause)();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ready, next, prev, repeat, pause, resume]);

  return {
    ready,
    session,
    plan,
    step,
    index,
    total: steps.length,
    isLast: index === steps.length - 1,
    paused,
    decision,
    snapshot,
    settings,
    actions: { next, prev, repeat, pause, resume },
    sheet,
    openSheet: setSheet,
    closeSheet,
    jumpTo,
  };
}
