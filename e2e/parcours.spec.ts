import { expect, test } from "@playwright/test";
import { EXAMPLE_FILE, expectLastSpoken, hasExampleFile, importCsv, importFile, installFakeVoice, say, shot, spoken, workbook } from "./helpers";

test.describe("parcours complet sur un petit tableau CSV", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
  });

  test("import, vérification, préparation aux boutons, fin", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    await shot(page, "01-accueil");

    await importCsv(page);
    await expect(page.getByTestId("summary")).toContainText("2 produits · 3 clients · 0 valeur à vérifier");
    await shot(page, "02-verification");

    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page).toHaveURL(/\/preparation$/);

    // Produit 1 (Fromage) : TOTAL puis Alice (2) et Chloé (1)
    await expect(page.getByTestId("progress")).toContainText("Produit 1/2");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
    await expect(page.getByTestId("quantity")).toHaveText("3");
    await expect(page.getByTestId("product")).toHaveText("Fromage");
    await expectLastSpoken(page, "3 Fromage");
    await shot(page, "03-preparation-total");

    await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("client")).toHaveText("Alice");
    await expect(page.getByTestId("quantity")).toHaveText("2");
    await expectLastSpoken(page, "2 pour Alice");
    await shot(page, "04-preparation-client");

    await page.getByRole("button", { name: /Précédent/ }).click();
    await expectLastSpoken(page, "3 Fromage");

    await page.getByRole("button", { name: /Répéter/ }).click();
    await expect.poll(async () => (await spoken(page)).filter((s) => s === "3 Fromage").length).toBe(2);

    // Jusqu'au bout : 3 + 3 étapes
    for (let i = 0; i < 5; i++) await page.getByRole("button", { name: /Suivant|Terminer/ }).click();
    await expect(page.getByTestId("product")).toHaveText("Yaourt nature 0.5L");
    await expectLastSpoken(page, "4 pour Bob");
    await page.getByRole("button", { name: /Terminer/ }).click();

    await expect(page).toHaveURL(/\/fin$/);
    await expect(page.getByRole("heading", { name: "Préparation terminée !" })).toBeVisible();
    await expect(page.getByTestId("recap-summary")).toContainText("2 produits · 3 clients · 6 étapes");
    await expectLastSpoken(page, "Préparation terminée.");
    await shot(page, "05-fin");

    await page.getByRole("button", { name: "Recommencer" }).click();
    await expect(page).toHaveURL(/\/preparation$/);
    await expect(page.getByTestId("progress")).toContainText("Produit 1/2");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });

  test("« Retour au tableau » depuis la fin", async ({ page }) => {
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    for (let i = 0; i < 6; i++) await page.getByRole("button", { name: /Suivant|Terminer/ }).click();
    await expect(page).toHaveURL(/\/fin$/);
    await page.getByRole("button", { name: "Retour au tableau" }).click();
    await expect(page).toHaveURL(/\/verification$/);
  });
});

test.describe("commandes vocales", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });

  test("« suivant » et « précédent » à la voix, avec le texte entendu affiché", async ({ page }) => {
    await expect(page.getByTestId("mic-badge")).toHaveAttribute("data-status", /listening|starting|suspended/);
    await say(page, "suivant");
    await expect(page.getByTestId("client")).toHaveText("Alice");
    await expect(page.getByTestId("heard")).toContainText("suivant");
    await expect(page.getByTestId("heard")).toContainText("Suivant");
    await shot(page, "06-voix-suivant");

    await page.waitForTimeout(1700); // délai anti-rebond
    await say(page, "précédent");
    await expect(page.getByTestId("quantity")).toHaveText("3");
    await expect(page.getByTestId("client")).toHaveCount(0);
  });

  test("ignore les phrases qui ne sont pas exactement une commande", async ({ page }) => {
    await say(page, "je vais dire suivant dans un instant");
    await say(page, "bonjour tout le monde");
    await page.waitForTimeout(500);
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
    await expect(page.getByTestId("heard")).toContainText("(ignoré)");
  });

  test("anti-rebond : une deuxième commande immédiate est ignorée", async ({ page }) => {
    await say(page, "suivant");
    await expect(page.getByTestId("progress")).toContainText("Étape 2/3");
    await say(page, "suivant");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("progress")).toContainText("Étape 2/3");
  });

  test("pause : l'appli n'écoute plus que « reprends »", async ({ page }) => {
    await say(page, "pause");
    await expect(page.getByText("En pause.")).toBeVisible();
    await page.waitForTimeout(1700);
    await say(page, "suivant");
    await page.waitForTimeout(400);
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");

    const before = (await spoken(page)).length;
    await say(page, "reprends");
    await expect(page.getByText("En pause.")).toHaveCount(0);
    await expect.poll(async () => (await spoken(page)).length).toBeGreaterThan(before);
    await expectLastSpoken(page, "3 Fromage");
  });

  test("« où j'en suis » et « répète »", async ({ page }) => {
    await say(page, "où j'en suis");
    await expectLastSpoken(page, "Produit 1 sur 2, Fromage. Étape 1 sur 3 : 3 Fromage.");
    await page.waitForTimeout(1700);
    await say(page, "répète");
    await expectLastSpoken(page, "3 Fromage");
  });

  test("« reprends à yaourt pour Bob »", async ({ page }) => {
    await say(page, "reprends à yaourt pour Bob");
    await expect(page.getByTestId("client")).toHaveText("Bob");
    await expect(page.getByTestId("quantity")).toHaveText("4");
    await expectLastSpoken(page, "4 pour Bob");
  });

  test("« reprends à » avec un produit introuvable ne bouge pas", async ({ page }) => {
    await say(page, "reprends à pizza pour Bob");
    await expect(page.getByTestId("heard")).toContainText("Introuvable");
    await expect(page.getByTestId("progress")).toContainText("Étape 1/3");
  });

  test("le micro se coupe pendant que l'appli parle puis reprend", async ({ page }) => {
    await page.waitForFunction(() => window.__recStarts >= 1 && Boolean(window.__rec)); // première écoute prête
    const before = await page.evaluate(() => window.__recStarts);
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expectLastSpoken(page, "2 pour Alice");
    await page.waitForFunction(() => window.__rec === null); // coupé pendant la phrase
    await page.waitForFunction((n) => window.__recStarts > n && Boolean(window.__rec), before); // repris après
  });

  test("le bouton micro coupe puis rallume l'écoute", async ({ page }) => {
    const badge = page.getByTestId("mic-badge");
    await expect(badge).toContainText("Micro actif");
    await badge.click();
    await expect(badge).toContainText("Micro inactif");
    await expect(badge).toHaveAttribute("data-status", "off");
    await badge.click();
    await expect(badge).toContainText("Micro actif");
  });
});

test.describe("sans reconnaissance vocale (iPhone, Firefox…)", () => {
  test("l'appli reste entièrement utilisable avec les boutons", async ({ page }) => {
    await installFakeVoice(page, { recognition: false });
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("mic-badge")).toContainText("Micro indisponible");
    await expect(page.getByText("Ce navigateur ne sait pas écouter la voix")).toBeVisible();
    await shot(page, "07-sans-micro");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("client")).toHaveText("Alice");
    await expectLastSpoken(page, "2 pour Alice");
  });
});

test.describe("sauvegarde et reprise", () => {
  test("reprend la préparation en cours après un rechargement", async ({ page }) => {
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("client")).toHaveText("Chloé");

    await page.goto("/");
    await expect(page.getByText("Préparation en cours")).toBeVisible();
    await expect(page.getByText("Produit 1/2 · Étape 3/3")).toBeVisible();
    await shot(page, "08-accueil-reprise");
    await page.getByRole("button", { name: "Reprendre la préparation" }).click();
    await expect(page).toHaveURL(/\/preparation$/);
    await expect(page.getByTestId("client")).toHaveText("Chloé");
    await expectLastSpoken(page, "1 pour Chloé");
  });

  test("fonctionne même si le stockage du navigateur est interdit", async ({ page }) => {
    await page.addInitScript(() => {
      const refuse = () => {
        throw new DOMException("interdit", "SecurityError");
      };
      Storage.prototype.getItem = refuse;
      Storage.prototype.setItem = refuse;
      Storage.prototype.removeItem = refuse;
    });
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("client")).toHaveText("Alice");
  });

  test("renvoie à l'accueil quand il n'y a rien à préparer", async ({ page }) => {
    await page.goto("/preparation");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/verification");
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("valeurs douteuses", () => {
  // Dans un classeur Excel : un texte, un décimal et un nombre supérieur à 50.
  const ROWS = [
    ["Nom", "Fromage", "Yaourt"],
    ["Alice", "3*0,2", 2],
    ["Bob", 2.5, 60],
    ["Chloé", 4, 1],
  ];

  test("bloquent le départ jusqu'à correction ou confirmation", async ({ page }) => {
    await installFakeVoice(page);
    await importFile(page, workbook(ROWS));
    await expect(page.getByTestId("summary")).toContainText("3 valeurs à vérifier");
    const start = page.getByRole("button", { name: "Tout est correct, commencer" });
    await expect(start).toBeDisabled();
    await shot(page, "09-valeurs-orange");

    // 1. « 3*0,2 » : un texte, à corriger (il ne peut pas être gardé)
    await page.getByRole("button", { name: "Vérifier la première" }).click();
    await expect(page.getByText("« 3*0,2 » n'est pas un nombre")).toBeVisible();
    await expect(page.getByRole("button", { name: /Garder/ })).toHaveCount(0);
    await shot(page, "10-editeur-cellule");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Plus un" }).click();
    await expect(page.getByRole("textbox", { name: "Quantité" })).toHaveValue("3");
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.getByTestId("summary")).toContainText("2 valeurs à vérifier");
    await expect(start).toBeDisabled();

    // 2. « 2,5 » : on le garde tel quel ; l'éditeur passe tout seul à la valeur suivante (60)
    await page.getByRole("button", { name: /^Bob, Fromage/ }).click();
    await expect(page.getByText("2,5 n'est pas un nombre entier")).toBeVisible();
    await page.getByRole("button", { name: "Garder 2,5 tel quel" }).click();
    await expect(page.getByText("60 dépasse 50")).toBeVisible();

    // 3. « 60 » : une faute de frappe, on tape 6
    await page.getByRole("textbox", { name: "Quantité" }).fill("6");
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await expect(start).toBeEnabled();

    await start.click();
    await expect(page.getByTestId("quantity")).toHaveText("9,5"); // 3 + 2,5 + 4
    await expectLastSpoken(page, "9,5 Fromage");
  });

  test("mettre une valeur douteuse à 0 saute le client", async ({ page }) => {
    await installFakeVoice(page);
    await importFile(page, workbook(ROWS));
    await page.getByRole("button", { name: "Vérifier la première" }).click();
    await page.getByRole("button", { name: /Mettre à 0/ }).click(); // « 3*0,2 » -> 0, passe à « 2,5 »
    await page.getByRole("button", { name: /Mettre à 0/ }).click(); // « 2,5 » -> 0, passe à « 60 »
    await page.getByRole("button", { name: /Mettre à 0/ }).click(); // « 60 » -> 0, plus rien à vérifier
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("quantity")).toHaveText("4"); // seule Chloé a du fromage
  });
});

test.describe("fichier d'exemple Classeur1.xlsx", () => {
  test.skip(!hasExampleFile, "le fichier exemple/Classeur1.xlsx n'est pas présent");

  test("import, éléments ignorés et premiers pas de la préparation", async ({ page }) => {
    await installFakeVoice(page);
    await importFile(page, EXAMPLE_FILE);
    await expect(page.getByTestId("summary")).toContainText("15 produits · 15 clients · 0 valeur à vérifier");
    await shot(page, "11-exemple-verification");

    // Les 5 produits à étoile sont listés comme ignorés, avec leur raison
    await page.getByText(/Produits ignorés/).click();
    await expect(page.getByText("Le nom du produit contient une étoile (*).")).toHaveCount(5);
    await page.getByText(/Clients ignorés/).click();
    await expect(page.getByRole("listitem").filter({ hasText: "Quentin" })).toContainText("Rien à préparer pour ce client");
    await expect(page.getByRole("listitem").filter({ hasText: /^TOTAL/ })).toContainText("ligne des totaux");
    await shot(page, "12-exemple-ignores");

    // Réglage désactivé : 7 valeurs « 3*0,2 » à vérifier
    await page.getByRole("switch", { name: "Ignorer les produits marqués *" }).click();
    await expect(page.getByTestId("summary")).toContainText("7 valeurs à vérifier");
    await page.getByRole("switch", { name: "Ignorer les produits marqués *" }).click();
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");

    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("progress")).toContainText("Produit 1/15");
    await expectLastSpoken(page, "3 Petit Frison");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expectLastSpoken(page, "1 pour 4 saisons morceaux");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expectLastSpoken(page, "1 pour Amap Amboise plus 6 litres");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expectLastSpoken(page, "1 pour Civray plus 2 litres");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expectLastSpoken(page, "56 fromage blanc 0,5");
    await page.waitForTimeout(800); // laisse finir le défilement du mini-tableau
    await shot(page, "13-exemple-preparation");
  });
});

test.describe("réglages et aide", () => {
  test.beforeEach(async ({ page }) => {
    await installFakeVoice(page);
  });

  test("thème sombre et grand texte, conservés après rechargement", async ({ page }) => {
    await importCsv(page);
    await page.goto("/reglages");
    await page.getByRole("radio", { name: "Sombre" }).click();
    await page.getByRole("radio", { name: "Très grand" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-scale", "xlarge");
    await shot(page, "14-reglages-sombre");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-scale", "xlarge");

    await page.goto("/verification");
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("quantity")).toHaveText("3");
    await shot(page, "15-preparation-sombre");
    await page.goto("/");
    await shot(page, "17-accueil-sombre");
  });

  test("une règle de prononciation personnalisée change ce qui est dit", async ({ page }) => {
    await importCsv(page);
    await page.goto("/reglages");
    await page.getByRole("button", { name: "Ajouter une règle" }).click();
    await page.getByRole("textbox", { name: "Règle 6 : texte du fichier" }).fill("Fromage");
    await page.getByRole("textbox", { name: "Règle 6 : se prononce" }).fill("fro mage");
    await page.getByRole("textbox", { name: "Règle 6 : texte du fichier" }).blur();

    await page.getByRole("textbox", { name: "Essayer un nom" }).fill("Yaourt nature 1L et FB 0,5");
    await expect(page.getByTestId("try-spoken")).toHaveText("Yaourt nature 1 litre et fromage blanc 0,5");

    await page.goto("/verification");
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expectLastSpoken(page, "3 fro mage");
    await expect(page.getByTestId("product")).toHaveText("Fromage"); // l'affichage garde le nom du fichier
  });

  test("le micro coupé dans les réglages reste coupé pendant la préparation", async ({ page }) => {
    await importCsv(page);
    await page.goto("/reglages");
    await page.getByRole("switch", { name: /Écoute vocale/ }).click();
    await page.goto("/verification");
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("mic-badge")).toContainText("Micro inactif");
    expect(await page.evaluate(() => window.__recStarts)).toBe(0);
  });

  test("la vitesse et la voix choisies sont transmises à la parole", async ({ page }) => {
    await page.addInitScript(() => {
      const synth = window.speechSynthesis;
      const speak = synth.speak.bind(synth);
      (window as unknown as { __rates: number[] }).__rates = [];
      synth.speak = (u: SpeechSynthesisUtterance) => {
        (window as unknown as { __rates: number[] }).__rates.push(u.rate);
        speak(u);
      };
    });
    await importCsv(page);
    await page.goto("/reglages");
    await page.getByRole("slider", { name: /Vitesse de la voix/ }).fill("1.3");
    await page.getByRole("combobox", { name: "Voix française" }).selectOption("voix-de-test");
    await page.goto("/verification");
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expectLastSpoken(page, "3 Fromage");
    expect(await page.evaluate(() => (window as unknown as { __rates: number[] }).__rates.at(-1))).toBe(1.3);
  });

  test("effacer les données renvoie à un accueil vide", async ({ page }) => {
    await importCsv(page);
    await page.goto("/reglages");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Effacer les données de cet appareil" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    await expect(page.getByText("Préparation en cours")).toHaveCount(0);
  });

  test("l'accueil affiche le logo de la fromagerie et la scène de ferme", async ({ page }) => {
    await page.goto("/");
    const logo = page.getByRole("img", { name: "Fromagerie des Frisonnes" });
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 100)).toBe(true);
    // les dessins sont décoratifs : cachés des lecteurs d'écran
    expect(await page.locator("svg[aria-hidden='true']").count()).toBeGreaterThan(2);
    await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute("content", /^#[0-9a-f]{6}$/i);
  });

  test("une adresse inconnue affiche une page d'erreur en français", async ({ page }) => {
    await page.goto("/nimporte-quoi");
    await expect(page.getByText("Cette page n'existe pas.")).toBeVisible();
    await shot(page, "18-introuvable");
    await page.getByRole("link", { name: "Retour à l'accueil" }).click();
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  });

  test("la page d'aide explique les règles et l'installation", async ({ page }) => {
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: "Installer sur l'écran d'accueil" })).toBeVisible();
    await expect(page.getByText("Android (Chrome)")).toBeVisible();
    await expect(page.getByText("iPhone (Safari)")).toBeVisible();
    await expect(page.getByText("« où j'en suis »")).toBeVisible();
    await shot(page, "16-aide");
  });

  test("le manifeste et les icônes de l'application sont servis", async ({ page, request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Prépa Commandes", display: "standalone", start_url: "/", lang: "fr" });
    const sizes = manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect((await request.get("/icons/apple-touch-icon.png")).status()).toBe(200);
    expect((await request.get("/favicon.ico")).status()).toBe(200);
    await page.goto("/");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  });
});
