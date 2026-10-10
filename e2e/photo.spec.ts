import { expect, test, type Page } from "@playwright/test";
import { importCsv, installFakeVoice, samplePhoto, shot } from "./helpers";

/** La clé sous laquelle l'appli garde la copie de la photo. */
const PHOTO_KEY = "prepa-commandes:v1:photo";

/**
 * Ce que le service de lecture renvoie pour la photo de ces tests (la vraie lecture est jouée par Gemini côté serveur : ici on
 * remplace la réponse du site, la lecture elle-même est testée à part). Cases douteuses : Biocoop/Yaourt (lu 5), Biocoop/Fromage
 * blanc (lu vide) et Marché/Fromage blanc (lu 4, alors que la photo dit 5 : le total du Fromage blanc, 8, ne tombe donc pas juste
 * avec les quantités lues, qui font 7).
 */
const READING = {
  rows: [
    ["Clients", "Yaourt nature 0.5L", "Fromage blanc", "Bleu *"],
    ["TOTAL", "9", "8", "2"],
    ["Nature Champs", "4", "3", "1"],
    ["Biocoop", "5", "", "1"],
    ["Marché", "", "4", ""],
  ],
  uncertain: [
    [3, 1],
    [3, 2],
    [4, 2],
  ],
  message: "Le bas de la photo est un peu flou.",
  model: "gemini-test",
};

interface Reply {
  status?: number;
  json?: unknown;
  /** La réponse n'est donnée qu'une fois cette promesse tenue. */
  gate?: Promise<void>;
  /** La connexion est coupée (pas de réseau). */
  abort?: boolean;
}

interface Sent {
  headers: Record<string, string>;
  body: Buffer;
}

type Status = { available: boolean; needsCode: boolean };

/** Remplace le service de lecture du site : annonce son état, note les photos reçues et répond ce qu'on lui demande. */
async function mockPhotoService(page: Page, options: { status?: Status | "unreachable"; reply?: Reply } = {}) {
  const sent: Sent[] = [];
  let reply: Reply = options.reply ?? { json: READING };
  await page.route("**/api/lire-photo", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      if (options.status === "unreachable") return route.abort();
      return route.fulfill({ json: options.status ?? { available: true, needsCode: false } });
    }
    sent.push({ headers: request.headers(), body: request.postDataBuffer() ?? Buffer.alloc(0) });
    const answer = reply;
    if (answer.gate) await answer.gate;
    // Si l'appli a annulé entre-temps, la requête n'existe plus : rien à signaler.
    if (answer.abort) return route.abort().catch(() => {});
    return route.fulfill({ status: answer.status ?? 200, json: answer.json }).catch(() => {});
  });
  return {
    sent,
    reply(next: Reply) {
      reply = next;
    },
  };
}

const photoButton = (page: Page) => page.getByRole("button", { name: "Photo du tableau", exact: true });
const chooseSamplePhoto = (page: Page) => page.getByTestId("photo-input").setInputFiles(samplePhoto());
const orangeCells = (page: Page) => page.getByRole("button", { name: /, à vérifier$/ });
const startButton = (page: Page) => page.getByRole("button", { name: "J'ai comparé avec la photo : tout est correct, commencer" });

/** Va sur l'accueil, choisit la photo et arrive sur l'écran de vérification. */
async function importPhoto(page: Page) {
  await page.goto("/");
  await expect(photoButton(page)).toBeVisible();
  await chooseSamplePhoto(page);
  await expect(page).toHaveURL(/\/verification$/);
}

test.describe("importer le tableau depuis une photo", () => {
  test("la photo devient un tableau à vérifier, puis la préparation commence", async ({ page }) => {
    await installFakeVoice(page);
    const service = await mockPhotoService(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Ou : une photo du tableau" })).toBeVisible();
    await page.getByTestId("photo-card").scrollIntoViewIfNeeded();
    await shot(page, "50-photo-accueil");
    await chooseSamplePhoto(page);

    // La photo est réduite et envoyée telle quelle, en JPEG.
    await expect(page).toHaveURL(/\/verification$/);
    expect(service.sent).toHaveLength(1);
    const [{ headers, body }] = service.sent;
    expect(headers["content-type"]).toBe("image/jpeg");
    expect([body[0], body[1], body[2]]).toEqual([0xff, 0xd8, 0xff]);
    expect(body.length).toBeGreaterThan(100);
    expect(headers["x-access-code"]).toBeUndefined();

    // Le tableau est reconstitué avec les mêmes règles qu'un fichier (TOTAL et produit * ignorés) : trois cases douteuses, et le total
    // du Fromage blanc (8) qui ne tombe pas juste avec les quantités lues (7).
    await expect(page.getByTestId("summary")).toContainText("2 produits · 3 clients · 4 valeurs à vérifier");
    await expect(page.getByText("Tableau lu sur une photo", { exact: true })).toBeVisible();
    await expect(page.getByTestId("photo-banner")).toContainText("Comparez chaque ligne avec la photo");
    await expect(page.getByTestId("photo-note")).toContainText("Le bas de la photo est un peu flou.");
    await expect(orangeCells(page)).toHaveCount(4);
    await expect(page.locator('[data-cell="2:1"]')).toHaveText("?"); // lu vide mais douteux
    await expect(page.locator('[data-cell="0:1"]')).toHaveText("8"); // le total qui ne tombe pas juste
    await expect(page.getByRole("button", { name: "TOTAL, Fromage blanc : 8, à vérifier" })).toBeVisible();
    await expect(startButton(page)).toBeDisabled();
    await expect(page.getByRole("button", { name: "Tout est correct, commencer", exact: true })).toHaveCount(0);
    await shot(page, "51-photo-verification");

    // Biocoop / Yaourt : lu « 5 », confirmé.
    await page.getByRole("button", { name: "Vérifier la première" }).click();
    const editor = (title: RegExp) => page.getByRole("dialog", { name: title });
    await expect(editor(/^Biocoop · Yaourt nature 0\.5L$/)).toBeVisible();
    await expect(page.getByTestId("unsure-banner")).toContainText("La lecture de la photo n'est pas sûre");
    await expect(page.getByTestId("unsure-banner")).toContainText("lue : 5");
    await shot(page, "52-photo-case-douteuse");
    await page.getByRole("button", { name: "Oui, c'est bien 5" }).click();

    // On passe à la suivante : Biocoop / Fromage blanc, lue vide, confirmée vide.
    await expect(editor(/^Biocoop · Fromage blanc$/)).toBeVisible();
    await expect(page.getByTestId("unsure-banner")).toContainText("lue : vide");
    await page.getByRole("button", { name: "Oui, cette case est vide" }).click();

    // Puis Marché / Fromage blanc : lue 4, corrigée en 5 d'après la photo. La somme des quantités lues (8) rejoint alors le total de
    // la photo : le doute sur le total se lève tout seul.
    await expect(editor(/^Marché · Fromage blanc$/)).toBeVisible();
    await expect(page.getByText("Valeur lue sur la photo :")).toHaveCount(0); // pas encore modifiée
    await page.getByRole("button", { name: "Plus un" }).click();
    await expect(page.getByRole("textbox", { name: "Quantité" })).toHaveValue("5");
    await expect(page.getByTestId("unsure-banner")).toHaveCount(0); // corrigée : plus de doute
    await expect(page.getByText("Valeur lue sur la photo :")).toBeVisible();
    await expect(page.getByRole("button", { name: /Valeur suivante à vérifier/ })).toHaveCount(0); // le total est réglé aussi
    await page.getByRole("button", { name: "OK" }).click();

    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await expect(orangeCells(page)).toHaveCount(0);
    await expect(startButton(page)).toBeEnabled();
    await startButton(page).click();

    // Yaourt : Nature Champs 4 + Biocoop 5 = 9 ; Fromage blanc : Nature Champs 3 + Marché 5 (corrigé) = 8.
    await expect(page).toHaveURL(/\/preparation$/);
    await expect(page.getByTestId("product")).toHaveText("Yaourt nature 0.5L");
    await expect(page.getByTestId("quantity")).toHaveText("9");
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /Suivant/ }).click();
    await expect(page.getByTestId("product")).toHaveText("Fromage blanc");
    await expect(page.getByTestId("quantity")).toHaveText("8");
  });

  test("l'accueil rappelle que le tableau vient d'une photo", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.goto("/");
    await expect(page.getByText(/Photo du tableau · lue le/)).toBeVisible();
  });

  test("un doute se lève en corrigeant la valeur, et revient si l'on retape la valeur lue", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.locator('[data-cell="2:0"]').click();
    const unsure = page.getByTestId("unsure-banner");
    await expect(unsure).toBeVisible();
    await page.getByRole("button", { name: "Plus un" }).click();
    await expect(unsure).toHaveCount(0);
    await page.getByRole("button", { name: "Moins un" }).click(); // retour à la valeur lue
    await expect(unsure).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click();
    await expect(orangeCells(page)).toHaveCount(4);
  });

  test("« Rétablir » ramène la valeur lue, et le doute avec elle", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.locator('[data-cell="3:1"]').click();
    const quantity = page.getByRole("textbox", { name: "Quantité" });
    await expect(quantity).toHaveValue("4");
    await page.getByRole("button", { name: "Plus un" }).click();
    await expect(quantity).toHaveValue("5");
    await expect(page.getByTestId("unsure-banner")).toHaveCount(0);
    await page.getByRole("button", { name: "Rétablir" }).click();
    await expect(quantity).toHaveValue("4");
    await expect(page.getByTestId("unsure-banner")).toBeVisible();
  });

  test("mettre une case douteuse à 0 la règle et passe à la suivante", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.locator('[data-cell="3:1"]').click();
    await page.getByRole("button", { name: "Mettre à 0 (sauter ce client)" }).click();
    // La case est réglée : la fenêtre passe à la première case encore douteuse.
    await expect(page.getByRole("dialog", { name: /^Biocoop · Yaourt nature 0\.5L$/ })).toBeVisible();
    await page.getByRole("button", { name: "OK" }).click();
    // Restent : Biocoop / Yaourt, Biocoop / Fromage blanc, et le total du Fromage blanc (8 contre 3 : la quantité mise à 0 ne s'y ajoute plus).
    await expect(page.getByTestId("summary")).toContainText("3 valeurs à vérifier");
    await expect(page.locator('[data-cell="3:1"]')).toHaveText("0");
  });

  test("les cases confirmées restent confirmées après un rechargement", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.locator('[data-cell="2:0"]').click();
    await page.getByRole("button", { name: "Oui, c'est bien 5" }).click();
    await page.getByRole("button", { name: "Fermer" }).click();
    await expect(orangeCells(page)).toHaveCount(3);
    await page.reload();
    await expect(page.getByTestId("summary")).toContainText("3 valeurs à vérifier");
    await expect(page.getByTestId("photo-banner")).toBeVisible();
  });
});

test.describe("les totaux de la photo sont comparés aux quantités lues", () => {
  /** Rien n'est signalé douteux par la lecture, mais le total du Fromage blanc (9) ne correspond pas aux quantités lues (3 + 4 = 7). */
  const SILENT = {
    ...READING,
    uncertain: [],
    message: "",
    rows: [
      ["Clients", "Yaourt nature 0.5L", "Fromage blanc", "Bleu *"],
      ["TOTAL", "9", "9", "2"],
      ["Nature Champs", "4", "3", "1"],
      ["Biocoop", "5", "", "1"],
      ["Marché", "", "4", ""],
    ],
  };
  const totalCell = (page: Page) => page.locator('[data-cell="0:1"]');

  test("un écart est signalé sur la ligne TOTAL, même quand la lecture n'avait aucun doute", async ({ page }) => {
    await mockPhotoService(page, { reply: { json: SILENT } });
    await importPhoto(page);
    await expect(page.getByTestId("summary")).toContainText("1 valeur à vérifier");
    await expect(orangeCells(page)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "TOTAL, Fromage blanc : 9, à vérifier" })).toBeVisible();
    await expect(startButton(page)).toBeDisabled();

    await page.getByRole("button", { name: "Vérifier la première" }).click();
    const editor = page.getByRole("dialog", { name: /^TOTAL · Fromage blanc$/ });
    await expect(editor).toBeVisible();
    await expect(page.getByTestId("total-banner")).toContainText("le total de ce produit est 9");
    await expect(page.getByTestId("total-banner")).toContainText("la somme des quantités lues est 7");
    await expect(editor).toContainText("C'est la ligne des totaux");
    await expect(editor.getByRole("button", { name: "Mettre à 0 (sauter ce client)" })).toHaveCount(0);
    await shot(page, "55-photo-total");

    // Si tout est juste d'après la photo, on garde le total tel quel.
    await editor.getByRole("button", { name: "Garder le total 9 tel quel" }).click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await expect(startButton(page)).toBeEnabled();
  });

  test("corriger une quantité pour que la somme tombe juste règle le total tout seul", async ({ page }) => {
    await mockPhotoService(page, { reply: { json: SILENT } });
    await importPhoto(page);
    await page.locator('[data-cell="3:1"]').click(); // Marché / Fromage blanc : lu 4, c'était 6 sur la photo
    await expect(page.getByTestId("unsure-banner")).toHaveCount(0);
    await page.getByRole("button", { name: "Plus un" }).click();
    await page.getByRole("button", { name: "Plus un" }).click();
    await expect(page.getByRole("textbox", { name: "Quantité" })).toHaveValue("6");
    await page.getByRole("button", { name: "OK" }).click();
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await expect(orangeCells(page)).toHaveCount(0);
    await expect(startButton(page)).toBeEnabled();
  });

  test("corriger le total lui-même le règle aussi, et le retaper faux le fait revenir", async ({ page }) => {
    await mockPhotoService(page, { reply: { json: SILENT } });
    await importPhoto(page);
    await totalCell(page).click();
    const quantity = page.getByRole("textbox", { name: "Quantité" });
    await page.getByRole("button", { name: "Moins un" }).click();
    await page.getByRole("button", { name: "Moins un" }).click();
    await expect(quantity).toHaveValue("7");
    await expect(page.getByTestId("total-banner")).toHaveCount(0);
    await page.getByRole("button", { name: "Plus un" }).click();
    await expect(quantity).toHaveValue("8");
    await expect(page.getByTestId("total-banner")).toBeVisible();
  });

  test("le total gardé tel quel le reste après un rechargement", async ({ page }) => {
    await mockPhotoService(page, { reply: { json: SILENT } });
    await importPhoto(page);
    await totalCell(page).click();
    await page.getByRole("button", { name: "Garder le total 9 tel quel" }).click();
    await page.reload();
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
    await totalCell(page).click();
    await expect(page.getByRole("dialog").getByText("Total gardé tel quel : 9")).toBeVisible();
  });

  test("un fichier Excel ou CSV n'est pas concerné : ses totaux ne sont pas vérifiés", async ({ page }) => {
    await importCsv(page, "Nom;Fromage;Yaourt\nTOTAL;99;99\nAlice;2;3\nBob;1;");
    await expect(page.getByTestId("summary")).toContainText("0 valeur à vérifier");
  });
});

test.describe("la photo à côté du tableau", () => {
  test("« Voir la photo » l'affiche, on peut l'agrandir, puis la fermer", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.getByTestId("photo-banner").getByRole("button", { name: "Voir la photo" }).click();
    const sheet = page.getByRole("dialog", { name: "La photo du tableau" });
    await expect(sheet).toBeVisible();
    const image = sheet.getByTestId("photo-image");
    await expect(image).toBeVisible();
    expect(await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
    await shot(page, "53-photo-voir");

    const fitted = (await image.boundingBox())!.width;
    await sheet.getByRole("button", { name: "Agrandir" }).click();
    expect((await image.boundingBox())!.width).toBeGreaterThan(fitted * 2);
    await sheet.getByRole("button", { name: "Voir en entier" }).click();
    expect((await image.boundingBox())!.width).toBeLessThan(fitted * 1.1);

    await sheet.getByRole("button", { name: "Fermer", exact: true }).last().click();
    await expect(sheet).toHaveCount(0);
  });

  test("depuis une case à vérifier : indique quoi chercher, puis revient à la même case", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.locator('[data-cell="2:0"]').click();
    const editor = page.getByRole("dialog", { name: /^Biocoop · Yaourt nature 0\.5L$/ });
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Voir la photo" }).click();

    const sheet = page.getByRole("dialog", { name: "La photo du tableau" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("photo-look")).toContainText("Biocoop");
    await expect(sheet.getByTestId("photo-look")).toContainText("Yaourt nature 0.5L");
    await sheet.getByRole("button", { name: "Fermer", exact: true }).last().click();

    await expect(page.getByRole("dialog", { name: /^Biocoop · Yaourt nature 0\.5L$/ })).toBeVisible();
    await expect(page.getByTestId("unsure-banner")).toBeVisible(); // la case est toujours à vérifier
  });

  test("la photo reste disponible après un rechargement, et disparaît avec la préparation", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    expect(await page.evaluate((key) => (localStorage.getItem(key) ?? "").length, PHOTO_KEY)).toBeGreaterThan(100);

    await page.reload();
    await page.getByTestId("photo-banner").getByRole("button", { name: "Voir la photo" }).click();
    await expect(page.getByTestId("photo-image")).toBeVisible();
    await page.getByRole("button", { name: "Fermer", exact: true }).last().click();

    // Importer un fichier à la place : la photo de l'ancien tableau n'a plus de raison d'être là.
    page.once("dialog", (dialog) => void dialog.accept()); // « remplace la préparation en cours »
    await importCsv(page);
    expect(await page.evaluate((key) => localStorage.getItem(key), PHOTO_KEY)).toBeNull();
    await expect(page.getByTestId("photo-banner")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tout est correct, commencer", exact: true })).toBeVisible();
  });

  test("« Effacer les données » retire aussi la photo", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.goto("/reglages");
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Effacer les données de cet appareil" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate((key) => localStorage.getItem(key), PHOTO_KEY)).toBeNull();
  });

  test("si la photo n'a pas pu être gardée, l'écran le dit et ne propose pas de la voir", async ({ page }) => {
    await mockPhotoService(page);
    await importPhoto(page);
    await page.evaluate((key) => localStorage.removeItem(key), PHOTO_KEY);
    await page.reload();
    await expect(page.getByTestId("photo-banner")).toContainText("La photo n'a pas pu être gardée sur cet appareil");
    await expect(page.getByTestId("photo-banner").getByRole("button", { name: "Voir la photo" })).toHaveCount(0);
    await page.locator('[data-cell="2:0"]').click();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Voir la photo" })).toHaveCount(0);
  });
});

test.describe("quand la lecture ne peut pas se faire", () => {
  const failures = [
    { name: "limite gratuite du jour atteinte", reply: { status: 429, json: { error: "quota", message: "x" } }, text: /photos gratuites du jour est atteint/ },
    { name: "service très sollicité", reply: { status: 503, json: { error: "busy", message: "x" } }, text: /très sollicité/ },
    { name: "aucun tableau sur la photo", reply: { status: 422, json: { error: "no-table", message: "La photo est trop floue." } }, text: /La photo est trop floue\. Cadrez le tableau/ },
    { name: "clé du service refusée", reply: { status: 502, json: { error: "bad-key", message: "x" } }, text: /mal réglée/ },
    { name: "réponse inutilisable", reply: { status: 200, json: { bonjour: 1 } }, text: /n'a rien donné d'exploitable/ },
    { name: "pas de connexion", reply: { abort: true }, text: /Pas de connexion à Internet/ },
  ] satisfies { name: string; reply: Reply; text: RegExp }[];

  for (const failure of failures) {
    test(`${failure.name} : message clair, rien n'est importé, et l'on peut réessayer`, async ({ page }) => {
      const service = await mockPhotoService(page, { reply: failure.reply });
      await page.goto("/");
      await expect(photoButton(page)).toBeVisible();
      await chooseSamplePhoto(page);

      const alert = page.getByRole("alert").filter({ hasText: failure.text });
      await expect(alert).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible(); // pas de préparation en cours
      await expect(page.getByTestId("photo-progress")).toHaveCount(0);
      await expect(photoButton(page)).toBeEnabled();
      expect(await page.evaluate((key) => localStorage.getItem(key), PHOTO_KEY)).toBeNull();
      await alert.scrollIntoViewIfNeeded();
      await shot(page, `54-photo-erreur-${failure.reply.status ?? "reseau"}`);

      // On peut réessayer avec la même photo : cette fois, ça marche.
      service.reply({ json: READING });
      await chooseSamplePhoto(page);
      await expect(page).toHaveURL(/\/verification$/);
      expect(service.sent).toHaveLength(2);
    });
  }

  test("un fichier qui n'est pas une image est refusé sans rien envoyer", async ({ page }) => {
    const service = await mockPhotoService(page);
    await page.goto("/");
    await page.getByTestId("photo-input").setInputFiles({ name: "notes.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
    await expect(page.getByRole("alert").filter({ hasText: /Cette photo n'a pas pu être envoyée/ })).toBeVisible();
    expect(service.sent).toHaveLength(0);
  });

  test("« Annuler » abandonne la lecture : rien n'est importé, même si la réponse arrive après", async ({ page }) => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const service = await mockPhotoService(page, { reply: { json: READING, gate } });
    await page.goto("/");
    await expect(photoButton(page)).toBeVisible();
    await chooseSamplePhoto(page);

    const progress = page.getByTestId("photo-progress");
    await expect(progress).toContainText("Lecture du tableau en cours");
    await expect(photoButton(page)).toBeDisabled();
    await expect.poll(() => service.sent.length).toBe(1);
    await progress.getByRole("button", { name: "Annuler" }).click();
    await expect(progress).toHaveCount(0);
    await expect(photoButton(page)).toBeEnabled();

    open(); // la réponse arrive trop tard
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  });

  test("quitter l'accueil pendant la lecture l'annule (on n'est pas ramené à la vérification)", async ({ page }) => {
    let open!: () => void;
    const gate = new Promise<void>((resolve) => (open = resolve));
    const service = await mockPhotoService(page, { reply: { json: READING, gate } });
    await page.goto("/");
    await expect(photoButton(page)).toBeVisible();
    await chooseSamplePhoto(page);
    await expect.poll(() => service.sent.length).toBe(1);

    await page.getByRole("link", { name: "Réglages" }).click();
    await expect(page).toHaveURL(/\/reglages$/);
    open();
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/\/reglages$/);
  });
});

test.describe("avec une préparation déjà en cours", () => {
  test("lire une photo demande confirmation une fois la photo choisie, et ne change rien si l'on refuse", async ({ page }) => {
    const service = await mockPhotoService(page);
    await importCsv(page);
    await page.goto("/");
    await expect(photoButton(page)).toBeVisible();

    page.once("dialog", (dialog) => {
      expect(dialog.message()).toContain("remplace la préparation en cours");
      void dialog.dismiss();
    });
    await chooseSamplePhoto(page);
    await expect(page).toHaveURL(/\/$/);
    expect(service.sent).toHaveLength(0);
    await expect(page.getByText(/commande\.csv/)).toBeVisible();

    page.once("dialog", (dialog) => void dialog.accept());
    await chooseSamplePhoto(page);
    await expect(page).toHaveURL(/\/verification$/);
    expect(service.sent).toHaveLength(1);
    await expect(page.getByTestId("photo-banner")).toBeVisible();
  });
});

test.describe("le bouton n'apparaît que si le site sait lire les photos", () => {
  async function homeSettled(page: Page) {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
    await page.waitForTimeout(400); // le temps de recevoir (ou de ne pas recevoir) la réponse du site
  }

  test("site sans clé : l'accueil est inchangé, et les réglages l'expliquent", async ({ page }) => {
    await mockPhotoService(page, { status: { available: false, needsCode: false } });
    await homeSettled(page);
    await expect(page.getByTestId("photo-card")).toHaveCount(0);
    await expect(photoButton(page)).toHaveCount(0);
    await page.goto("/reglages");
    await expect(page.getByTestId("settings-photo-status")).toContainText("Pas activée sur ce site");
  });

  test("site injoignable : pas de bouton, et les réglages disent qu'on ne sait pas", async ({ page }) => {
    await mockPhotoService(page, { status: "unreachable" });
    await homeSettled(page);
    await expect(page.getByTestId("photo-card")).toHaveCount(0);
    await page.goto("/reglages");
    await expect(page.getByTestId("settings-photo-status")).toContainText("État inconnu");
  });

  test("site prêt : le bouton est là, et les réglages l'indiquent", async ({ page }) => {
    await mockPhotoService(page);
    await page.goto("/reglages");
    await expect(page.getByTestId("settings-photo-status")).toContainText("Activée");
    await expect(page.getByTestId("settings-photo-status")).toContainText("envoyée à Google");
    await page.goto("/");
    await expect(page.getByTestId("photo-card")).toBeVisible();
    await expect(page.getByTestId("photo-card")).toContainText("envoyée à Google");
  });

  test("sans réseau ni serveur de lecture (site sans route), l'accueil reste inchangé", async ({ page }) => {
    await page.route("**/api/lire-photo", (route) => route.fulfill({ status: 404, body: "Not found" }));
    await homeSettled(page);
    await expect(page.getByTestId("photo-card")).toHaveCount(0);
  });
});

test.describe("code d'accès", () => {
  const needsCode = { available: true, needsCode: true };

  test("demandé avant de choisir la photo, envoyé avec elle, et retenu ensuite", async ({ page }) => {
    const service = await mockPhotoService(page, { status: needsCode });
    await page.goto("/");
    await expect(page.getByLabel("Code d'accès")).toBeVisible();

    // Sans code : on le dit tout de suite, sans ouvrir le choix de photo ni rien envoyer.
    await photoButton(page).click();
    await expect(page.getByRole("alert").filter({ hasText: /Tapez d'abord le code d'accès/ })).toBeVisible();
    expect(service.sent).toHaveLength(0);

    await page.getByLabel("Code d'accès").fill("frisonnes");
    await chooseSamplePhoto(page);
    await expect(page).toHaveURL(/\/verification$/);
    expect(service.sent[0].headers["x-access-code"]).toBe("frisonnes");

    // Au retour sur l'accueil, le code est déjà là.
    await page.goto("/");
    await expect(page.getByLabel("Code d'accès")).toHaveValue("frisonnes");
  });

  test("un faux code est signalé, et on peut le corriger", async ({ page }) => {
    const service = await mockPhotoService(page, {
      status: needsCode,
      reply: { status: 403, json: { error: "forbidden", message: "Le code d'accès est absent ou faux." } },
    });
    await page.goto("/");
    await page.getByLabel("Code d'accès").fill("faux");
    await chooseSamplePhoto(page);
    await expect(page.getByRole("alert").filter({ hasText: /code d'accès est absent ou faux/ })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);

    service.reply({ json: READING });
    await page.getByLabel("Code d'accès").fill("bon-code");
    await chooseSamplePhoto(page);
    await expect(page).toHaveURL(/\/verification$/);
    expect(service.sent[1].headers["x-access-code"]).toBe("bon-code");
  });

  test("pas de champ quand le site n'en demande pas", async ({ page }) => {
    await mockPhotoService(page);
    await page.goto("/");
    await expect(photoButton(page)).toBeVisible();
    await expect(page.getByLabel("Code d'accès")).toHaveCount(0);
  });
});

test.describe("rien ne déborde de l'écran", () => {
  const sideOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  for (const percent of [100, 200]) {
    test(`accueil, vérification et fenêtres de la photo, police à ${percent} %`, async ({ page }) => {
      await mockPhotoService(page, { status: { available: true, needsCode: true } });
      await page.goto("/");
      await page.evaluate((p) => void (document.documentElement.style.fontSize = `${p}%`), percent);
      await expect(photoButton(page)).toBeVisible();
      expect(await sideOverflow(page), "accueil").toBeLessThanOrEqual(0);

      await page.getByLabel("Code d'accès").fill("frisonnes");
      await chooseSamplePhoto(page);
      await expect(page).toHaveURL(/\/verification$/);
      await page.evaluate((p) => void (document.documentElement.style.fontSize = `${p}%`), percent);
      expect(await sideOverflow(page), "vérification").toBeLessThanOrEqual(0);
      const width = page.viewportSize()!.width;
      await expect(startButton(page)).toBeVisible();
      // La barre du bas reste collée en bas de l'écran tant qu'elle en prend une petite part ; sinon (texte très agrandi sur un petit
      // téléphone) elle passe à la fin de la page, au lieu de recouvrir le tableau et d'empêcher de toucher les valeurs.
      const bar = page.locator("[data-floating]");
      await expect
        .poll(async () => {
          const box = (await bar.boundingBox())!;
          const floating = (await bar.getAttribute("data-floating")) === "true";
          return floating === box.height <= page.viewportSize()!.height * 0.4;
        })
        .toBe(true);
      const start = (await startButton(page).boundingBox())!;
      expect(start.x).toBeGreaterThanOrEqual(0);
      expect(start.x + start.width).toBeLessThanOrEqual(width + 0.5);

      for (const [name, open, title] of [
        ["la case à vérifier", () => page.locator('[data-cell="2:0"]').click(), /^Biocoop · Yaourt nature 0\.5L$/],
      ] as const) {
        await open();
        const dialog = page.getByRole("dialog", { name: title });
        await expect(dialog).toBeVisible();
        expect(await sideOverflow(page), name).toBeLessThanOrEqual(0);
        const frame = (await dialog.locator("> div").boundingBox())!;
        expect(frame.x, `${name} dépasse à gauche`).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width, `${name} dépasse à droite`).toBeLessThanOrEqual(width);
        expect(frame.y, `${name} dépasse en haut`).toBeGreaterThanOrEqual(0);
        // Les gros boutons de la fenêtre restent atteignables.
        await dialog.getByRole("button", { name: "Voir la photo" }).scrollIntoViewIfNeeded();
        await dialog.getByRole("button", { name: "Voir la photo" }).click();
      }

      const photo = page.getByRole("dialog", { name: "La photo du tableau" });
      await expect(photo).toBeVisible();
      expect(await sideOverflow(page), "photo").toBeLessThanOrEqual(0);
      const frame = (await photo.locator("> div").boundingBox())!;
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.x + frame.width).toBeLessThanOrEqual(width);
      await photo.getByRole("button", { name: "Agrandir" }).click();
      expect(await sideOverflow(page), "photo agrandie").toBeLessThanOrEqual(0);
    });
  }
});
