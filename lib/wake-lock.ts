/**
 * Empêche l'écran de se mettre en veille (les mains sont occupées, on ne touche pas l'écran).
 * Renvoie une fonction qui relâche le verrou. Sans effet si le navigateur ne sait pas faire.
 */
export function keepScreenAwake(): () => void {
  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  async function request(): Promise<void> {
    try {
      if (released || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      sentinel = await navigator.wakeLock.request("screen");
      if (released) await sentinel.release();
    } catch {
      // refusé (économie d'énergie…) : l'écran pourra se mettre en veille, tant pis
    }
  }

  // Le verrou est perdu quand on quitte l'onglet : on le reprend au retour.
  const onVisible = () => {
    if (document.visibilityState === "visible") void request();
  };
  document.addEventListener("visibilitychange", onVisible);
  void request();

  return () => {
    released = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
