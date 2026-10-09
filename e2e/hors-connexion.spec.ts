import { expect, test } from "@playwright/test";
import { expectLastSpoken, importFile, installFakeVoice, workbook } from "./helpers";

test.describe("hors connexion (service worker)", () => {
  test.use({ serviceWorkers: "allow" });

  test("après un premier chargement, l'appli s'ouvre et fonctionne sans réseau", async ({ page, context }) => {
    await installFakeVoice(page);
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));

    // Le service worker précharge les 6 pages puis leurs fichiers.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open("prepa-pages-v1");
          return (await cache.keys()).length;
        }),
      )
      .toBeGreaterThanOrEqual(6);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await caches.open("prepa-static-v1");
          return (await cache.keys()).length;
        }),
      )
      .toBeGreaterThan(5);
    await page.waitForTimeout(2500); // le lecteur Excel est chargé « au calme » après l'enregistrement

    await context.setOffline(true);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();

    // Import d'un vrai classeur Excel, sans réseau (il faut le lecteur Excel mis en cache)
    await importFile(page, workbook([["Nom", "Fromage"], ["Alice", 2], ["Bob", 1]]));
    await expect(page.getByTestId("summary")).toContainText("1 produit · 2 clients");

    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("quantity")).toHaveText("3");
    await expectLastSpoken(page, "3 Fromage");

    // Navigation d'un écran à l'autre sans réseau
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: "Le principe" })).toBeVisible();
    await page.getByRole("link", { name: "Accueil" }).click();
    await expect(page.getByText("Préparation en cours")).toBeVisible();

    await context.setOffline(false);
  });

  test("le service worker est bien enregistré avec une portée sur tout le site", async ({ page }) => {
    await page.goto("/");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/\/$/);
  });
});
