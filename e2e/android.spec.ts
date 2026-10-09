import { expect, test, type Page } from "@playwright/test";
import { importCsv, importFile, installFakeVoice, shot, workbook } from "./helpers";

/**
 * Ce qui est propre à Android. Ces tests tournent sur des profils Android de Playwright (voir `playwright.config.ts`) :
 * agent utilisateur de Chrome sur Android, écran tactile. Les vraies fonctions du téléphone (reconnaissance vocale de
 * Google, vraie installation, vrai sélecteur de fichiers) ne peuvent pas être jouées ici : elles sont simulées.
 */

const FACEBOOK_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/440.0.0.0.0;]";
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0";
const SAMSUNG_INTERNET =
  "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36";
const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1";

declare global {
  interface Window {
    __installPrompts: number;
    __installEvent: Event;
  }
}

/** Ouvre l'explication repliée sous le micro (écran de préparation). */
async function openMicHint(page: Page) {
  await page.getByTestId("mic-hint").locator("summary").click();
}

/** Chrome propose l'installation : ce qu'il envoie quelques instants après le chargement d'une appli installable. */
async function offerInstall(page: Page) {
  await page.evaluate(() => {
    window.__installPrompts = 0;
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        window.__installPrompts += 1;
      },
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    window.__installEvent = event;
    window.dispatchEvent(event);
  });
}

test.describe("installation sur l'écran d'accueil", () => {
  test("Chrome Android : les étapes d'installation s'affichent à l'accueil", async ({ page }) => {
    await page.goto("/");
    const card = page.getByTestId("install-card");
    await expect(card.getByRole("heading", { name: "Installer sur le téléphone" })).toBeVisible();
    await expect(card).toContainText("Touchez le menu ⋮");
    await expect(card).toContainText("Installer l'application");
    await expect(card.getByRole("button", { name: "Installer l'application" })).toHaveCount(0); // Chrome n'a encore rien proposé
    await shot(page, "30-android-installer");
  });

  test("quand Chrome propose l'installation, un gros bouton ouvre sa fenêtre, une seule fois", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("install-card")).toBeVisible();
    await offerInstall(page);
    expect(await page.evaluate(() => window.__installEvent.defaultPrevented)).toBe(true); // pas de petit bandeau automatique
    const button = page.getByRole("button", { name: "Installer l'application" });
    await expect(button).toBeVisible();
    await shot(page, "31-android-bouton-installer");
    await button.click();
    await expect.poll(() => page.evaluate(() => window.__installPrompts)).toBe(1);
    await expect(button).toHaveCount(0); // un événement ne sert qu'une fois : on retombe sur les étapes à suivre
    await expect(page.getByTestId("install-card")).toContainText("Touchez le menu ⋮");
  });

  test("l'événement envoyé par Chrome avant l'affichage de l'accueil n'est pas perdu", async ({ page }) => {
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: "Le principe" })).toBeVisible();
    await offerInstall(page); // Chrome l'envoie une seule fois, ici alors qu'on n'est pas à l'accueil
    await page.getByRole("link", { name: "Accueil" }).click();
    await expect(page.getByRole("button", { name: "Installer l'application" })).toBeVisible();
  });

  test("une fois installée, l'appli ne propose plus de s'installer", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("install-card")).toBeVisible();
    await offerInstall(page);
    await expect(page.getByRole("button", { name: "Installer l'application" })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(page.getByTestId("install-card")).toHaveCount(0);
  });

  test("« Masquer » cache la carte, même après un rechargement ; l'aide garde les explications", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /^Masquer/ }).click();
    await expect(page.getByTestId("install-card")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    await expect(page.getByTestId("install-card")).toHaveCount(0);
    await page.goto("/aide");
    await expect(page.getByRole("heading", { name: "Installer sur l'écran d'accueil" })).toBeVisible();
  });

  test("ouverte depuis l'écran d'accueil (plein écran), l'appli ne propose rien", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (query: string) =>
        query.includes("display-mode: standalone") ? ({ ...original("(min-width: 0px)"), media: query, matches: true } as MediaQueryList) : original(query);
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    await expect(page.getByTestId("install-card")).toHaveCount(0);
  });

  test.describe("Samsung Internet", () => {
    test.use({ userAgent: SAMSUNG_INTERNET });
    test("les étapes sont celles du menu de Samsung Internet", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByTestId("install-card")).toContainText("Ajouter la page à");
    });
  });

  test.describe("Firefox", () => {
    test.use({ userAgent: FIREFOX_ANDROID });
    test("les étapes sont celles du menu de Firefox, et le micro renvoie vers Chrome", async ({ page }) => {
      await installFakeVoice(page, { recognition: false });
      await page.goto("/");
      await expect(page.getByTestId("install-card")).toContainText("Touchez « Installer »");
      await importCsv(page);
      await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
      await expect(page.getByTestId("mic-badge")).toHaveAttribute("data-status", "unsupported");
      await openMicHint(page);
      await expect(page.getByText("Ouvrez l'appli dans Chrome")).toBeVisible();
      await page.getByRole("button", { name: /Suivant/ }).click(); // les boutons marchent quand même
      await expect(page.getByTestId("progress")).toContainText("Étape 2/");
    });
  });

  test.describe("navigateur intégré à une autre appli (Facebook, Messenger…)", () => {
    test.use({ userAgent: FACEBOOK_ANDROID });
    test("prévient et conseille d'ouvrir Chrome, sans proposer d'installer", async ({ page }) => {
      await installFakeVoice(page, { recognition: false });
      await page.goto("/");
      const notice = page.getByTestId("in-app-notice");
      await expect(notice).toContainText("navigateur d'une autre appli");
      await expect(notice).toContainText("Chrome");
      await expect(page.getByTestId("install-card")).toHaveCount(0);
      await shot(page, "32-android-navigateur-integre");
      await importCsv(page);
      await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
      await openMicHint(page);
      await expect(page.getByText(/intégré à une autre appli, ne sait pas écouter la voix/)).toBeVisible();
    });
  });
});

test.describe("critères d'installation de Chrome", () => {
  test.use({ serviceWorkers: "allow" });

  test("manifeste, icônes et service worker : Chrome ne signale aucun obstacle à l'installation", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    const cdp = await page.context().newCDPSession(page);
    await expect
      .poll(async () => {
        const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
        // Le contexte de test de Playwright est une fenêtre privée, où Chrome n'installe jamais rien : seule cette raison est tolérée.
        return installabilityErrors.map((error) => error.errorId).filter((id) => id !== "in-incognito");
      })
      .toEqual([]);

    const manifest = await cdp.send("Page.getAppManifest");
    expect(manifest.errors).toEqual([]);
    expect(JSON.parse(manifest.data ?? "{}")).toMatchObject({
      name: "Prépa Commandes",
      short_name: "Prépa",
      display: "standalone",
      start_url: "/",
      lang: "fr",
    });
  });
});

test.describe("choisir le fichier sur Android", () => {
  test("le sélecteur de fichiers n'est pas filtré (un .xlsx reçu par WhatsApp ne doit pas être grisé)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    expect(await page.getByTestId("file-input").getAttribute("accept")).toBeNull();
  });

  test("un PDF ou une photo choisi par erreur donne un message clair, et on peut réessayer", async ({ page }) => {
    await page.goto("/");
    const input = page.getByTestId("file-input");
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(7)]);
    await input.setInputFiles({ name: "IMG_2041.jpg", mimeType: "image/jpeg", buffer: jpeg });
    const alert = page.getByRole("alert").filter({ hasText: "pas un tableau" });
    await expect(alert).toContainText("une image, pas un tableau");
    await expect(page).toHaveURL(/\/$/);

    await input.setInputFiles({ name: "bon.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.7\n") });
    await expect(alert).toContainText("un PDF, pas un tableau");

    await input.setInputFiles({ name: "commande.csv", mimeType: "text/csv", buffer: Buffer.from("Nom;Fromage\nAlice;2") });
    await expect(page).toHaveURL(/\/verification$/);
  });

  test("un fichier sans extension, comme en renvoie parfois Android, est lu d'après son contenu", async ({ page }) => {
    await importFile(page, { name: "document", mimeType: "application/octet-stream", buffer: Buffer.from("Nom;Fromage\nAlice;2\nBob;3") });
    await expect(page.getByTestId("summary")).toContainText("1 produit · 2 clients");
  });

  test("importer un autre fichier demande confirmation une fois le fichier choisi, et garde la préparation si on refuse", async ({ page }) => {
    await importCsv(page);
    await page.goto("/");
    await expect(page.getByText("Tableau prêt")).toBeVisible();
    const other = { name: "autre.csv", mimeType: "text/csv", buffer: Buffer.from("Nom;Beurre\nZoé;2") };

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("autre.csv");
      void dialog.dismiss();
    });
    await page.getByTestId("file-input").setInputFiles(other);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("commande.csv", { exact: false })).toBeVisible(); // l'ancienne préparation est toujours là

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("file-input").setInputFiles(other);
    await expect(page).toHaveURL(/\/verification$/);
    await expect(page.getByText(/autre\.csv/)).toBeVisible();
  });

  test.describe("iPhone", () => {
    test.use({ userAgent: IPHONE_SAFARI });
    test("sur iPhone, le sélecteur garde son filtre Excel / CSV", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
      expect(await page.getByTestId("file-input").getAttribute("accept")).toContain(".xlsx");
    });
  });
});

test.describe("clavier à l'écran", () => {
  test("la page se réduit quand le clavier s'ouvre au lieu d'être recouverte", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /interactive-widget=resizes-content/);
  });

  test("la fenêtre de saisie d'une quantité reste entièrement visible avec un clavier ouvert", async ({ page }) => {
    await installFakeVoice(page);
    await importFile(page, workbook([["Nom", "Fromage"], ["Alice", "3*0,2"], ["Bob", 2]]));
    await page.getByRole("button", { name: "Vérifier la première" }).click();
    const sheet = page.locator("dialog.sheet");
    await expect(sheet).toBeVisible();

    // Un clavier de téléphone prend la moitié de l'écran : avec « resizes-content », la page se réduit à ce qui reste.
    const keyboardHeight = 440;
    const viewport = page.viewportSize()!;
    await page.setViewportSize({ width: viewport.width, height: viewport.height - keyboardHeight });
    const visibleHeight = viewport.height - keyboardHeight;

    const title = sheet.getByRole("heading");
    const close = sheet.getByRole("button", { name: "Fermer" });
    const input = sheet.getByRole("textbox", { name: "Quantité" });
    for (const [name, target] of [["le titre", title], ["le bouton Fermer", close], ["le champ de quantité", input]] as const) {
      const box = (await target.boundingBox())!;
      expect(box.y, `${name} dépasse en haut`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${name} dépasse en bas`).toBeLessThanOrEqual(visibleHeight);
    }
    const frame = (await sheet.locator("> div").boundingBox())!;
    expect(frame.y + frame.height, "la fenêtre déborde de l'écran").toBeLessThanOrEqual(visibleHeight + 1);

    // Le reste de la fenêtre défile, jusqu'au bouton OK.
    const ok = sheet.getByRole("button", { name: "OK" });
    await ok.scrollIntoViewIfNeeded();
    const okBox = (await ok.boundingBox())!;
    expect(okBox.y + okBox.height).toBeLessThanOrEqual(visibleHeight);
    await shot(page, "33-android-clavier-ouvert");
  });

  test("le champ de quantité ouvre le clavier numérique, dont la touche OK range le clavier", async ({ page }) => {
    await installFakeVoice(page);
    await importFile(page, workbook([["Nom", "Fromage"], ["Alice", "3*0,2"], ["Bob", 2]]));
    await page.getByRole("button", { name: "Vérifier la première" }).click();
    const input = page.getByRole("textbox", { name: "Quantité" });
    await expect(input).toHaveAttribute("inputmode", "numeric");
    await expect(input).toHaveAttribute("enterkeyhint", "done");
    await input.focus();
    await expect(input).toBeFocused();
    await input.press("4");
    await input.press("Enter");
    await expect(input).not.toBeFocused();
    await expect(input).toHaveValue("4");
  });
});

test.describe("bouton Retour d'Android", () => {
  test("un retour en pleine préparation ramène au tableau, d'où l'on reprend exactement au même endroit", async ({ page }) => {
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    const progress = (await page.getByTestId("progress").textContent())!;

    await page.goBack();
    await expect(page).toHaveURL(/\/verification$/);
    await expect(page.getByRole("button", { name: "Tout est correct, commencer" })).toHaveCount(0);
    await shot(page, "34-android-retour-en-preparation");

    await page.getByRole("button", { name: "Reprendre la préparation en cours" }).click();
    await expect(page).toHaveURL(/\/preparation$/);
    await expect(page.getByTestId("progress")).toHaveText(progress);
  });

  test("« Recommencer depuis le début » demande d'abord confirmation", async ({ page }) => {
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await page.getByRole("button", { name: /Suivant/ }).click();
    await page.goBack();
    const restart = page.getByRole("button", { name: "Recommencer depuis le début" });

    page.once("dialog", (dialog) => void dialog.dismiss());
    await restart.click();
    await expect(page).toHaveURL(/\/verification$/); // refusé : on reste là, la préparation est intacte

    page.once("dialog", (dialog) => void dialog.accept());
    await restart.click();
    await expect(page).toHaveURL(/\/preparation$/);
    await expect(page.getByTestId("progress")).toContainText("Étape 1/");
  });
});

test.describe("voix", () => {
  test("les voix françaises d'Android (langue notée « fr_FR ») sont proposées dans les réglages", async ({ page }) => {
    await installFakeVoice(page);
    await page.addInitScript(() => {
      const voices = [
        { name: "Français (France)", lang: "fr_FR", voiceURI: "fr-fr-x-frc-local", default: true, localService: true },
        { name: "English (US)", lang: "en_US", voiceURI: "en-us-x-tpf-local", default: false, localService: true },
      ];
      (window.speechSynthesis as unknown as { getVoices: () => unknown[] }).getVoices = () => voices;
    });
    await page.goto("/reglages");
    const select = page.getByRole("combobox", { name: "Voix française" });
    await expect(select.locator("option")).toHaveText(["Automatique (voix française de l'appareil)", "Français (France) (fr_FR)"]);
  });

  test("aucune voix française installée : l'écran l'explique et l'appli reste utilisable aux boutons", async ({ page }) => {
    await installFakeVoice(page);
    await page.addInitScript(() => {
      const synth = window.speechSynthesis as unknown as { speak(u: { onerror?: ((e: { error: string }) => void) | null }): void };
      synth.speak = (utterance) => void setTimeout(() => utterance.onerror?.({ error: "language-unavailable" }), 20);
    });
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    const banner = page.getByTestId("speech-problem");
    await expect(banner).toContainText("Aucune voix française installée");
    await expect(banner.getByText("Synthèse vocale")).toBeHidden(); // l'explication est repliée : les gros boutons restent à l'écran
    await banner.locator("summary").click();
    await expect(banner.getByText(/Synthèse vocale.*étapes à l'écran/)).toBeVisible();
    await shot(page, "35-android-pas-de-voix");
    await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("progress")).toContainText("Étape 2/");
  });

  test("reconnaissance vocale indisponible : conseils pour Android, puis nouvel essai en touchant le badge", async ({ page }) => {
    await installFakeVoice(page, { recognitionError: "service-not-allowed" });
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    const badge = page.getByTestId("mic-badge");
    await expect(badge).toHaveAttribute("data-status", "unavailable");
    await openMicHint(page);
    await expect(page.getByText(/application Google/)).toBeVisible();
    await shot(page, "36-android-micro-indisponible");

    const starts = await page.evaluate(() => window.__recStarts);
    await page.evaluate(() => {
      window.__recError = null; // le téléphone est réparé
    });
    await badge.click();
    await expect(badge).toHaveAttribute("data-status", "listening");
    expect(await page.evaluate(() => window.__recStarts)).toBeGreaterThan(starts);
  });

  test("micro refusé : explique où l'autoriser sur Android", async ({ page }) => {
    await installFakeVoice(page, { recognitionError: "not-allowed" });
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("mic-badge")).toHaveAttribute("data-status", "denied");
    await openMicHint(page);
    await expect(page.getByText(/Infos sur l'appli/)).toBeVisible();
  });
});

test.describe("comportement du navigateur Android", () => {
  test("tirer l'écran vers le bas ne recharge pas la page (pull-to-refresh)", async ({ page }) => {
    await installFakeVoice(page);
    await page.goto("/");
    const overscroll = () => page.evaluate(() => getComputedStyle(document.documentElement).overscrollBehaviorY);
    expect(await overscroll()).toBe("none");
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("quantity")).toBeVisible();
    expect(await overscroll()).toBe("none");
  });

  test("aucune erreur dans la console en parcourant les écrans", async ({ page }) => {
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(`console: ${message.text()}`);
    });
    await installFakeVoice(page);
    await importCsv(page);
    await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
    await expect(page.getByTestId("quantity")).toBeVisible();
    for (const path of ["/reglages", "/aide", "/"]) {
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
    expect(problems).toEqual([]);
  });
});

test.describe("texte agrandi par les réglages d'Android", () => {
  // Android agrandit les textes de 130 % (« Très grand »), et davantage avec l'accessibilité : on simule jusqu'à 200 %.
  async function sideOverflow(page: Page) {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  }

  for (const percent of [150, 200]) {
    test(`police du téléphone à ${percent} % : aucun écran ne déborde sur les côtés`, async ({ page }) => {
      await installFakeVoice(page);
      await page.goto("/");
      await page.evaluate((p) => void (document.documentElement.style.fontSize = `${p}%`), percent);
      expect(await sideOverflow(page), "accueil").toBeLessThanOrEqual(0);

      await page.getByTestId("file-input").setInputFiles({
        name: "commande.csv",
        mimeType: "text/csv",
        buffer: Buffer.from("Nom;Fromage;Yaourt nature 0.5L\nAlice;2;3\nBob;1;\nChloé;;4"),
      });
      await expect(page).toHaveURL(/\/verification$/);
      expect(await sideOverflow(page), "vérification").toBeLessThanOrEqual(0);

      await page.getByRole("button", { name: "Tout est correct, commencer" }).click();
      await expect(page.getByTestId("quantity")).toBeVisible();
      expect(await sideOverflow(page), "préparation").toBeLessThanOrEqual(0);
      // L'écran de préparation défile dans son propre cadre : c'est lui qui ne doit pas déborder sur les côtés.
      const scroller = page.getByTestId("prep-scroll");
      expect(await scroller.evaluate((el) => el.scrollWidth - el.clientWidth), "préparation (cadre)").toBeLessThanOrEqual(0);
      const width = page.viewportSize()!.width;
      for (const [name, target] of [
        ["la quantité", page.getByTestId("quantity")],
        ["le produit", page.getByTestId("product")],
        ["le bouton Suivant", page.getByRole("button", { name: /Suivant/ })],
        ["le bouton Précédent", page.getByRole("button", { name: /Précédent/ })],
        ["le bouton Répéter", page.getByRole("button", { name: /Répéter/ })],
        ["le bouton Pause", page.getByRole("button", { name: /Pause/ })],
        ["le badge du micro", page.getByTestId("mic-badge")],
        ["le bouton de sensibilité du micro", page.getByTestId("sensitivity-button")],
        ["le bouton « Aller à… »", page.getByTestId("progress").getByRole("button")],
      ] as const) {
        const box = (await target.boundingBox())!;
        expect(box.x, `${name} dépasse à gauche`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${name} dépasse à droite`).toBeLessThanOrEqual(width + 0.5);
      }
      // Les gros boutons restent atteignables (la zone défile si l'écran est trop petit).
      await page.getByRole("button", { name: /Suivant/ }).click();
      await expect(page.getByTestId("progress")).toContainText("Étape 2/");
      await shot(page, `37-android-police-${percent}`);

      // Les fenêtres de l'écran de préparation, à ce niveau de texte : rien ne déborde sur les côtés.
      for (const [name, open, title] of [
        ["« Aller à… »", () => page.getByTestId("progress").getByRole("button").click(), "Aller à…"],
        ["la sensibilité du micro", () => page.getByTestId("sensitivity-button").click(), "Sensibilité du micro"],
      ] as const) {
        await open();
        const dialog = page.getByRole("dialog", { name: title });
        await expect(dialog).toBeVisible();
        expect(await sideOverflow(page), name).toBeLessThanOrEqual(0);
        const frame = (await dialog.locator("> div").boundingBox())!;
        expect(frame.x, `${name} dépasse à gauche`).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width, `${name} dépasse à droite`).toBeLessThanOrEqual(width);
        expect(frame.y, `${name} dépasse en haut`).toBeGreaterThanOrEqual(0);
        await page.getByRole("button", { name: "Fermer" }).click();
        await expect(dialog).toHaveCount(0);
      }

      await page.getByRole("link", { name: "Réglages" }).click();
      await expect(page.getByRole("heading", { name: "Voix" })).toBeVisible();
      expect(await sideOverflow(page), "réglages").toBeLessThanOrEqual(0);

      await page.goBack();
      await page.getByRole("link", { name: "Retour au tableau" }).click();
      await page.getByRole("button", { name: /^Alice, Fromage/ }).click(); // la fenêtre de saisie d'une quantité
      await expect(page.getByRole("textbox", { name: "Quantité" })).toBeVisible();
      expect(await sideOverflow(page), "fenêtre de saisie").toBeLessThanOrEqual(0);
      const sheet = (await page.locator("dialog.sheet > div").boundingBox())!;
      expect(sheet.x).toBeGreaterThanOrEqual(0);
      expect(sheet.x + sheet.width).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: "Fermer" }).click();

      await page.goto("/aide");
      await page.evaluate((p) => void (document.documentElement.style.fontSize = `${p}%`), percent);
      expect(await sideOverflow(page), "aide").toBeLessThanOrEqual(0);
    });
  }
});
