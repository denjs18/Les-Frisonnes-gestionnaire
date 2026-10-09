import { defineConfig } from "@playwright/test";

/**
 * Tests de bout en bout sur un écran de téléphone (390 px).
 * Lancer : npm run build && npm run test:e2e
 * (Si Playwright n'a pas son propre navigateur, indiquer celui à utiliser : CHROMIUM_PATH=/chemin/vers/chrome)
 */
const PORT = 3100;

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
  webServer: {
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
