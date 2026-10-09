import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout sur des écrans de téléphone : un téléphone « générique » de 390 px,
 * puis deux Android (agent utilisateur de Chrome sur Android, écran tactile).
 * Lancer : npm run build && npm run test:e2e
 * (Si Playwright n'a pas son propre navigateur, indiquer celui à utiliser : CHROMIUM_PATH=/chemin/vers/chrome)
 */
const PORT = 3100;

/** Le profil d'un téléphone Android connu de Playwright, joué sur le navigateur indiqué par CHROMIUM_PATH. */
function android(name: string) {
  const { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch } = devices[name];
  return { userAgent, viewport, deviceScaleFactor, isMobile, hasTouch };
}

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    serviceWorkers: "block",
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    // Tout, sauf ce qui suppose un téléphone Android.
    { name: "telephone", testIgnore: /android\.spec\.ts/ },
    // Un Pixel 7 (Chrome sur Android) : le parcours complet, et ce qui est propre à Android.
    { name: "android", use: android("Pixel 7"), testMatch: /(parcours|reprise|android)\.spec\.ts/ },
    // Un Android d'entrée de gamme à petit écran (360 × 640).
    { name: "android-petit", use: android("Moto G4"), testMatch: /(parcours|reprise)\.spec\.ts/ },
  ],
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
