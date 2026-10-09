"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import type { Action, AppState, Settings } from "@/lib/state";
import { browserStorage } from "@/lib/storage";
import { createStore, type Store } from "@/lib/store";
import { computeView, type View } from "@/lib/view";

/** Un seul magasin pour toute l'appli ; côté serveur il n'a pas de stockage et reste vide. */
const store: Store = createStore(browserStorage());

interface AppContextValue {
  state: AppState;
  /** Analyse et étapes calculées à partir de la session (null s'il n'y en a pas). */
  view: View | null;
  dispatch: (action: Action) => void;
  /** Accès direct à l'état le plus récent, pour les callbacks de la voix. */
  store: Store;
}

const AppContext = createContext<AppContextValue | null>(null);

/** Applique le thème et la taille du texte choisis (le script du layout l'a déjà fait avant l'affichage). */
function useAppearance(loaded: boolean, theme: Settings["theme"], textScale: Settings["textScale"]) {
  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;
    root.setAttribute("data-scale", textScale);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "auto" && Boolean(media?.matches));
      root.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    if (theme !== "auto" || !media) return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [loaded, theme, textScale]);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getServerState);

  useEffect(() => {
    store.init();
  }, []);

  const { session } = state;
  const { ignoreStar, theme, textScale } = state.settings;
  const view = useMemo(() => computeView(session, ignoreStar), [session, ignoreStar]);
  useAppearance(state.loaded, theme, textScale);

  const value = useMemo(() => ({ state, view, dispatch: store.dispatch, store }), [state, view]);
  return <AppContext value={value}>{children}</AppContext>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp doit être utilisé à l'intérieur de <AppProvider>.");
  return value;
}

/**
 * Pour les écrans qui ont besoin d'une préparation importée : renvoie vrai quand elle est prête,
 * et renvoie à l'accueil si elle n'existe pas (par exemple après avoir effacé les données).
 */
export function useRequireSession(): boolean {
  const { state } = useApp();
  const router = useRouter();
  const missing = state.loaded && state.session === null;
  useEffect(() => {
    if (missing) router.replace("/");
  }, [missing, router]);
  return state.loaded && state.session !== null;
}
