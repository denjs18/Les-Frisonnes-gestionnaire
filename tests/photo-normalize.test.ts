import { describe, expect, it } from "vitest";
import { normalizePhotoTable } from "@/lib/photo/normalize";
import { PHOTO_LIMITS, PhotoError } from "@/lib/photo/types";

const TABLE = [
  ["Clients", "Yaourt", "Fromage"],
  ["Alice", "3", "2"],
  ["Bob", "", "5"],
];

function failure(raw: unknown): PhotoError {
  try {
    normalizePhotoTable(raw);
  } catch (error) {
    expect(error).toBeInstanceOf(PhotoError);
    return error as PhotoError;
  }
  throw new Error("La lecture aurait dû être refusée.");
}

describe("lecture d'une photo : mise en forme de la réponse", () => {
  it("garde un tableau propre tel quel", () => {
    expect(normalizePhotoTable({ rows: TABLE })).toEqual({ rows: TABLE, uncertain: [], message: null });
  });

  it("nettoie les textes : espaces, nombres, valeurs absentes ou étranges", () => {
    const { rows } = normalizePhotoTable({
      rows: [
        ["  Clients ", "Yaourt\n nature", "Fromage"],
        ["Alice", 3, null],
        ["Bob", { poids: 2 }, "  5  "],
      ],
    });
    expect(rows).toEqual([
      ["Clients", "Yaourt nature", "Fromage"],
      ["Alice", "3", ""],
      ["Bob", "", "5"],
    ]);
  });

  it("coupe les textes démesurés", () => {
    const { rows } = normalizePhotoTable({ rows: [["Clients", "x".repeat(500)], ["Alice", "1"]] });
    expect(rows[0][1]).toHaveLength(PHOTO_LIMITS.maxCellLength);
  });

  it("retire les lignes vides avant et après le tableau, et décale les cases douteuses en conséquence", () => {
    const result = normalizePhotoTable({
      rows: [["", "", ""], [], ["Clients", "Yaourt", "Fromage"], ["Alice", "3", "2"], ["", "", ""]],
      uncertain: [{ row: 3, col: 1 }],
    });
    expect(result.rows).toEqual([["Clients", "Yaourt", "Fromage"], ["Alice", "3", "2"]]);
    expect(result.uncertain).toEqual([[1, 1]]);
  });

  it("complète les lignes trop courtes et retire les colonnes vides à droite", () => {
    const { rows } = normalizePhotoTable({
      rows: [["Clients", "Yaourt", "", ""], ["Alice", "3"], ["Bob", "", "", ""]],
    });
    expect(rows).toEqual([["Clients", "Yaourt"], ["Alice", "3"], ["Bob", ""]]);
  });

  it("garde une colonne vide au milieu (c'est le tableau qui décide)", () => {
    const { rows } = normalizePhotoTable({ rows: [["Clients", "", "Fromage"], ["Alice", "", "2"]] });
    expect(rows[0]).toEqual(["Clients", "", "Fromage"]);
  });

  describe("cases douteuses", () => {
    it("accepte { row, col } et [ligne, colonne], sans doublon", () => {
      const { uncertain } = normalizePhotoTable({
        rows: TABLE,
        uncertain: [{ row: 1, col: 1 }, [1, 1], [2, 2], { row: 2, col: 2 }],
      });
      expect(uncertain).toEqual([
        [1, 1],
        [2, 2],
      ]);
    });

    it("ignore ce qui n'existe pas dans le tableau", () => {
      const { uncertain } = normalizePhotoTable({
        rows: TABLE,
        uncertain: [[-1, 0], [0, -1], [3, 0], [0, 3], [1.5, 1], ["1", "1"], { row: 1 }, null, 7, "x", [1]],
      });
      expect(uncertain).toEqual([]);
    });

    it("ne plante pas si la liste n'est pas une liste", () => {
      expect(normalizePhotoTable({ rows: TABLE, uncertain: "oui" }).uncertain).toEqual([]);
      expect(normalizePhotoTable({ rows: TABLE, uncertain: { row: 1, col: 1 } }).uncertain).toEqual([]);
    });
  });

  describe("remarque", () => {
    it("est gardée, nettoyée et raccourcie", () => {
      expect(normalizePhotoTable({ rows: TABLE, message: "  Photo  un peu\nfloue " }).message).toBe("Photo un peu floue");
      expect(normalizePhotoTable({ rows: TABLE, message: "a".repeat(1000) }).message).toHaveLength(300);
    });

    it("vaut null quand elle est vide ou n'est pas un texte", () => {
      expect(normalizePhotoTable({ rows: TABLE, message: "   " }).message).toBeNull();
      expect(normalizePhotoTable({ rows: TABLE, message: 12 }).message).toBeNull();
    });
  });

  describe("réponses refusées", () => {
    it("n'est pas un objet avec des lignes : inutilisable", () => {
      for (const raw of [null, undefined, "texte", 42, [], {}, { rows: "abc" }, { rows: {} }]) {
        expect(failure(raw).code).toBe("unreadable");
      }
    });

    it("une ligne qui n'est pas une liste : inutilisable", () => {
      expect(failure({ rows: [["Clients", "A"], "Alice 3"] }).code).toBe("unreadable");
    });

    it("aucun tableau (liste vide) : « no-table » avec un message par défaut", () => {
      const error = failure({ rows: [] });
      expect(error.code).toBe("no-table");
      expect(error.message).toMatch(/pas de tableau/i);
    });

    it("aucun tableau : le message de la lecture est repris", () => {
      expect(failure({ rows: [], message: "La photo est trop floue." }).message).toBe("La photo est trop floue.");
    });

    it("une seule ligne ou une seule colonne n'est pas un tableau de commandes", () => {
      expect(failure({ rows: [["Clients", "Yaourt"]] }).code).toBe("no-table");
      expect(failure({ rows: [["Clients"], ["Alice"], ["Bob"]] }).code).toBe("no-table");
      expect(failure({ rows: [["", ""], ["", ""]] }).code).toBe("no-table");
    });

    it("trop de lignes ou de colonnes : « too-big »", () => {
      const wide = (columns: number) => Array.from({ length: columns }, (_, i) => `P${i}`);
      const tall = (count: number) => Array.from({ length: count }, (_, i) => [`C${i}`, "1"]);
      expect(failure({ rows: [wide(2), ...tall(PHOTO_LIMITS.maxRows + 1)] }).code).toBe("too-big");
      expect(failure({ rows: [wide(PHOTO_LIMITS.maxColumns + 1), wide(PHOTO_LIMITS.maxColumns + 1)] }).code).toBe("too-big");
      // Une liste absurde est refusée avant même d'être parcourue.
      expect(failure({ rows: Array.from({ length: PHOTO_LIMITS.maxRows * 2 + 1 }, () => ["a", "b"]) }).code).toBe("too-big");
    });

    it("accepte le maximum permis", () => {
      const rows = [Array.from({ length: PHOTO_LIMITS.maxColumns }, (_, i) => `P${i}`)];
      for (let i = 1; i < PHOTO_LIMITS.maxRows; i++) rows.push(rows[0].map((_, c) => (c === 0 ? `C${i}` : "1")));
      expect(normalizePhotoTable({ rows }).rows).toHaveLength(PHOTO_LIMITS.maxRows);
    });
  });
});
