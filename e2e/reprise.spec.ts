import { expect, test, type Page } from "@playwright/test";
import { expectLastSpoken, importCsv, installFakeVoice, say, shot, spoken } from "./helpers";

/**
 * Retours d'un utilisateur : « je n'ai pas réussi à reprendre à un endroit particulier » et
 * « un réglage de sensibilité du micro : il est sensible, et dans la chambre froide il y a le bruit des ventilateurs ».
 */

// 5 produits ; « FB 0,5 » et « FB 1 » se disent tous deux « fromage blanc » ; « 4 saisons » se dit « quatre saisons ».
const CSV = [
  "Nom;Fromage;Yaourt citron;FB 0,5;FB 1;4 saisons",
  "Alice;2;3;4;;1",
  "Bob;;5;;2;2",
  "Biocité;1;;1;1;",
].join("\n");

async function startPreparation(page: Page) {
  await importCsv(page, CSV);
  await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
  await expect(page.getByTestId("progress")).toContainText("Produit 1/5");
  await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
}

const openGoto = (page: Page) => page.getByTestId("progress").getByRole("button").click();

test.describe("« Aller à… » : reprendre à un endroit précis, sans la voix", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
    await startPreparation(page);
  });

  test("toucher « Produit 1/5 · Étape 1/3 » ouvre la liste des produits, le produit en cours est marqué", async ({ page }) => {
    await openGoto(page);
    const sheet = page.getByTestId("goto-sheet");
    await expect(page.getByRole("dialog", { name: "Aller à…" })).toBeVisible();
    await expect(sheet.getByRole("button")).toHaveCount(5);
    await expect(sheet.getByRole("button", { name: /Fromage/ })).toContainText("En cours");
    await expect(sheet.getByRole("button", { name: /4 saisons/ })).toContainText("2 clients · total 3");
    await expect(sheet.getByText("En cours")).toHaveCount(1);
    await shot(page, "50-aller-a-produits");
  });

  test("choisir un produit puis un client y emmène, et le dit à voix haute", async ({ page }) => {
    await openGoto(page);
    await page.getByTestId("goto-sheet").getByRole("button", { name: /Yaourt citron/ }).click();
    await expect(page.getByRole("dialog", { name: "Yaourt citron" })).toBeVisible();
    await expect(page.getByTestId("goto-sheet").getByRole("button")).toHaveCount(4); // « Tous les produits », total, Alice, Bob
    await shot(page, "51-aller-a-clients");
    await page.getByTestId("goto-sheet").getByRole("button", { name: /Bob/ }).click();

    await expect(page.getByTestId("goto-sheet")).toHaveCount(0);
    await expect(page.getByTestId("progress")).toContainText("Produit 2/5");
    await expect(page.getByTestId("progress")).toContainText("Étape 3/3");
    await expect(page.getByTestId("client")).toHaveText("Bob");
    await expect(page.getByTestId("quantity")).toHaveText("5");
    await expectLastSpoken(page, "5 pour Bob");
  });

  test("« Total à sortir » d'un produit", async ({ page }) => {
    await openGoto(page);
    await page.getByTestId("goto-sheet").getByRole("button", { name: /FB 1/ }).click();
    await page.getByTestId("goto-sheet").getByRole("button", { name: /Total à sortir/ }).click();
    await expect(page.getByTestId("progress")).toContainText("Produit 4/5");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
    await expect(page.getByTestId("quantity")).toHaveText("3");
    await expectLastSpoken(page, "3 fromage blanc 1");
  });

  test("dans la liste d'un produit, l'étape en cours et ce qui est déjà fait sont repérés ; « Tous les produits » revient en arrière", async ({ page }) => {
    await page.getByRole("button", { name: /Suivant/ }).click(); // Alice, étape 2/3 du produit 1
    await openGoto(page);
    await page.getByTestId("goto-sheet").getByRole("button", { name: /Fromage/ }).click();
    const sheet = page.getByTestId("goto-sheet");
    await expect(sheet.getByRole("button", { name: /Alice/ })).toContainText("En cours");
    await expect(sheet.getByRole("button", { name: /Total à sortir/ })).not.toContainText("En cours");
    await sheet.getByRole("button", { name: "Tous les produits" }).click();
    await expect(sheet.getByRole("button")).toHaveCount(5);
  });

  test("« Fermer » ne change rien", async ({ page }) => {
    await openGoto(page);
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByTestId("goto-sheet")).toHaveCount(0);
    await expect(page.getByTestId("progress")).toContainText("Produit 1/5");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });

  test("tant que la fenêtre est ouverte, les commandes vocales ne font rien derrière", async ({ page }) => {
    await openGoto(page);
    await say(page, "suivant");
    await expect(page.getByTestId("heard")).toContainText("(ignoré)");
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });
});

test.describe("à la voix : plus de façons de reprendre à un endroit", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
    await startPreparation(page);
  });

  test("« reprends à Biocité » : un client du produit en cours", async ({ page }) => {
    await say(page, "reprends à Biocité");
    await expect(page.getByTestId("client")).toHaveText("Biocité");
    await expect(page.getByTestId("quantity")).toHaveText("1");
    await expectLastSpoken(page, "1 pour Biocité");
  });

  test("« reviens au yaourt citron chez Bob », « produit 3 », « étape 2 »", async ({ page }) => {
    await say(page, "reviens au yaourt citron chez Bob");
    await expect(page.getByTestId("client")).toHaveText("Bob");
    await page.waitForTimeout(1700);
    await say(page, "produit 3");
    await expect(page.getByTestId("progress")).toContainText("Produit 3/5");
    await expectLastSpoken(page, "5 fromage blanc 0,5");
    await page.waitForTimeout(1700);
    await say(page, "étape deux");
    await expect(page.getByTestId("client")).toHaveText("Alice");
    await expectLastSpoken(page, "4 pour Alice");
  });

  test("plusieurs produits possibles : l'appli les cite et demande de préciser, sans bouger", async ({ page }) => {
    await say(page, "reprends à fromage blanc");
    await expectLastSpoken(page, "Plusieurs produits correspondent : fromage blanc 0,5, fromage blanc 1. Précisez.");
    await expect(page.getByTestId("heard")).toContainText("À préciser");
    await expect(page.getByTestId("progress")).toContainText("Produit 1/5");
  });

  test("…et un client qui n'achète qu'un des produits possibles lève le doute", async ({ page }) => {
    await say(page, "reprends à fromage blanc pour Alice");
    await expect(page.getByTestId("progress")).toContainText("Produit 3/5");
    await expectLastSpoken(page, "4 pour Alice");
  });

  test("« quatre saisons » désigne « 4 saisons »", async ({ page }) => {
    await say(page, "reprends à quatre saisons");
    await expect(page.getByTestId("progress")).toContainText("Produit 5/5");
    await expectLastSpoken(page, "3 4 saisons");
  });

  test("« reprends au début » revient à la première étape", async ({ page }) => {
    await say(page, "produit 4");
    await expect(page.getByTestId("progress")).toContainText("Produit 4/5");
    await page.waitForTimeout(1700);
    await say(page, "reprends au début");
    await expect(page.getByTestId("progress")).toContainText("Produit 1/5");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });

  test("en pause, « reprends à Biocité » reprend à cet endroit", async ({ page }) => {
    await say(page, "pause");
    await expect(page.getByText("En pause.")).toBeVisible();
    await page.waitForTimeout(1700);
    await say(page, "reprends à Biocité");
    await expect(page.getByText("En pause.")).toHaveCount(0);
    await expect(page.getByTestId("client")).toHaveText("Biocité");
    await expectLastSpoken(page, "1 pour Biocité");
  });

  test("« aller à » tout seul donne un exemple à dire", async ({ page }) => {
    await say(page, "aller à");
    await expect.poll(async () => (await spoken(page)).at(-1)).toContain("reprends à fromage blanc pour Biocité");
    await expect(page.getByTestId("heard")).toContainText("Aide");
  });

  test("un produit introuvable le dit, sans bouger", async ({ page }) => {
    await say(page, "reprends à pizza");
    await expectLastSpoken(page, "Je n'ai pas trouvé.");
    await expect(page.getByTestId("heard")).toContainText("Introuvable");
    await expect(page.getByTestId("progress")).toContainText("Produit 1/5");
  });
});

test.describe("sensibilité du micro (bruit de fond, ventilateurs)", () => {
  test("réglage dans les Réglages, conservé après rechargement", async ({ page }) => {
    await installFakeVoice(page);
    await page.goto("/reglages");
    const normal = page.getByRole("radio", { name: "Normale" });
    await expect(normal).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Basse", exact: true }).click();
    await expect(page.getByTestId("settings-sensitivity-hint")).toContainText("ventilateurs");
    await page.reload();
    await expect(page.getByRole("radio", { name: "Basse", exact: true })).toHaveAttribute("aria-checked", "true");
    await shot(page, "52-reglage-sensibilite");
  });

  test.describe("sensibilité basse", () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem("prepa-commandes:v1:settings", JSON.stringify({ micSensitivity: "low" }));
      });
      await installFakeVoice(page);
      await startPreparation(page);
    });

    test("un résultat provisoire n'est plus exécuté, même resté stable, ni affiché", async ({ page }) => {
      await say(page, "suivant", false);
      await page.waitForTimeout(1200);
      await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
      await expect(page.getByTestId("heard")).not.toContainText("Entendu");
    });

    test("seuls les mots principaux comptent : « stop » est ignoré, « pause » fonctionne", async ({ page }) => {
      await say(page, "stop", true, 0.95);
      await expect(page.getByTestId("heard")).toContainText("(ignoré)");
      await expect(page.getByText("En pause.")).toHaveCount(0);
      await say(page, "pause", true, 0.95);
      await expect(page.getByText("En pause.")).toBeVisible();
    });

    test("un résultat définitif pas assez net est ignoré (et le dit) ; un résultat net est exécuté", async ({ page }) => {
      await say(page, "suivant", true, 0.4);
      await expect(page.getByTestId("heard")).toContainText("suivant");
      await expect(page.getByTestId("heard")).toContainText("40 %");
      await expect(page.getByTestId("heard")).toContainText("(pas assez net)");
      await expect(page.getByTestId("progress")).toContainText("Étape 1/3");

      await say(page, "suivant", true, 0.9);
      await expect(page.getByTestId("progress")).toContainText("Étape 2/3");
      await expect(page.getByTestId("heard")).toContainText("90 %");
      await expect(page.getByTestId("heard")).toContainText("→ Suivant");
    });
  });

  test.describe("réglage sur place, avec essai en direct", () => {
    test.beforeEach(async ({ page }) => {
      await installFakeVoice(page);
      await startPreparation(page);
    });

    test("on règle la sensibilité à côté du micro, on essaie, et rien ne bouge derrière", async ({ page }) => {
      await page.getByTestId("sensitivity-button").click();
      const dialog = page.getByRole("dialog", { name: "Sensibilité du micro" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("J'écoute");

      await dialog.getByRole("radio", { name: "Très basse" }).click();
      await expect(dialog.getByTestId("sensitivity-hint")).toContainText("très bruyant");

      await say(page, "suivant", true, 0.7);
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("suivant");
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("70 %");
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("ignoré (pas assez net)");

      await say(page, "suivant", true, 0.95);
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("95 %");
      await expect(dialog.getByTestId("sensitivity-test")).toContainText("→ Suivant (essai)");
      await shot(page, "53-sensibilite-essai");

      await dialog.getByRole("button", { name: "OK" }).click();
      await expect(page.getByTestId("progress")).toContainText("Étape 1/3"); // l'essai n'a rien fait avancer

      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("prepa-commandes:v1:settings") ?? "{}"));
      expect(saved.micSensitivity).toBe("very-low");
    });
  });

  test("le bouton de sensibilité est caché quand le navigateur ne sait pas écouter (iPhone, Firefox…)", async ({ page }) => {
    await installFakeVoice(page, { recognition: false });
    await startPreparation(page);
    await expect(page.getByTestId("mic-badge")).toHaveAttribute("data-status", "unsupported");
    await expect(page.getByTestId("sensitivity-button")).toHaveCount(0);
  });
});
