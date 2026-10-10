import { describe, expect, it, vi } from "vitest";
import { fetchPhotoStatus, fitWithin, sendPhoto } from "@/lib/photo/client";
import { describePhotoError, isPhotoErrorCode } from "@/lib/photo/messages";
import { PhotoError, type PhotoErrorCode } from "@/lib/photo/types";

const IMAGE = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
const TABLE = { rows: [["Clients", "Yaourt"], ["Alice", "3"]], uncertain: [[1, 1]], message: null, model: "gemini-test" };

/** Un faux `fetch` qui répond ce qu'on lui dit et note la demande. */
function fakeFetch(reply: Response | Error | ((init: RequestInit) => Promise<Response>)) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    if (reply instanceof Error) throw reply;
    return typeof reply === "function" ? reply(init ?? {}) : reply.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** Comme un vrai `fetch` qui n'obtient jamais de réponse : il échoue seulement quand on l'interrompt. */
const hanging = (init: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init.signal!.addEventListener("abort", () => reject(new DOMException("interrompu", "AbortError")));
  });

async function failureOf(promise: Promise<unknown>): Promise<PhotoError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PhotoError);
    return error as PhotoError;
  }
  throw new Error("L'envoi aurait dû échouer.");
}

describe("fetchPhotoStatus", () => {
  it("renvoie l'état donné par le site", async () => {
    const { fetchImpl, calls } = fakeFetch(Response.json({ available: true, needsCode: true }));
    expect(await fetchPhotoStatus(fetchImpl)).toEqual({ available: true, needsCode: true });
    expect(calls[0].url).toBe("/api/lire-photo");
    expect(calls[0].init.cache).toBe("no-store");
  });

  it("« needsCode » vaut faux s'il manque", async () => {
    expect(await fetchPhotoStatus(fakeFetch(Response.json({ available: false })).fetchImpl)).toEqual({ available: false, needsCode: false });
  });

  it("renvoie null quand on ne peut pas savoir (erreur, pas de réseau, réponse inattendue)", async () => {
    expect(await fetchPhotoStatus(fakeFetch(new Response("", { status: 404 })).fetchImpl)).toBeNull();
    expect(await fetchPhotoStatus(fakeFetch(new TypeError("Failed to fetch")).fetchImpl)).toBeNull();
    expect(await fetchPhotoStatus(fakeFetch(new Response("<html>", { status: 200 })).fetchImpl)).toBeNull();
    expect(await fetchPhotoStatus(fakeFetch(Response.json({ available: "oui" })).fetchImpl)).toBeNull();
    expect(await fetchPhotoStatus(fakeFetch(Response.json(null)).fetchImpl)).toBeNull();
  });
});

describe("sendPhoto", () => {
  it("envoie la photo telle quelle et renvoie le tableau lu", async () => {
    const { fetchImpl, calls } = fakeFetch(Response.json(TABLE));
    expect(await sendPhoto(IMAGE, { fetchImpl })).toEqual(TABLE);
    expect(calls[0].url).toBe("/api/lire-photo");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBe(IMAGE);
    expect(calls[0].init.headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("joint le code d'accès quand il y en a un", async () => {
    const { fetchImpl, calls } = fakeFetch(Response.json(TABLE));
    await sendPhoto(IMAGE, { fetchImpl, code: "abc" });
    expect(calls[0].init.headers).toEqual({ "Content-Type": "image/jpeg", "x-access-code": "abc" });
    await sendPhoto(IMAGE, { fetchImpl, code: "" });
    expect(calls[1].init.headers).toEqual({ "Content-Type": "image/jpeg" });
  });

  it("vérifie à nouveau la réponse (un site ou un intermédiaire peut répondre autre chose)", async () => {
    const odd = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(Response.json({ hello: "world" })).fetchImpl }));
    expect(odd.code).toBe("unreadable");
    const html = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(new Response("<html></html>", { status: 200 })).fetchImpl }));
    expect(html.code).toBe("unreadable");
    const single = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(Response.json({ rows: [["a", "b"]] })).fetchImpl }));
    expect(single.code).toBe("no-table");
  });

  it("modèle absent de la réponse : chaîne vide", async () => {
    const { rows } = TABLE;
    const result = await sendPhoto(IMAGE, { fetchImpl: fakeFetch(Response.json({ rows, uncertain: [], message: null })).fetchImpl });
    expect(result.model).toBe("");
  });

  describe("erreurs du site", () => {
    it.each<PhotoErrorCode>([
      "not-configured",
      "forbidden",
      "bad-request",
      "bad-key",
      "quota",
      "busy",
      "no-table",
      "too-big",
      "unreadable",
      "offline",
      "upstream",
    ])("reprend le code « %s » et le message renvoyés par le serveur", async (code) => {
      const reply = Response.json({ error: code, message: "Message du serveur." }, { status: 422 });
      const error = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(reply).fetchImpl }));
      expect(error.code).toBe(code);
      expect(error.message).toBe("Message du serveur.");
    });

    it("code inconnu ou réponse qui n'est pas du JSON : « upstream »", async () => {
      const unknown = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(Response.json({ error: "bizarre" }, { status: 500 })).fetchImpl }));
      expect(unknown.code).toBe("upstream");
      const text = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(new Response("Internal Server Error", { status: 500 })).fetchImpl }));
      expect(text.code).toBe("upstream");
    });

    it("504 de Vercel (lecture trop longue) : « busy » ; 413 (envoi trop gros) : « bad-request »", async () => {
      expect((await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(new Response("timeout", { status: 504 })).fetchImpl }))).code).toBe("busy");
      expect((await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(new Response("too large", { status: 413 })).fetchImpl }))).code).toBe("bad-request");
    });
  });

  describe("réseau", () => {
    it("pas de connexion : « offline »", async () => {
      const error = await failureOf(sendPhoto(IMAGE, { fetchImpl: fakeFetch(new TypeError("Failed to fetch")).fetchImpl }));
      expect(error.code).toBe("offline");
    });

    it("attente trop longue : « busy », et l'envoi est interrompu", async () => {
      const { fetchImpl, calls } = fakeFetch(hanging);
      const error = await failureOf(sendPhoto(IMAGE, { fetchImpl, timeoutMs: 30 }));
      expect(error.code).toBe("busy");
      expect((calls[0].init.signal as AbortSignal).aborted).toBe(true);
    });

    it("annulée par l'utilisateur : l'interruption est relancée telle quelle (pas une erreur de lecture)", async () => {
      const controller = new AbortController();
      const { fetchImpl } = fakeFetch(hanging);
      const pending = sendPhoto(IMAGE, { fetchImpl, signal: controller.signal });
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    });

    it("déjà annulée avant l'envoi : rien n'est envoyé", async () => {
      const controller = new AbortController();
      controller.abort();
      const { fetchImpl, calls } = fakeFetch(hanging);
      await expect(sendPhoto(IMAGE, { fetchImpl, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
      expect(calls).toHaveLength(0);
    });
  });
});

describe("fitWithin", () => {
  it("réduit en gardant les proportions", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("n'agrandit jamais", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(2000, 2000, 2000)).toEqual({ width: 2000, height: 2000 });
  });

  it("garde au moins un pixel", () => {
    expect(fitWithin(10000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });
});

describe("messages d'erreur", () => {
  const codes: PhotoErrorCode[] = [
    "not-configured",
    "forbidden",
    "bad-request",
    "bad-key",
    "quota",
    "busy",
    "no-table",
    "too-big",
    "unreadable",
    "offline",
    "upstream",
  ];

  it("chaque erreur a un message en français qui dit quoi faire", () => {
    for (const code of codes) {
      const text = describePhotoError(new PhotoError(code, ""));
      expect(text.length).toBeGreaterThan(20);
      expect(text).toMatch(/[a-zé]/i);
    }
  });

  it("une erreur inconnue donne le message général", () => {
    expect(describePhotoError(new Error("boom"))).toBe(describePhotoError(new PhotoError("upstream", "")));
    expect(describePhotoError("texte")).toBe(describePhotoError(new PhotoError("upstream", "")));
  });

  it("aucun tableau : reprend l'explication de la lecture et ajoute les conseils de cadrage", () => {
    const text = describePhotoError(new PhotoError("no-table", "La photo est trop floue."));
    expect(text).toContain("La photo est trop floue.");
    expect(text).toMatch(/cadrez/i);
    expect(describePhotoError(new PhotoError("no-table", ""))).toMatch(/pas de tableau/i);
  });

  it("propose un fichier Excel ou CSV quand la photo ne peut pas marcher aujourd'hui", () => {
    for (const code of ["not-configured", "quota", "offline", "bad-key"] as const) {
      expect(describePhotoError(new PhotoError(code, ""))).toMatch(/Excel ou CSV/);
    }
  });

  it("ne montre jamais le message technique du serveur pour les erreurs autres que « aucun tableau »", () => {
    expect(describePhotoError(new PhotoError("upstream", "stack trace interne"))).not.toContain("stack trace");
  });

  it("isPhotoErrorCode ne reconnaît que les vrais codes", () => {
    for (const code of codes) expect(isPhotoErrorCode(code)).toBe(true);
    for (const value of ["", "constructor", "toString", "__proto__", 3, null, undefined, {}]) expect(isPhotoErrorCode(value)).toBe(false);
  });
});
