import { describe, expect, it } from "vitest";
import { detectPlatform, UNKNOWN_PLATFORM } from "@/lib/platform";

// De vraies chaînes « user agent » (réduites par Chrome : la version de l'appareil est figée).
const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  chromeAndroidReduced:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  samsung:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  firefoxAndroid: "Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0",
  operaAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OPR/76.0.0.0",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0.0;]",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.29.110 Android (33/13; 420dpi; 1080x2340; samsung; SM-S911B; dm1q; qcom; fr_FR; 500)",
  webviewAndroid:
    "Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1",
  // Appli installée sur l'écran d'accueil : ni « Version » ni « Safari ».
  homeScreenIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  facebookIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/440.0.0.0.0;]",
  ipadAsMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  headless: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
};

describe("detectPlatform", () => {
  it("reconnaît Chrome sur Android, y compris avec la version d'Android masquée par Chrome", () => {
    expect(detectPlatform(UA.chromeAndroid)).toEqual({ os: "android", browser: "chrome", inAppBrowser: false });
    expect(detectPlatform(UA.chromeAndroidReduced)).toEqual({ os: "android", browser: "chrome", inAppBrowser: false });
  });

  it("distingue les autres navigateurs Android, qui s'annoncent aussi « Chrome »", () => {
    expect(detectPlatform(UA.samsung)).toMatchObject({ os: "android", browser: "samsung" });
    expect(detectPlatform(UA.firefoxAndroid)).toMatchObject({ os: "android", browser: "firefox" });
    expect(detectPlatform(UA.edgeAndroid)).toMatchObject({ os: "android", browser: "edge" });
    expect(detectPlatform(UA.operaAndroid)).toMatchObject({ os: "android", browser: "opera" });
    for (const ua of [UA.samsung, UA.firefoxAndroid, UA.edgeAndroid, UA.operaAndroid]) {
      expect(detectPlatform(ua).inAppBrowser, ua).toBe(false);
    }
  });

  it("repère les navigateurs intégrés aux applis (Facebook, Instagram, WebView Android)", () => {
    expect(detectPlatform(UA.facebookAndroid)).toMatchObject({ os: "android", inAppBrowser: true });
    expect(detectPlatform(UA.instagramAndroid)).toMatchObject({ os: "android", inAppBrowser: true });
    expect(detectPlatform(UA.webviewAndroid)).toMatchObject({ os: "android", inAppBrowser: true });
    expect(detectPlatform(UA.facebookIphone)).toMatchObject({ os: "ios", inAppBrowser: true });
  });

  it("reconnaît Safari et Chrome sur iPhone, et l'appli installée sur l'écran d'accueil (qui n'est pas un navigateur intégré)", () => {
    expect(detectPlatform(UA.safariIphone)).toEqual({ os: "ios", browser: "safari", inAppBrowser: false });
    expect(detectPlatform(UA.chromeIphone)).toEqual({ os: "ios", browser: "chrome", inAppBrowser: false });
    expect(detectPlatform(UA.homeScreenIphone)).toMatchObject({ os: "ios", inAppBrowser: false });
  });

  it("un iPad récent (qui se présente comme un Mac) est reconnu grâce à l'écran tactile", () => {
    expect(detectPlatform(UA.ipadAsMac, 5)).toMatchObject({ os: "ios", browser: "safari" });
    expect(detectPlatform(UA.ipadAsMac, 0)).toMatchObject({ os: "other", browser: "safari" });
  });

  it("un ordinateur n'est ni Android ni iOS", () => {
    expect(detectPlatform(UA.chromeWindows)).toEqual({ os: "other", browser: "chrome", inAppBrowser: false });
    expect(detectPlatform(UA.headless)).toMatchObject({ os: "other", inAppBrowser: false });
  });

  it("une chaîne vide ou inconnue ne donne aucun conseil particulier", () => {
    expect(detectPlatform("")).toEqual(UNKNOWN_PLATFORM);
    expect(detectPlatform("curl/8.0")).toEqual(UNKNOWN_PLATFORM);
  });
});
