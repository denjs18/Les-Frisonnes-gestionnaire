import { expect, test, type Page } from "@playwright/test";
import { importCsv, installFakeVoice, shot } from "./helpers";

/** Un grand tableau (15 clients × 15 produits) : le mini-tableau ne doit jamais pousser le reste hors de l'écran. */
function bigCsv(): string {
  const products = Array.from({ length: 15 }, (_, i) => `Produit ${i + 1}`);
  const lines = [["Nom", ...products].join(";")];
  for (let c = 1; c <= 15; c++) {
    lines.push([`Client numéro ${c}`, ...products.map((_, p) => ((c + p) % 3 === 0 ? String(1 + ((c * p) % 9)) : ""))].join(";"));
  }
  return lines.join("\n");
}

const SCREENS = [
  { name: "iPhone récent, application installée", width: 390, height: 844 },
  { name: "Android dans le navigateur", width: 412, height: 700 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "petit téléphone dans le navigateur", width: 360, height: 600 },
  { name: "téléphone en mode paysage", width: 844, height: 390 },
];

async function expectInsideViewport(page: Page, name: string, locator: ReturnType<Page["getByTestId"]>, height: number) {
  const box = await locator.boundingBox();
  expect(box, `${name} introuvable`).not.toBeNull();
  expect(box!.y, `${name} dépasse en haut`).toBeGreaterThanOrEqual(-1);
  expect(box!.y + box!.height, `${name} dépasse en bas (${Math.round(box!.y + box!.height)} > ${height})`).toBeLessThanOrEqual(height + 1);
}

test.describe("la préparation tient à l'écran, sans défiler", () => {
  for (const screen of SCREENS) {
    test(`${screen.name} (${screen.width}×${screen.height})`, async ({ page }) => {
      await page.setViewportSize({ width: screen.width, height: screen.height });
      await installFakeVoice(page);
      await importCsv(page, bigCsv());
      await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
      await page.getByRole("button", { name: /Suivant/ }).click(); // une étape « client » (nom du client affiché)
      await expect(page.getByTestId("client")).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));

      await expectInsideViewport(page, "le produit", page.getByTestId("product"), screen.height);
      await expectInsideViewport(page, "la quantité", page.getByTestId("quantity"), screen.height);
      await expectInsideViewport(page, "le client", page.getByTestId("client"), screen.height);
      for (const name of [/Suivant/, /Précédent/, /Répéter/, /Pause/]) {
        await expectInsideViewport(page, `le bouton ${name}`, page.getByRole("button", { name }) as never, screen.height);
      }
      await expectInsideViewport(page, "l'indicateur du micro", page.getByTestId("mic-badge"), screen.height);

      // Aucun défilement de la page elle-même
      expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
      await shot(page, `20-prep-${screen.width}x${screen.height}`);
    });
  }

  test("le mini-tableau défile dans son cadre et garde la cellule en cours visible", async ({ page }) => {
    await installFakeVoice(page);
    await importCsv(page, bigCsv());
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    const table = page.getByTestId("mini-table");
    await expect(table).toBeVisible();
    for (let i = 0; i < 14; i++) await page.getByRole("button", { name: /Suivant/ }).click();
    await page.waitForTimeout(900);
    const frame = (await table.boundingBox())!;
    const current = (await page.locator('[data-testid="mini-table"] [data-current="true"]').boundingBox())!;
    expect(current.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(current.y + current.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
    expect(current.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(current.x + current.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  });
});
