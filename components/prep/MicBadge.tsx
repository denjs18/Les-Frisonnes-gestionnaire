"use client";

import { describeMic, type MicTone } from "@/lib/labels";
import type { ListenerStatus } from "@/lib/voice/listener";
import { MicIcon, MicOffIcon } from "@/components/icons";

const TONE: Record<MicTone, string> = {
  ok: "border-ok bg-ok-soft text-fg",
  muted: "border-line bg-surface-2 text-muted",
  warn: "border-warn bg-warn-soft text-fg",
  danger: "border-danger bg-danger-soft text-fg",
};

/** Indicateur toujours visible : le micro écoute-t-il ? Un toucher le coupe, le rallume ou relance l'écoute. */
export function MicBadge({ status, onPress }: { status: ListenerStatus; onPress: () => void }) {
  const mic = describeMic(status);
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="mic-badge"
      data-status={status}
      aria-label={`${mic.label}. Toucher pour ${mic.on ? "couper" : "réessayer ou activer"} le micro.`}
      className={`flex min-h-12 items-center gap-2 rounded-full border-2 px-3 text-sm font-extrabold ${TONE[mic.tone]}`}
    >
      {mic.on ? <MicIcon className="text-xl" /> : <MicOffIcon className="text-xl" />}
      <span className="flex items-center gap-1.5">
        {mic.on && (
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 rounded-full bg-ok ${mic.listening ? "animate-pulse" : "opacity-40"}`}
          />
        )}
        {mic.label}
      </span>
    </button>
  );
}
