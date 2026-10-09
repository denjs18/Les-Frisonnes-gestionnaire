import { readSession, readSettings, writeSession, writeSettings, type StorageLike } from "./storage";
import { INITIAL_STATE, reduce, type Action, type AppState } from "./state";

export interface Store {
  getState(): AppState;
  /** État rendu côté serveur (toujours vide) : évite tout décalage à l'affichage. */
  getServerState(): AppState;
  subscribe(listener: () => void): () => void;
  dispatch(action: Action): void;
  /** Lit la sauvegarde du navigateur ; à appeler une fois, côté navigateur. */
  init(): void;
}

/**
 * Petit magasin d'état, hors de React : l'état est sauvegardé à chaque changement
 * et les callbacks de la voix peuvent toujours lire la valeur la plus récente.
 */
export function createStore(storage: StorageLike | null): Store {
  let state: AppState = INITIAL_STATE;
  let initialized = false;
  const listeners = new Set<() => void>();

  function dispatch(action: Action): void {
    const previous = state;
    const next = reduce(previous, action);
    if (next === previous) return;
    state = next;
    if (action.type !== "hydrate") {
      if (next.session !== previous.session) writeSession(storage, next.session);
      if (next.settings !== previous.settings) writeSettings(storage, next.settings);
    }
    listeners.forEach((listener) => listener());
  }

  return {
    getState: () => state,
    getServerState: () => INITIAL_STATE,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,
    init() {
      if (initialized) return;
      initialized = true;
      dispatch({ type: "hydrate", session: readSession(storage), settings: readSettings(storage) });
    },
  };
}
