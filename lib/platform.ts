/** Le téléphone (ou l'ordinateur) et le navigateur utilisés, déduits du « user agent ». Sert à adapter les conseils affichés. */
export type Os = "android" | "ios" | "other";
export type Browser = "chrome" | "samsung" | "firefox" | "edge" | "opera" | "safari" | "other";

export interface Platform {
  os: Os;
  browser: Browser;
  /**
   * Navigateur intégré à une autre appli (Facebook, Messenger, Instagram, WebView…) : la voix et
   * l'installation y sont limitées, il vaut mieux ouvrir l'adresse dans le vrai navigateur.
   */
  inAppBrowser: boolean;
}

/** Valeur utilisée côté serveur, et par défaut tant qu'on ne sait pas : aucun conseil particulier. */
export const UNKNOWN_PLATFORM: Platform = { os: "other", browser: "other", inAppBrowser: false };

// Marques que les applis ajoutent à leur navigateur intégré.
const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Snapchat|TikTok|musical_ly|BytedanceWebview|MicroMessenger|LinkedInApp|Pinterest|KAKAOTALK/i;

function browserOf(ua: string, os: Os): Browser {
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/EdgA?\/|EdgiOS\/|Edge\//.test(ua)) return "edge";
  if (/OPR\/|OPiOS\/|Opera/.test(ua)) return "opera";
  if (/Firefox\/|FxiOS\//.test(ua)) return "firefox";
  if (/Chrome\/|CriOS\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && (os === "ios" || /Macintosh/.test(ua))) return "safari";
  return "other";
}

/**
 * @param userAgent `navigator.userAgent`
 * @param maxTouchPoints `navigator.maxTouchPoints` : un iPad récent se présente comme un Mac, seul l'écran tactile le trahit.
 */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  const android = /Android/i.test(userAgent);
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const os: Os = android ? "android" : ios ? "ios" : "other";
  // Android : « ; wv) » signale une WebView, le navigateur intégré à une appli.
  const inAppBrowser = IN_APP.test(userAgent) || (android && /;\s*wv\)/.test(userAgent));
  return { os, browser: browserOf(userAgent, os), inAppBrowser };
}

let current: Platform | null = null;

/** La plate-forme de l'appareil en cours (calculée une seule fois ; `UNKNOWN_PLATFORM` hors navigateur). */
export function currentPlatform(): Platform {
  if (typeof navigator === "undefined") return UNKNOWN_PLATFORM;
  current ??= detectPlatform(navigator.userAgent, navigator.maxTouchPoints);
  return current;
}
