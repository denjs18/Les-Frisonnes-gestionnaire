import { cellKey, newWorksheet, type Override, type Worksheet } from "./analysis";
import { DEFAULT_ALIASES, type Alias } from "./speech-text";
import type { Position } from "./steps";
import type { CellValue, SheetModel } from "./types";

export type Status = "verifying" | "preparing" | "done";

/** Tout ce qui est sauvegardé pour reprendre plus tard : le tableau, les corrections, l'avancement. */
export interface Session extends Worksheet {
  version: 1;
  importedAt: string;
  status: Status;
  /** null = pas encore commencé (début du plan). */
  position: Position | null;
}

export type TextScale = "normal" | "large" | "xlarge";
export type Theme = "auto" | "light" | "dark";

export interface Settings {
  /** Vitesse de la voix (1 = normale). */
  voiceRate: number;
  /** Identifiant de la voix choisie, null = voix française par défaut du navigateur. */
  voiceURI: string | null;
  micEnabled: boolean;
  textScale: TextScale;
  theme: Theme;
  ignoreStar: boolean;
  keepAwake: boolean;
  aliases: Alias[];
}

export const RATE_MIN = 0.6;
export const RATE_MAX = 1.6;

export const DEFAULT_SETTINGS: Settings = {
  voiceRate: 1,
  voiceURI: null,
  micEnabled: true,
  textScale: "normal",
  theme: "auto",
  ignoreStar: true,
  keepAwake: true,
  aliases: DEFAULT_ALIASES,
};

export interface AppState {
  /** Faux tant que la sauvegarde du navigateur n'a pas été lue. */
  loaded: boolean;
  session: Session | null;
  settings: Settings;
}

export const INITIAL_STATE: AppState = { loaded: false, session: null, settings: DEFAULT_SETTINGS };

export type Action =
  | { type: "hydrate"; session: Session | null; settings: Settings }
  | { type: "import"; model: SheetModel; importedAt: string }
  | { type: "setCell"; r: number; c: number; value: CellValue }
  | { type: "confirmCell"; r: number; c: number }
  | { type: "setColumnOverride"; c: number; value: Override | null }
  | { type: "setRowOverride"; r: number; value: Override | null }
  | { type: "start" }
  | { type: "resume" }
  | { type: "setPosition"; position: Position }
  | { type: "finish" }
  | { type: "clearSession" }
  | { type: "updateSettings"; patch: Partial<Settings> }
  | { type: "resetAliases" }
  | { type: "resetAll" };

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_SETTINGS.voiceRate;
  return Math.min(RATE_MAX, Math.max(RATE_MIN, Math.round(rate * 20) / 20));
}

/** Applique un changement à la session ; si rien ne change, l'état reste le même objet (pas de ré-affichage). */
function withSession(state: AppState, change: (session: Session) => Session): AppState {
  if (!state.session) return state;
  const next = change(state.session);
  return next === state.session ? state : { ...state, session: next };
}

function withOverride(overrides: Record<number, Override>, index: number, value: Override | null) {
  const next = { ...overrides };
  if (value === null) delete next[index];
  else next[index] = value;
  return next;
}

export function reduce(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return { loaded: true, session: action.session, settings: action.settings };

    case "import":
      return {
        ...state,
        session: {
          ...newWorksheet(action.model),
          version: 1,
          importedAt: action.importedAt,
          status: "verifying",
          position: null,
        },
      };

    case "setCell":
      return withSession(state, (s) => {
        if (!s.cells[action.r] || action.c < 0 || action.c >= s.cells[action.r].length) return s;
        const cells = s.cells.map((row, r) => (r === action.r ? row.map((v, c) => (c === action.c ? action.value : v)) : row));
        const confirmed = { ...s.confirmed };
        delete confirmed[cellKey(action.r, action.c)];
        return { ...s, cells, confirmed };
      });

    case "confirmCell":
      return withSession(state, (s) => ({ ...s, confirmed: { ...s.confirmed, [cellKey(action.r, action.c)]: true } }));

    case "setColumnOverride":
      return withSession(state, (s) => ({ ...s, columnOverrides: withOverride(s.columnOverrides, action.c, action.value) }));

    case "setRowOverride":
      return withSession(state, (s) => ({ ...s, rowOverrides: withOverride(s.rowOverrides, action.r, action.value) }));

    case "start":
      return withSession(state, (s) => ({ ...s, status: "preparing", position: null }));

    case "resume":
      return withSession(state, (s) => (s.status === "preparing" ? s : { ...s, status: "preparing" }));

    case "setPosition":
      return withSession(state, (s) => ({ ...s, status: "preparing", position: action.position }));

    case "finish":
      return withSession(state, (s) => ({ ...s, status: "done", position: null }));

    case "clearSession":
      return state.session === null ? state : { ...state, session: null };

    case "updateSettings": {
      const patch = { ...action.patch };
      if (patch.voiceRate !== undefined) patch.voiceRate = clampRate(patch.voiceRate);
      return { ...state, settings: { ...state.settings, ...patch } };
    }

    case "resetAliases":
      return { ...state, settings: { ...state.settings, aliases: DEFAULT_ALIASES } };

    case "resetAll":
      return { loaded: true, session: null, settings: DEFAULT_SETTINGS };
  }
}
