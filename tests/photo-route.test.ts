import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/lire-photo/route";
import { PHOTO_LIMITS } from "@/lib/photo/types";
import { sparseAnswer } from "./helpers";

const KEY = "cle-secrete-de-test-0123456789";
const CODE = "frisonnes-2026";
const URL_OF_SITE = "https://prepa.example/api/lire-photo";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

const ROWS = [["Clients", "Yaourt", "Fromage"], ["Alice", "3", "2"]];
const TABLE = sparseAnswer(ROWS, [[1, 1]]);
const gemini = (content: unknown = TABLE) =>
  Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }] });
const geminiError = (status: number) => Response.json({ error: { message: "erreur" } }, { status });

let googleFetch: ReturnType<typeof vi.fn>;
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", KEY);
  vi.stubEnv("PHOTO_ACCESS_CODE", "");
  vi.stubEnv("GEMINI_MODEL", "m1,m2");
  googleFetch = vi.fn(async () => gemini());
  vi.stubGlobal("fetch", googleFetch);
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function send(body: BodyInit | null = JPEG as BodyInit, headers: Record<string, string> = {}) {
  return POST(new Request(URL_OF_SITE, { method: "POST", body, headers }));
}

async function json(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("/api/lire-photo : état (GET)", () => {
  it("indique que la lecture est prête quand la clé est installée", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ available: true, needsCode: false });
  });

  it("indique qu'elle n'est pas prête sans clé (une clé vide ou faite d'espaces compte pour rien)", async () => {
    for (const value of ["", "   "]) {
      vi.stubEnv("GEMINI_API_KEY", value);
      expect(await json(await GET())).toEqual({ available: false, needsCode: false });
    }
  });

  it("indique qu'un code d'accès est demandé, sans jamais le dévoiler", async () => {
    vi.stubEnv("PHOTO_ACCESS_CODE", CODE);
    const response = await GET();
    expect(await json(response)).toEqual({ available: true, needsCode: true });
    expect(JSON.stringify(await (await GET()).text())).not.toContain(CODE);
  });

  it("ne demande pas de code quand la lecture n'est pas prête", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("PHOTO_ACCESS_CODE", CODE);
    expect(await json(await GET())).toEqual({ available: false, needsCode: false });
  });

  it("n'est jamais gardé en mémoire par le navigateur", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });
});

describe("/api/lire-photo : lire une photo (POST)", () => {
  it("renvoie le tableau lu", async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await json(response)).toEqual({
      rows: ROWS,
      uncertain: [[1, 1]],
      message: null,
      model: "m1",
    });
  });

  it("envoie à Gemini la photo reçue, avec la clé, et les modèles de GEMINI_MODEL", async () => {
    await send(PNG as BodyInit);
    expect(googleFetch).toHaveBeenCalledTimes(1);
    const [url, init] = googleFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/models/m1:generateContent");
    expect(url).not.toContain(KEY);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(KEY);
    const part = JSON.parse(String(init.body)).contents[0].parts[1].inline_data;
    expect(part).toEqual({ mime_type: "image/png", data: Buffer.from(PNG).toString("base64") });
  });

  it.each([
    ["JPEG", JPEG, "image/jpeg"],
    ["PNG", PNG, "image/png"],
    ["WebP", WEBP, "image/webp"],
  ])("reconnaît une photo %s à ses premiers octets, quel que soit l'en-tête annoncé", async (_name, bytes, mime) => {
    const response = await send(bytes as BodyInit, { "content-type": "text/plain" });
    expect(response.status).toBe(200);
    const [, init] = googleFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body)).contents[0].parts[1].inline_data.mime_type).toBe(mime);
  });

  describe("réglages et accès", () => {
    it("sans clé installée : 503 « not-configured », rien n'est envoyé à Google", async () => {
      vi.stubEnv("GEMINI_API_KEY", "");
      const response = await send();
      expect(response.status).toBe(503);
      expect((await json(response)).error).toBe("not-configured");
      expect(googleFetch).not.toHaveBeenCalled();
    });

    it("refuse une demande venue d'un autre site", async () => {
      const foreign: Record<string, string>[] = [{ "sec-fetch-site": "cross-site" }, { origin: "https://autre-site.example" }, { origin: "pas une adresse" }];
      for (const headers of foreign) {
        const response = await send(JPEG as BodyInit, headers);
        expect(response.status).toBe(403);
        expect((await json(response)).error).toBe("forbidden");
      }
      expect(googleFetch).not.toHaveBeenCalled();
    });

    it("accepte une demande venue de ce site", async () => {
      const local: Record<string, string>[] = [{ origin: "https://prepa.example" }, { "sec-fetch-site": "same-origin" }, {}];
      for (const headers of local) {
        expect((await send(JPEG as BodyInit, headers)).status).toBe(200);
      }
    });

    it("avec un code d'accès : refuse l'absence de code ou un faux code, sans appeler Google", async () => {
      vi.stubEnv("PHOTO_ACCESS_CODE", CODE);
      const wrong: Record<string, string>[] = [{}, { "x-access-code": "" }, { "x-access-code": "faux" }, { "x-access-code": CODE + "x" }, { "x-access-code": CODE.slice(1) }];
      for (const headers of wrong) {
        const response = await send(JPEG as BodyInit, headers);
        expect(response.status).toBe(403);
        expect((await json(response)).error).toBe("forbidden");
      }
      expect(googleFetch).not.toHaveBeenCalled();
    });

    it("avec un code d'accès : accepte le bon", async () => {
      vi.stubEnv("PHOTO_ACCESS_CODE", CODE);
      expect((await send(JPEG as BodyInit, { "x-access-code": CODE })).status).toBe(200);
    });
  });

  describe("la photo reçue", () => {
    it("refuse l'absence de photo", async () => {
      const response = await send(null);
      expect(response.status).toBe(400);
      expect((await json(response)).error).toBe("bad-request");
    });

    it("refuse ce qui n'est pas une photo (PDF, texte, tableur…)", async () => {
      for (const bytes of [new TextEncoder().encode("%PDF-1.7 ..."), new TextEncoder().encode("Nom;A;B\n1;2;3"), new Uint8Array([0x50, 0x4b, 3, 4])]) {
        const response = await send(bytes as BodyInit, { "content-type": "image/jpeg" });
        expect(response.status).toBe(400);
      }
      expect(googleFetch).not.toHaveBeenCalled();
    });

    it("refuse une photo trop lourde, annoncée ou réelle", async () => {
      const announced = await send(JPEG as BodyInit, { "content-length": String(PHOTO_LIMITS.maxBytes + 1) });
      expect(announced.status).toBe(400);
      const heavy = new Uint8Array(PHOTO_LIMITS.maxBytes + 1);
      heavy.set(JPEG);
      expect((await send(heavy as BodyInit)).status).toBe(400);
      expect(googleFetch).not.toHaveBeenCalled();
    });

    it("accepte une photo qui fait exactement le poids maximal", async () => {
      const exact = new Uint8Array(PHOTO_LIMITS.maxBytes);
      exact.set(JPEG);
      expect((await send(exact as BodyInit)).status).toBe(200);
    });
  });

  describe("quand la lecture échoue", () => {
    it.each([
      ["quota atteint", [429, 429], 429, "quota"],
      ["Google saturé", [503, 503], 503, "busy"],
      ["clé refusée", [403], 502, "bad-key"],
      ["photo refusée par Google", [400], 400, "bad-request"],
    ])("%s", async (_name, statuses, status, code) => {
      let call = 0;
      googleFetch.mockImplementation(async () => geminiError(statuses[Math.min(call++, statuses.length - 1)]));
      const response = await send();
      expect(response.status).toBe(status);
      expect((await json(response)).error).toBe(code);
    });

    it("pas de tableau sur la photo : 422 avec le message de la lecture", async () => {
      googleFetch.mockImplementation(async () => gemini({ rows: [], message: "Je ne vois qu'un paysage." }));
      const response = await send();
      expect(response.status).toBe(422);
      expect(await json(response)).toEqual({ error: "no-table", message: "Je ne vois qu'un paysage." });
    });

    it("réponse de Google inutilisable : 502", async () => {
      googleFetch.mockImplementation(async () => Response.json({ candidates: [{ content: { parts: [{ text: "pas du JSON" }] } }] }));
      const response = await send();
      expect(response.status).toBe(502);
      expect((await json(response)).error).toBe("unreadable");
    });

    it("erreur inattendue : 502, sans détail technique", async () => {
      googleFetch.mockImplementation(async () => {
        throw new RangeError(`explosion avec ${KEY}`);
      });
      const response = await send();
      expect(response.status).toBe(502);
      expect(JSON.stringify(await json(response))).not.toContain(KEY);
    });

    it("ne laisse jamais la clé ni le code d'accès dans la réponse ni dans les journaux", async () => {
      vi.stubEnv("PHOTO_ACCESS_CODE", CODE);
      googleFetch.mockImplementation(async () => geminiError(503));
      const response = await send(JPEG as BodyInit, { "x-access-code": CODE });
      expect(response.status).toBe(503);
      const everything = JSON.stringify([await response.text(), consoleError.mock.calls]);
      expect(everything).not.toContain(KEY);
      expect(everything).not.toContain(CODE);
      expect(consoleError).toHaveBeenCalled(); // le détail va bien dans les journaux du serveur
    });
  });
});
