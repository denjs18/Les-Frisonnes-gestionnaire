import { describe, expect, it, vi } from "vitest";
import { buildRequest, DEFAULT_MODELS, parseModelList, readTableFromPhoto } from "@/lib/photo/gemini";
import { PhotoError } from "@/lib/photo/types";
import { sparseAnswer } from "./helpers";

const KEY = "cle-secrete-de-test-0123456789";
const IMAGE = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const ROWS = [["Clients", "Yaourt", "Fromage"], ["Alice", "3", "2"]];
/** Ce que Gemini répond : le tableau en forme « creuse », avec la case Alice / Yaourt jugée douteuse. */
const TABLE = sparseAnswer(ROWS, [[1, 1]]);

/** Un événement de la réponse en continu de Gemini : le texte de la réponse, en un ou plusieurs morceaux. */
const event = (...texts: string[]) => `data: ${JSON.stringify({ candidates: [{ content: { parts: texts.map((text) => ({ text })) } }] })}\r\n\r\n`;
const textOf = (content: unknown) => (typeof content === "string" ? content : JSON.stringify(content));

/** Ce que Gemini renvoie quand tout va bien : toute la réponse dans un seul événement. */
const answer = (content: unknown = TABLE) =>
  new Response(event(textOf(content)), { status: 200, headers: { "Content-Type": "text/event-stream" } });

/**
 * Une réponse livrée par morceaux d'octets, chacun après son délai (ms) : les morceaux peuvent couper un événement n'importe où.
 * `end: false` : la connexion reste ouverte sans rien envoyer de plus (un modèle qui se tait après avoir commencé).
 */
function streamed(pieces: { text: string; after?: number }[], end = true): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const { text, after = 0 } of pieces) {
        if (after > 0) await new Promise((resolve) => setTimeout(resolve, after));
        controller.enqueue(encoder.encode(text));
      }
      if (end) controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const fail = (status: number, message = "erreur") => Response.json({ error: { code: status, message } }, { status });

interface Call {
  url: string;
  headers: Record<string, string>;
  body: { contents: { parts: Record<string, unknown>[] }[]; generationConfig: Record<string, unknown> };
}

/** Un faux `fetch` qui répond dans l'ordre et note ce qu'on lui a demandé. */
function fakeFetch(...replies: (Response | Error | (() => Response | Promise<Response>))[]) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)),
    });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next.clone();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

async function failureOf(promise: Promise<unknown>): Promise<PhotoError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PhotoError);
    return error as PhotoError;
  }
  throw new Error("La lecture aurait dû échouer.");
}

const read = (fetchImpl: typeof fetch, extra: Partial<Parameters<typeof readTableFromPhoto>[2]> = {}) =>
  readTableFromPhoto(IMAGE, "image/jpeg", { apiKey: KEY, models: ["m1", "m2", "m3"], fetchImpl, ...extra });

describe("lecture d'une photo par Gemini", () => {
  describe("la demande", () => {
    it("envoie la consigne, la photo en base64 et demande un résultat JSON strict, avec peu de réflexion", async () => {
      const { fetchImpl, calls } = fakeFetch(answer());
      await read(fetchImpl);
      expect(calls).toHaveLength(1);
      const [{ body }] = calls;
      const parts = body.contents[0].parts;
      expect(typeof parts[0].text).toBe("string");
      expect(parts[1]).toEqual({ inline_data: { mime_type: "image/jpeg", data: Buffer.from(IMAGE).toString("base64") } });
      expect(body.generationConfig).toMatchObject({
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: "low" },
      });
      expect(body.generationConfig.responseSchema).toBeTruthy();
    });

    it("met la clé dans un en-tête, jamais dans l'adresse", async () => {
      const { fetchImpl, calls } = fakeFetch(answer());
      await read(fetchImpl);
      expect(calls[0].headers["x-goog-api-key"]).toBe(KEY);
      expect(calls[0].url).not.toContain(KEY);
      expect(calls[0].url).toBe("https://generativelanguage.googleapis.com/v1beta/models/m1:streamGenerateContent?alt=sse");
    });

    it("buildRequest : sans le réglage de réflexion quand on le retire", () => {
      expect(buildRequest("AAA", "image/png", false).generationConfig).not.toHaveProperty("thinkingConfig");
    });
  });

  describe("la réponse", () => {
    it("renvoie le tableau lu, les cases douteuses et le modèle qui a répondu", async () => {
      const { fetchImpl } = fakeFetch(answer());
      expect(await read(fetchImpl)).toEqual({
        rows: [["Clients", "Yaourt", "Fromage"], ["Alice", "3", "2"]],
        uncertain: [[1, 1]],
        message: null,
        model: "m1",
      });
    });

    it("recolle une réponse découpée en plusieurs événements", async () => {
      const text = JSON.stringify(TABLE);
      const response = new Response(event(text.slice(0, 10)) + event(text.slice(10, 40)) + event(text.slice(40)), { status: 200 });
      expect((await read(fakeFetch(response).fetchImpl)).rows).toEqual(ROWS);
    });

    it("aucune réponse de Gemini : « unreadable » (après avoir laissé sa chance aux autres modèles)", async () => {
      const { fetchImpl, calls } = fakeFetch(new Response("data: " + JSON.stringify({ candidates: [] }) + "\r\n\r\n", { status: 200 }));
      expect((await failureOf(read(fetchImpl))).code).toBe("unreadable");
      expect(calls).toHaveLength(3);
    });

    it("réponse qui n'est pas du JSON : « unreadable » (après avoir laissé sa chance aux autres modèles)", async () => {
      const { fetchImpl, calls } = fakeFetch(answer("Voici votre tableau : …"));
      expect((await failureOf(read(fetchImpl))).code).toBe("unreadable");
      expect(calls).toHaveLength(3);
    });

    it("réponse inutilisable d'un modèle mais pas du suivant : la lecture réussit", async () => {
      const { fetchImpl } = fakeFetch(answer("Voici votre tableau : …"), answer({ columns: [], rows: "abc" }), answer());
      expect((await read(fetchImpl)).model).toBe("m3");
    });

    it("photo sans tableau : « no-table », sans essayer d'autres modèles", async () => {
      const { fetchImpl, calls } = fakeFetch(answer({ rows: [], message: "C'est une photo de vache." }));
      const error = await failureOf(read(fetchImpl));
      expect(error.code).toBe("no-table");
      expect(error.message).toBe("C'est une photo de vache.");
      expect(calls).toHaveLength(1);
    });
  });

  describe("passer d'un modèle à l'autre", () => {
    it("modèle saturé (503) : essaie le suivant", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(503, "high demand"), answer());
      const result = await read(fetchImpl);
      expect(result.model).toBe("m2");
      expect(calls.map((call) => call.url.match(/models\/([^:]+):/)?.[1])).toEqual(["m1", "m2"]);
    });

    it("quota atteint (429) : essaie le suivant", async () => {
      const { fetchImpl } = fakeFetch(fail(429, "quota"), fail(429, "quota"), answer());
      expect((await read(fetchImpl)).model).toBe("m3");
    });

    it("modèle retiré (404) : essaie le suivant", async () => {
      const { fetchImpl } = fakeFetch(fail(404, "model not found"), answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });

    it("pas de réponse du tout (réseau) : essaie le suivant", async () => {
      const { fetchImpl } = fakeFetch(new TypeError("fetch failed"), answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });

    it("trop lent (délai dépassé) : essaie le suivant", async () => {
      const timeout = Object.assign(new Error("délai"), { name: "TimeoutError" });
      const { fetchImpl } = fakeFetch(timeout, answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });

    it("quota atteint partout : « quota »", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(429));
      expect((await failureOf(read(fetchImpl))).code).toBe("quota");
      expect(calls).toHaveLength(3);
    });

    it("quota et modèles retirés : « quota »", async () => {
      const { fetchImpl } = fakeFetch(fail(404), fail(429), fail(404));
      expect((await failureOf(read(fetchImpl))).code).toBe("quota");
    });

    it("saturé partout : « busy »", async () => {
      const { fetchImpl } = fakeFetch(fail(503));
      expect((await failureOf(read(fetchImpl))).code).toBe("busy");
    });

    it("saturé et quota atteint : « busy » (réessayer peut marcher)", async () => {
      const { fetchImpl } = fakeFetch(fail(429), fail(503), fail(429));
      expect((await failureOf(read(fetchImpl))).code).toBe("busy");
    });

    it("erreur de Google ailleurs (500 est « busy », réseau est « upstream »)", async () => {
      expect((await failureOf(read(fakeFetch(fail(500)).fetchImpl))).code).toBe("busy");
      expect((await failureOf(read(fakeFetch(new TypeError("fetch failed")).fetchImpl))).code).toBe("upstream");
    });

    it("l'erreur garde le détail pour les journaux du serveur, sans la clé", async () => {
      const { fetchImpl } = fakeFetch(fail(503, `ma clé est ${KEY}`), fail(429), fail(404));
      const error = await failureOf(read(fetchImpl));
      expect(error.detail).toContain("m1");
      expect(error.detail).toContain("m3");
      expect(error.detail).not.toContain(KEY);
      expect(error.message).not.toContain(KEY);
    });
  });

  describe("erreurs qui arrêtent tout", () => {
    it.each([401, 403])("clé refusée (%i) : « bad-key » tout de suite", async (status) => {
      const { fetchImpl, calls } = fakeFetch(fail(status, "refus"));
      const error = await failureOf(read(fetchImpl));
      expect(error.code).toBe("bad-key");
      expect(error.message).not.toContain(KEY);
      expect(calls).toHaveLength(1);
    });

    it("400 « API key not valid » : « bad-key »", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(400, "API key not valid. Please pass a valid API key."));
      expect((await failureOf(read(fetchImpl))).code).toBe("bad-key");
      expect(calls).toHaveLength(1);
    });

    it("autre 400 (photo refusée) : un deuxième modèle essaie, puis « bad-request » sans gaspiller les autres", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(400, "Unable to process input image."));
      expect((await failureOf(read(fetchImpl))).code).toBe("bad-request");
      expect(calls).toHaveLength(2); // il y a trois modèles dans le test : le troisième n'est pas sollicité
    });

    it("un modèle qui refuse la demande alors que le suivant l'accepte : la lecture réussit", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(400, "Invalid JSON payload received. Unknown name propertyOrdering"), answer());
      const result = await read(fetchImpl);
      expect(result.model).toBe("m2");
      expect(calls).toHaveLength(2);
    });
  });

  describe("réglage de réflexion", () => {
    it("un modèle qui ne le connaît pas : on redemande au même modèle, sans ce réglage", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(400, "Thinking level is not supported for this model."), answer());
      const result = await read(fetchImpl);
      expect(result.model).toBe("m1");
      expect(calls).toHaveLength(2);
      expect(calls[0].body.generationConfig).toHaveProperty("thinkingConfig");
      expect(calls[1].body.generationConfig).not.toHaveProperty("thinkingConfig");
      expect(calls[1].url).toBe(calls[0].url);
    });

    it("s'il le refuse aussi sans ce réglage : on passe au modèle suivant", async () => {
      const { fetchImpl, calls } = fakeFetch(fail(400, "thinking"), fail(503), answer());
      const result = await read(fetchImpl);
      expect(result.model).toBe("m2");
      expect(calls).toHaveLength(3);
    });
  });

  describe("durée", () => {
    it("n'essaie plus de modèle quand le temps total est écoulé", async () => {
      let time = 0;
      const { fetchImpl, calls } = fakeFetch(() => {
        time += 30_000; // chaque essai « dure » 30 s
        return fail(503);
      });
      const error = await failureOf(read(fetchImpl, { now: () => time, budgetMs: 52_000 }));
      expect(error.code).toBe("busy");
      expect(calls).toHaveLength(2); // 0 s, 30 s ; à 60 s il ne reste plus rien
    });

    it("coupe un essai qui ne répond pas, puis passe au modèle suivant", async () => {
      let calls = 0;
      // Comme le vrai fetch : ne répond jamais, et échoue dès que son délai (ou la durée restante) est écoulé.
      const hanging = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        calls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason));
        });
      }) as unknown as typeof fetch;
      const started = Date.now();
      const error = await failureOf(read(hanging, { firstByteMs: 30 }));
      expect(error.code).toBe("busy");
      expect(calls).toBe(3); // un essai par modèle, chacun coupé au bout de 30 ms
      expect(Date.now() - started).toBeLessThan(2_000);
    });

    it("aucun essai possible (budget nul) : « busy »", async () => {
      const { fetchImpl, calls } = fakeFetch(answer());
      expect((await failureOf(read(fetchImpl, { budgetMs: 0 }))).code).toBe("busy");
      expect(calls).toHaveLength(0);
    });
  });

  describe("réponse en continu", () => {
    const text = JSON.stringify(TABLE);
    const whole = event(text);

    it("accepte des morceaux d'octets qui coupent un événement n'importe où (y compris au milieu d'un mot accentué)", async () => {
      const bytes = new TextEncoder().encode(event(JSON.stringify(sparseAnswer([["Clients", "Café", "Crème"], ["Éric", "3", "2"]]))));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          // morceaux de 7 octets : coupe les accents, les guillemets et la ligne vide finale
          for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7));
          controller.close();
        },
      });
      const result = await read(fakeFetch(new Response(stream, { status: 200 })).fetchImpl);
      expect(result.rows).toEqual([["Clients", "Café", "Crème"], ["Éric", "3", "2"]]);
    });

    it("accepte la fin de ligne Unix comme la fin de ligne Windows, et un dernier événement sans ligne vide", async () => {
      const unix = `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: text.slice(0, 20) }] } }] })}\n\ndata: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: text.slice(20) }] } }] })}`;
      expect((await read(fakeFetch(new Response(unix, { status: 200 })).fetchImpl)).rows).toEqual(ROWS);
    });

    it("ignore ce qui n'est pas de la réponse : résumés de réflexion, lignes de commentaire, « [DONE] »", async () => {
      const chunk = JSON.stringify({ candidates: [{ content: { parts: [{ text: "Je regarde la photo…", thought: true }, { text }] } }] });
      const response = new Response(`: ping\r\n\r\ndata: ${chunk}\r\n\r\ndata: [DONE]\r\n\r\n`, { status: 200 });
      expect((await read(fakeFetch(response).fetchImpl)).rows).toEqual(ROWS);
    });

    it("un modèle muet est abandonné au bout du délai de premier octet, sans attendre la durée d'un essai entier", async () => {
      // Le premier modèle ne répond jamais (le vrai `fetch` échoue quand on l'interrompt) ; le second répond tout de suite.
      const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).includes("/m1:")) {
          return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason)));
        }
        return answer();
      }) as unknown as typeof fetch;
      const started = Date.now();
      const result = await read(fetchImpl, { firstByteMs: 40, attemptMs: 5_000 });
      expect(result.model).toBe("m2");
      expect(Date.now() - started).toBeLessThan(1_000);
    });

    it("une réponse qui a commencé a jusqu'à la fin de l'essai pour arriver, même si elle dépasse le délai de premier octet", async () => {
      const slow = () => streamed([{ text: whole.slice(0, 30), after: 10 }, { text: whole.slice(30), after: 150 }]);
      const result = await read(fakeFetch(slow).fetchImpl, { firstByteMs: 60, attemptMs: 2_000 });
      expect(result.model).toBe("m1");
      expect(result.rows).toEqual(ROWS);
    });

    it("une réponse qui s'arrête en route est abandonnée à la fin de l'essai : le modèle suivant prend le relais", async () => {
      const stalled = () => streamed([{ text: whole.slice(0, 30) }], false);
      const { fetchImpl, calls } = fakeFetch(stalled, answer());
      const result = await read(fetchImpl, { firstByteMs: 500, attemptMs: 120 });
      expect(result.model).toBe("m2");
      expect(calls).toHaveLength(2);
    });

    it("une erreur annoncée en cours de route compte comme celle d'un en-tête (ici : quota atteint)", async () => {
      const errorEvent = `data: ${JSON.stringify({ error: { code: 429, message: "quota" } })}\r\n\r\n`;
      const { fetchImpl } = fakeFetch(new Response(errorEvent, { status: 200 }), answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });

    it("une clé refusée annoncée en cours de route arrête tout", async () => {
      const errorEvent = `data: ${JSON.stringify({ error: { code: 403, message: "forbidden" } })}\r\n\r\n`;
      const { fetchImpl, calls } = fakeFetch(new Response(errorEvent, { status: 200 }), answer());
      expect((await failureOf(read(fetchImpl))).code).toBe("bad-key");
      expect(calls).toHaveLength(1);
    });

    it("un événement qui n'est pas du JSON est un échec de ce modèle", async () => {
      const { fetchImpl } = fakeFetch(new Response("data: {pas du json\r\n\r\n", { status: 200 }), answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });

    it("pas de corps de réponse : échec de ce modèle, le suivant essaie", async () => {
      const { fetchImpl } = fakeFetch(new Response(null, { status: 200 }), answer());
      expect((await read(fetchImpl)).model).toBe("m2");
    });
  });

  describe("liste de modèles", () => {
    it("par défaut : la liste du projet, de la plus fiable au secours (l'alias tenu à jour par Google en dernier)", () => {
      expect(parseModelList(undefined)).toEqual(DEFAULT_MODELS);
      expect(parseModelList("")).toEqual(DEFAULT_MODELS);
      expect(DEFAULT_MODELS.length).toBeGreaterThan(2);
      expect(DEFAULT_MODELS[0]).toBe("gemini-3.7-flash");
      expect(DEFAULT_MODELS.at(-1)).toBe("gemini-flash-latest");
      expect(new Set(DEFAULT_MODELS).size).toBe(DEFAULT_MODELS.length);
    });

    it("GEMINI_MODEL remplace la liste (séparée par des virgules)", () => {
      expect(parseModelList("gemini-3.7-flash, gemini-3.5-flash")).toEqual(["gemini-3.7-flash", "gemini-3.5-flash"]);
    });

    it("ignore les noms qui ne ressemblent pas à un modèle (pas d'injection dans l'adresse)", () => {
      expect(parseModelList("../../evil, ok-model?x=1 ,good.model-1")).toEqual(["good.model-1"]);
      expect(parseModelList("a/b")).toEqual(DEFAULT_MODELS);
    });
  });
});
