"use client";

import { useSyncExternalStore } from "react";
import { findRecognitionConstructor } from "@/lib/voice/listener";
import { voice, type VoiceSnapshot } from "@/lib/voice/service";

/** État de la voix (parole, micro, voix françaises disponibles, dernier texte entendu). */
export function useVoice(): VoiceSnapshot {
  return useSyncExternalStore(voice.subscribe, voice.getSnapshot, voice.getServerSnapshot);
}

/** Le navigateur sait-il écouter la voix ? null tant qu'on ne le sait pas (rendu serveur). */
export function useRecognitionSupport(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => findRecognitionConstructor() !== null,
    () => null,
  );
}
