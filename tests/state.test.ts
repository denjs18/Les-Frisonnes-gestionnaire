import { describe, expect, it } from "vitest";
import { buildModel } from "@/lib/grid";
import { DEFAULT_ALIASES } from "@/lib/speech-text";
import {
  DEFAULT_SETTINGS,
  INITIAL_STATE,
  RATE_MAX,
  RATE_MIN,
  reduce,
  type Action,
  type AppState,
} from "@/lib/state";
import { grid } from "./helpers";

const model = buildModel(
  grid([
    ["Nom", "A", "B"],
    ["x", 1, "oups"],
    ["y", 2.5, 3],
  ]),
  "essai.xlsx",
);

function loaded(): AppState {
  return reduce(reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS }), {
    type: "import",
    model,
    importedAt: "2026-10-09T10:00:00.000Z",
  });
}

const apply = (state: AppState, ...actions: Action[]) => actions.reduce(reduce, state);

describe("état de l'appli", () => {
  it("démarre vide et non chargé", () => {
    expect(INITIAL_STATE).toMatchObject({ loaded: false, session: null });
  });

  it("hydrate : charge la sauvegarde et se déclare chargé", () => {
    const state = reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS });
    expect(state.loaded).toBe(true);
  });

  it("import : crée une session « à vérifier » dont les valeurs de travail sont une copie", () => {
    const s = loaded().session!;
    expect(s).toMatchObject({ version: 1, status: "verifying", position: null, importedAt: "2026-10-09T10:00:00.000Z" });
    expect(s.cells).toEqual(model.cells);
    expect(s.cells).not.toBe(model.cells);
    expect(s.cells[0]).not.toBe(model.cells[0]);
  });

  it("setCell : modifie une valeur sans toucher à l'import d'origine, et retire sa confirmation", () => {
    const before = apply(loaded(), { type: "confirmCell", r: 1, c: 0 }, { type: "confirmCell", r: 0, c: 1 });
    const after = reduce(before, { type: "setCell", r: 1, c: 0, value: 3 });
    expect(after.session!.cells[1][0]).toBe(3);
    expect(after.session!.model.cells[1][0]).toBe(2.5);
    expect(after.session!.confirmed).toEqual({ "0:1": true });
    expect(before.session!.cells[1][0]).toBe(2.5); // l'ancien état n'est pas modifié
  });

  it("setCell : ignore une cellule qui n'existe pas", () => {
    const state = loaded();
    expect(reduce(state, { type: "setCell", r: 9, c: 0, value: 1 })).toBe(state);
    expect(reduce(state, { type: "setCell", r: 0, c: 9, value: 1 })).toBe(state);
  });

  it("confirmCell : mémorise la confirmation de la cellule", () => {
    expect(reduce(loaded(), { type: "confirmCell", r: 1, c: 0 }).session!.confirmed).toEqual({ "1:0": true });
  });

  it("réactive, désactive puis rétablit une colonne ou une ligne", () => {
    const s1 = apply(loaded(), { type: "setColumnOverride", c: 1, value: "on" }, { type: "setRowOverride", r: 0, value: "off" });
    expect(s1.session!.columnOverrides).toEqual({ 1: "on" });
    expect(s1.session!.rowOverrides).toEqual({ 0: "off" });
    const s2 = apply(s1, { type: "setColumnOverride", c: 1, value: null }, { type: "setRowOverride", r: 0, value: null });
    expect(s2.session!.columnOverrides).toEqual({});
    expect(s2.session!.rowOverrides).toEqual({});
  });

  it("suit l'avancement : start, setPosition, finish, resume", () => {
    const started = reduce(loaded(), { type: "start" }).session!;
    expect(started).toMatchObject({ status: "preparing", position: null });

    const moved = reduce(reduce(loaded(), { type: "start" }), {
      type: "setPosition",
      position: { colPos: 1, rowPos: 0 },
    }).session!;
    expect(moved).toMatchObject({ status: "preparing", position: { colPos: 1, rowPos: 0 } });

    const done = reduce(reduce(loaded(), { type: "start" }), { type: "finish" }).session!;
    expect(done).toMatchObject({ status: "done", position: null });

    const resumed = reduce(apply(loaded(), { type: "start" }, { type: "setPosition", position: { colPos: 0, rowPos: null } }), { type: "resume" });
    expect(resumed.session!.position).toEqual({ colPos: 0, rowPos: null });
  });

  it("start repart du début même après des étapes", () => {
    const restarted = apply(loaded(), { type: "setPosition", position: { colPos: 1, rowPos: 1 } }, { type: "start" });
    expect(restarted.session!.position).toBeNull();
  });

  it("clearSession efface la session mais garde les réglages", () => {
    const cleared = apply(loaded(), { type: "updateSettings", patch: { micEnabled: false } }, { type: "clearSession" });
    expect(cleared.session).toBeNull();
    expect(cleared.settings.micEnabled).toBe(false);
  });

  it("les actions sur la session sont sans effet quand il n'y a pas de session", () => {
    const empty = reduce(INITIAL_STATE, { type: "hydrate", session: null, settings: DEFAULT_SETTINGS });
    for (const action of [
      { type: "setCell", r: 0, c: 0, value: 1 },
      { type: "confirmCell", r: 0, c: 0 },
      { type: "setColumnOverride", c: 0, value: "on" },
      { type: "setRowOverride", r: 0, value: "on" },
      { type: "start" },
      { type: "resume" },
      { type: "setPosition", position: { colPos: 0, rowPos: null } },
      { type: "finish" },
    ] as Action[]) {
      expect(reduce(empty, action)).toBe(empty);
    }
  });

  it("réglages : borne la vitesse de la voix et accepte les autres changements", () => {
    const fast = reduce(loaded(), { type: "updateSettings", patch: { voiceRate: 9 } });
    const slow = reduce(loaded(), { type: "updateSettings", patch: { voiceRate: 0.01 } });
    const odd = reduce(loaded(), { type: "updateSettings", patch: { voiceRate: Number.NaN } });
    expect(fast.settings.voiceRate).toBe(RATE_MAX);
    expect(slow.settings.voiceRate).toBe(RATE_MIN);
    expect(odd.settings.voiceRate).toBe(DEFAULT_SETTINGS.voiceRate);
    expect(reduce(loaded(), { type: "updateSettings", patch: { ignoreStar: false, textScale: "xlarge" } }).settings).toMatchObject({
      ignoreStar: false,
      textScale: "xlarge",
    });
  });

  it("resetAll : efface la session et rétablit tous les réglages", () => {
    const customised = apply(
      loaded(),
      { type: "updateSettings", patch: { theme: "dark", ignoreStar: false, aliases: [] } },
      { type: "start" },
    );
    const reset = reduce(customised, { type: "resetAll" });
    expect(reset).toEqual({ loaded: true, session: null, settings: DEFAULT_SETTINGS });
  });

  it("réglages : rétablit les alias par défaut", () => {
    const edited = reduce(loaded(), { type: "updateSettings", patch: { aliases: [{ from: "x", to: "y" }] } });
    expect(edited.settings.aliases).toHaveLength(1);
    expect(reduce(edited, { type: "resetAliases" }).settings.aliases).toEqual(DEFAULT_ALIASES);
  });
});
