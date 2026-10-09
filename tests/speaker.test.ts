import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speaker } from "@/lib/voice/speaker";

interface FakeUtterance {
  text: string;
  lang: string;
  rate: number;
  volume: number;
  voice: SpeechSynthesisVoice | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
}

function voice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, voiceURI: `uri:${name}`, default: false, localService: true } as SpeechSynthesisVoice;
}

class FakeSynth {
  spoken: FakeUtterance[] = [];
  cancels = 0;
  voices: SpeechSynthesisVoice[] = [];
  listeners = new Map<string, () => void>();
  speak(utterance: FakeUtterance) {
    this.spoken.push(utterance);
  }
  cancel() {
    this.cancels++;
  }
  getVoices() {
    return this.voices;
  }
  addEventListener(type: string, callback: () => void) {
    this.listeners.set(type, callback);
  }
}

const makeUtterance = (text: string) =>
  ({ text, lang: "", rate: 1, volume: 1, voice: null, onstart: null, onend: null, onerror: null }) as unknown as SpeechSynthesisUtterance;

let synth: FakeSynth;
let speaker: Speaker;
const asSynth = () => synth as unknown as SpeechSynthesis;
const last = () => synth.spoken[synth.spoken.length - 1];
const OPTIONS = { rate: 1, voiceURI: null };

beforeEach(() => {
  vi.useFakeTimers();
  synth = new FakeSynth();
  synth.voices = [voice("Thomas", "fr-FR"), voice("Chloé", "fr_CA"), voice("Alex", "en-US"), voice("Jorge", "es-ES")];
  speaker = new Speaker(asSynth(), makeUtterance);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Speaker", () => {
  it("n'est pas disponible sans speechSynthesis, mais ne plante pas", () => {
    const silent = new Speaker(null, makeUtterance);
    const done = vi.fn();
    expect(silent.supported).toBe(false);
    silent.speak("bonjour", OPTIONS, done);
    expect(done).toHaveBeenCalledTimes(1);
    expect(silent.speaking).toBe(false);
    expect(() => silent.cancel()).not.toThrow();
    expect(() => silent.unlock()).not.toThrow();
  });

  it("dit la phrase en français, à la vitesse demandée, après un court instant", () => {
    const done = vi.fn();
    speaker.speak("38 yaourt nature 0,5 litre", { rate: 1.2, voiceURI: null }, done);
    expect(speaker.speaking).toBe(true);
    expect(synth.spoken).toHaveLength(0);
    vi.advanceTimersByTime(60);
    expect(last()).toMatchObject({ text: "38 yaourt nature 0,5 litre", lang: "fr-FR", rate: 1.2 });
    expect(done).not.toHaveBeenCalled();
    last().onend?.();
    expect(speaker.speaking).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("une nouvelle phrase coupe la précédente, dont la fin n'est plus signalée", () => {
    const first = vi.fn();
    const second = vi.fn();
    speaker.speak("un", OPTIONS, first);
    vi.advanceTimersByTime(60);
    const firstUtterance = last();
    speaker.speak("deux", OPTIONS, second);
    firstUtterance.onerror?.({ error: "interrupted" });
    firstUtterance.onend?.();
    vi.advanceTimersByTime(60);
    expect(last().text).toBe("deux");
    expect(first).not.toHaveBeenCalled();
    expect(speaker.speaking).toBe(true);
    last().onend?.();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancel() coupe la parole sans rappeler le callback", () => {
    const done = vi.fn();
    speaker.speak("un", OPTIONS, done);
    vi.advanceTimersByTime(60);
    const utterance = last();
    speaker.cancel();
    utterance.onend?.();
    expect(speaker.speaking).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });

  it("annule une phrase pas encore commencée", () => {
    speaker.speak("un", OPTIONS);
    speaker.cancel();
    vi.advanceTimersByTime(500);
    expect(synth.spoken).toHaveLength(0);
  });

  it("borne la vitesse de la voix", () => {
    speaker.speak("a", { rate: 9, voiceURI: null });
    vi.advanceTimersByTime(60);
    expect(last().rate).toBe(2);
    speaker.speak("b", { rate: 0.1, voiceURI: null });
    vi.advanceTimersByTime(60);
    expect(last().rate).toBe(0.5);
  });

  it("ne propose que les voix françaises, y compris celles notées fr_CA", () => {
    expect(speaker.frenchVoices.map((v) => v.name)).toEqual(["Thomas", "Chloé"]);
  });

  it("utilise la voix choisie, et ignore une voix devenue introuvable", () => {
    speaker.speak("a", { rate: 1, voiceURI: "uri:Chloé" });
    vi.advanceTimersByTime(60);
    expect(last().voice?.name).toBe("Chloé");
    expect(last().lang).toBe("fr_CA");
    speaker.speak("b", { rate: 1, voiceURI: "uri:Inconnue" });
    vi.advanceTimersByTime(60);
    expect(last().voice).toBeNull();
    expect(last().lang).toBe("fr-FR");
  });

  it("met la liste des voix à jour quand le navigateur en signale de nouvelles", () => {
    const empty = new FakeSynth();
    const late = new Speaker(empty as unknown as SpeechSynthesis, makeUtterance);
    const seen = vi.fn();
    late.subscribe(seen);
    expect(late.frenchVoices).toEqual([]);
    empty.voices = [voice("Thomas", "fr-FR")];
    empty.listeners.get("voiceschanged")?.();
    expect(late.frenchVoices.map((v) => v.name)).toEqual(["Thomas"]);
    expect(seen).toHaveBeenCalled();
  });

  it("repère un refus du navigateur (pas de geste de l'utilisateur) puis s'en remet", () => {
    const done = vi.fn();
    speaker.speak("a", OPTIONS, done);
    vi.advanceTimersByTime(60);
    last().onerror?.({ error: "not-allowed" });
    expect(speaker.blocked).toBe(true);
    expect(speaker.speaking).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);

    speaker.unlock();
    expect(speaker.blocked).toBe(false);
    expect(last()).toMatchObject({ text: " ", volume: 0 });

    speaker.speak("b", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onerror?.({ error: "not-allowed" });
    expect(speaker.blocked).toBe(true);
    speaker.speak("c", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onstart?.();
    expect(speaker.blocked).toBe(false);
  });

  it("une coupure volontaire (canceled / interrupted) n'est pas un blocage", () => {
    speaker.speak("a", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onerror?.({ error: "canceled" });
    expect(speaker.blocked).toBe(false);
    expect(speaker.speaking).toBe(false);
  });

  it("ne reste jamais « en train de parler » si le navigateur oublie de signaler la fin", () => {
    const done = vi.fn();
    speaker.speak("une phrase", OPTIONS, done);
    vi.advanceTimersByTime(60);
    expect(speaker.speaking).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(speaker.speaking).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("un texte vide ne dit rien mais termine tout de suite", () => {
    const done = vi.fn();
    speaker.speak("   ", OPTIONS, done);
    vi.advanceTimersByTime(500);
    expect(synth.spoken).toHaveLength(0);
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe("Speaker : quand la voix ne peut pas parler", () => {
  const speakAndFail = (error: string) => {
    speaker.speak("une phrase", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onerror?.({ error });
  };

  it("signale l'absence de voix française, puis s'en remet dès qu'une phrase est dite", () => {
    expect(speaker.problem).toBeNull();
    speakAndFail("language-unavailable");
    expect(speaker.problem).toBe("no-voice");
    expect(speaker.speaking).toBe(false);
    speaker.speak("une autre", OPTIONS);
    vi.advanceTimersByTime(60);
    expect(speaker.problem).toBe("no-voice"); // tant que rien n'a été dit
    last().onstart?.();
    expect(speaker.problem).toBeNull();
  });

  it("distingue l'absence de voix, une voix qui a besoin d'Internet et les autres pannes", () => {
    for (const error of ["language-unavailable", "voice-unavailable", "synthesis-unavailable"]) {
      speakAndFail(error);
      expect(speaker.problem, error).toBe("no-voice");
    }
    speakAndFail("network");
    expect(speaker.problem).toBe("network");
    for (const error of ["synthesis-failed", "audio-busy", "audio-hardware", "text-too-long", "invalid-argument"]) {
      speakAndFail(error);
      expect(speaker.problem, error).toBe("failed");
    }
  });

  it("une coupure volontaire, ou un refus faute d'avoir touché l'écran, n'est pas une panne", () => {
    for (const error of ["canceled", "interrupted", "not-allowed"]) {
      speakAndFail(error);
      expect(speaker.problem, error).toBeNull();
    }
    expect(speaker.blocked).toBe(true);
  });

  it("une phrase qui ne démarre jamais est une panne ; une phrase démarrée qui oublie de finir n'en est pas une", () => {
    const done = vi.fn();
    speaker.speak("une phrase", OPTIONS, done);
    vi.advanceTimersByTime(60);
    vi.advanceTimersByTime(10000);
    expect(speaker.problem).toBe("failed");
    expect(done).toHaveBeenCalledTimes(1);

    speaker.speak("une autre", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onstart?.();
    vi.advanceTimersByTime(10000);
    expect(speaker.speaking).toBe(false);
    expect(speaker.problem).toBeNull();
  });

  it("prévient les abonnés quand la panne apparaît et quand elle disparaît", () => {
    const seen = vi.fn();
    speaker.subscribe(seen);
    speakAndFail("synthesis-failed");
    const afterFailure = seen.mock.calls.length;
    speaker.speak("ok", OPTIONS);
    vi.advanceTimersByTime(60);
    last().onstart?.();
    expect(seen.mock.calls.length).toBeGreaterThan(afterFailure);
    expect(speaker.problem).toBeNull();
  });
});
