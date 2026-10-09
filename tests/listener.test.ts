import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Listener,
  type ListenerHandlers,
  type ListenerStatus,
  type RecognitionConstructor,
  type RecognitionEventLike,
  type RecognitionLike,
  type RecognitionResultLike,
} from "@/lib/voice/listener";

class FakeRecognition implements RecognitionLike {
  static instances: FakeRecognition[] = [];
  static failNextStart = false;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onresult: ((event: RecognitionEventLike) => void) | null = null;
  started = false;
  aborted = false;

  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {
    if (FakeRecognition.failNextStart) {
      FakeRecognition.failNextStart = false;
      throw new Error("InvalidStateError");
    }
    this.started = true;
  }
  stop() {
    this.started = false;
  }
  abort() {
    this.started = false;
    this.aborted = true;
  }
  // — pilotage depuis les tests —
  fireStart() {
    this.onstart?.();
  }
  fireEnd() {
    this.onend?.();
  }
  fireError(error: string) {
    this.onerror?.({ error });
  }
  fireResults(resultIndex: number, ...results: RecognitionResultLike[]) {
    this.onresult?.({ resultIndex, results: results as unknown as RecognitionEventLike["results"] });
  }
}

function result(isFinal: boolean, ...alternatives: string[]): RecognitionResultLike {
  return Object.assign(
    alternatives.map((transcript) => ({ transcript, confidence: 0.9 })),
    { isFinal },
  ) as unknown as RecognitionResultLike;
}

const Ctor = FakeRecognition as unknown as RecognitionConstructor;
const current = () => FakeRecognition.instances[FakeRecognition.instances.length - 1];

let heard: [string, boolean][];
let candidates: string[][];
let handlers: ListenerHandlers;

beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  FakeRecognition.failNextStart = false;
  heard = [];
  candidates = [];
  handlers = {
    onHeard: (text, isFinal) => heard.push([text, isFinal]),
    onCandidates: (c) => candidates.push(c),
  };
});

afterEach(() => {
  vi.useRealTimers();
});

function started(options = {}): Listener {
  const listener = new Listener(Ctor, handlers, options);
  listener.setWanted(true);
  current().fireStart();
  return listener;
}

describe("Listener : démarrage et arrêt", () => {
  it("signale « unsupported » quand le navigateur ne sait pas écouter", () => {
    const listener = new Listener(null, handlers);
    expect(listener.status).toBe("unsupported");
    listener.setWanted(true);
    expect(listener.status).toBe("unsupported");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("reste éteint tant qu'on ne le demande pas", () => {
    const listener = new Listener(Ctor, handlers);
    expect(listener.status).toBe("off");
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("écoute en français, en continu, avec des résultats provisoires et des alternatives", () => {
    const listener = new Listener(Ctor, handlers);
    listener.setWanted(true);
    expect(listener.status).toBe("starting");
    const rec = current();
    expect(rec).toMatchObject({ lang: "fr-FR", continuous: true, interimResults: true, maxAlternatives: 3, started: true });
    rec.fireStart();
    expect(listener.status).toBe("listening");
  });

  it("s'arrête proprement quand on coupe le micro", () => {
    const listener = started();
    const rec = current();
    listener.setWanted(false);
    expect(rec.aborted).toBe(true);
    expect(listener.status).toBe("off");
  });

  it("prévient les abonnés à chaque changement d'état, et seulement quand il change", () => {
    const listener = new Listener(Ctor, handlers);
    const seen: ListenerStatus[] = [];
    listener.subscribe((s) => seen.push(s));
    listener.setWanted(true);
    current().fireStart();
    listener.setWanted(true); // déjà actif : rien
    listener.setWanted(false);
    expect(seen).toEqual(["starting", "listening", "off"]);
  });
});

describe("Listener : ce que l'on entend", () => {
  it("transmet un résultat final avec toutes ses alternatives", () => {
    started();
    current().fireResults(0, result(true, "suivant", "suivante", "sui vent"));
    expect(heard).toEqual([["suivant", true]]);
    expect(candidates).toEqual([["suivant", "suivante", "sui vent"]]);
  });

  it("n'agit sur un résultat provisoire que s'il reste inchangé pendant le délai de stabilité", () => {
    started({ stableMs: 450 });
    current().fireResults(0, result(false, "suivant"));
    expect(heard).toEqual([["suivant", false]]);
    vi.advanceTimersByTime(449);
    expect(candidates).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(candidates).toEqual([["suivant"]]);
  });

  it("repart de zéro si le texte provisoire change (« suivant la route » n'est pas « suivant »)", () => {
    started({ stableMs: 450 });
    current().fireResults(0, result(false, "suivant"));
    vi.advanceTimersByTime(300);
    current().fireResults(0, result(false, "suivant la route"));
    vi.advanceTimersByTime(300);
    expect(candidates).toEqual([]);
    vi.advanceTimersByTime(150);
    expect(candidates).toEqual([["suivant la route"]]);
  });

  it("un résultat final remplace le provisoire sans le doubler", () => {
    started({ stableMs: 450 });
    current().fireResults(0, result(false, "pause"));
    vi.advanceTimersByTime(200);
    current().fireResults(0, result(true, "pause"));
    vi.advanceTimersByTime(2000);
    expect(candidates).toEqual([["pause"]]);
  });

  it("ne traite que les résultats nouveaux d'une écoute continue", () => {
    started();
    current().fireResults(0, result(true, "suivant"));
    // La liste contient désormais deux résultats, mais seul celui d'indice 1 est nouveau :
    // « suivant » (indice 0) ne doit pas être traité une deuxième fois.
    current().fireResults(1, result(true, "suivant"), result(true, "pause"));
    expect(candidates).toEqual([["suivant"], ["pause"]]);
  });

  it("ignore les résultats vides", () => {
    started();
    current().fireResults(0, result(true, "  "));
    expect(heard).toEqual([]);
    expect(candidates).toEqual([]);
  });
});

describe("Listener : relance automatique", () => {
  it("relance l'écoute après une fin normale (silence)", () => {
    started();
    vi.advanceTimersByTime(6000);
    current().fireError("no-speech");
    current().fireEnd();
    expect(FakeRecognition.instances).toHaveLength(1);
    vi.advanceTimersByTime(250);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(current().started).toBe(true);
  });

  it("ralentit puis abandonne quand les relances échouent aussitôt", () => {
    const listener = started({ maxQuickEnds: 4 });
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      const before = FakeRecognition.instances.length;
      current().fireEnd(); // fin immédiate : échec
      let waited = 0;
      while (FakeRecognition.instances.length === before && waited < 10000 && listener.status !== "error") {
        vi.advanceTimersByTime(50);
        waited += 50;
      }
      delays.push(waited);
    }
    expect(delays.slice(0, 3)).toEqual([250, 500, 1000]);
    expect(listener.status).toBe("error");
    const count = FakeRecognition.instances.length;
    vi.advanceTimersByTime(60000);
    expect(FakeRecognition.instances).toHaveLength(count);
  });

  it("une fin immédiate compte, mais un résultat remet le compteur à zéro", () => {
    const listener = started({ maxQuickEnds: 2 });
    current().fireEnd();
    vi.advanceTimersByTime(250);
    current().fireStart();
    current().fireResults(0, result(true, "suivant"));
    current().fireEnd();
    vi.advanceTimersByTime(250);
    expect(listener.status).not.toBe("error");
    expect(FakeRecognition.instances).toHaveLength(3);
  });

  it("survit à un start() qui échoue (écoute déjà en cours dans le navigateur)", () => {
    FakeRecognition.failNextStart = true;
    const listener = new Listener(Ctor, handlers);
    expect(() => listener.setWanted(true)).not.toThrow();
    vi.advanceTimersByTime(300);
    expect(FakeRecognition.instances.length).toBeGreaterThanOrEqual(2);
    expect(current().started).toBe(true);
  });

  it("ignore les événements d'une ancienne écoute", () => {
    const listener = started();
    const old = current();
    const oldOnResult = old.onresult;
    listener.setWanted(false);
    oldOnResult?.({ resultIndex: 0, results: [result(true, "suivant")] as unknown as RecognitionEventLike["results"] });
    expect(candidates).toEqual([]);
  });
});

describe("Listener : erreurs", () => {
  it("refus du micro : état « denied », pas d'insistance, nouvelle tentative possible", () => {
    const listener = started();
    current().fireError("not-allowed");
    expect(listener.status).toBe("denied");
    vi.advanceTimersByTime(60000);
    expect(FakeRecognition.instances).toHaveLength(1);
    listener.retry();
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(listener.status).toBe("starting");
  });

  it("service non autorisé (iPhone, appli installée) : état « unavailable », sans insister", () => {
    const listener = started();
    current().fireError("service-not-allowed");
    expect(listener.status).toBe("unavailable");
    vi.advanceTimersByTime(60000);
    expect(FakeRecognition.instances).toHaveLength(1);
  });

  it("aucun micro : état « no-mic »", () => {
    const listener = started();
    current().fireError("audio-capture");
    expect(listener.status).toBe("no-mic");
  });

  it("réseau : état « network » puis abandon après plusieurs échecs", () => {
    const listener = started();
    current().fireError("network");
    expect(listener.status).toBe("network");
    for (let i = 0; i < 3; i++) {
      current().fireEnd();
      vi.advanceTimersByTime(6000);
      current().fireError("network");
    }
    expect(listener.status).toBe("network");
    expect(FakeRecognition.instances.length).toBeLessThanOrEqual(4);
  });

  it("« no-speech » et « aborted » ne sont pas des erreurs", () => {
    const listener = started();
    current().fireError("no-speech");
    current().fireError("aborted");
    expect(listener.status).toBe("listening");
  });

  it("changer de demande (micro coupé puis rallumé) repart d'une situation propre", () => {
    const listener = started();
    current().fireError("not-allowed");
    listener.setWanted(false);
    listener.setWanted(true);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(listener.status).toBe("starting");
  });
});

describe("Listener : l'appli parle, le micro se tait", () => {
  it("suspend l'écoute pendant la parole puis la reprend après un court délai", () => {
    const listener = started({ resumeDelayMs: 350 });
    const first = current();
    listener.setSuspended(true);
    expect(first.aborted).toBe(true);
    expect(listener.status).toBe("suspended");

    listener.setSuspended(false);
    expect(listener.status).toBe("suspended"); // on attend la fin de l'écho
    expect(FakeRecognition.instances).toHaveLength(1);
    vi.advanceTimersByTime(349);
    expect(FakeRecognition.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeRecognition.instances).toHaveLength(2);
    expect(listener.status).toBe("starting");
  });

  it("si l'appli reparle pendant le délai, l'écoute ne redémarre pas", () => {
    const listener = started({ resumeDelayMs: 350 });
    listener.setSuspended(true);
    listener.setSuspended(false);
    vi.advanceTimersByTime(200);
    listener.setSuspended(true);
    vi.advanceTimersByTime(1000);
    expect(FakeRecognition.instances).toHaveLength(1);
    expect(listener.status).toBe("suspended");
  });

  it("ne réagit pas à un résultat provisoire en attente quand l'écoute est suspendue", () => {
    const listener = started({ stableMs: 450 });
    current().fireResults(0, result(false, "suivant"));
    listener.setSuspended(true);
    vi.advanceTimersByTime(2000);
    expect(candidates).toEqual([]);
  });
});

describe("Listener : fin de vie", () => {
  it("destroy() arrête tout définitivement", () => {
    const listener = started();
    const rec = current();
    listener.destroy();
    expect(rec.aborted).toBe(true);
    listener.setWanted(false);
    listener.setWanted(true);
    vi.advanceTimersByTime(10000);
    expect(FakeRecognition.instances).toHaveLength(1);
  });
});
