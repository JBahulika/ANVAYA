/** Browser Web Speech helpers for Speak → Analyze → Speak */

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal?: boolean }
  >;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export function speechSupported(): {
  recognition: boolean;
  synthesis: boolean;
} {
  if (typeof window === "undefined") {
    return { recognition: false, synthesis: false };
  }
  return {
    recognition: Boolean(
      window.SpeechRecognition || window.webkitSpeechRecognition
    ),
    synthesis: "speechSynthesis" in window,
  };
}

/**
 * Call from a tap so iOS / Chrome allow later spoken results.
 * Only warms up the engine — does NOT queue+cancel an utterance. Rapidly
 * calling speak() then cancel() is a known trigger for Chrome's speech
 * engine to wedge silently for the rest of the page's life.
 */
export function unlockSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const synth = window.speechSynthesis;
    void synth.getVoices();
    synth.resume();
  } catch {
    // ignore
  }
}

/** Pronounce the brand as one word — TTS spells all-caps names letter by letter. */
export function forSpeech(text: string): string {
  return text.replace(/\bANVAYA\b/gi, "Ahnvayah");
}

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const pool = english.length ? english : voices;
  // Local (on-device) voices start instantly and work offline. Network voices
  // (e.g. Chrome's "Google US English") can take over a second to start or
  // silently fail without a stable connection — avoid them as the default.
  return (
    pool.find((v) => v.localService && v.lang === "en-US") ||
    pool.find((v) => v.localService) ||
    pool.find((v) => v.lang === "en-US") ||
    pool[0] ||
    null
  );
}

function ensureVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }
    const synth = window.speechSynthesis;
    if (synth.getVoices().length > 0) {
      resolve();
      return;
    }
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      resolve();
    };
    synth.addEventListener("voiceschanged", done);
    // Fallback if voiceschanged never fires
    window.setTimeout(done, 400);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type SpeakOutcome = "started" | "silent" | "done";

/**
 * Queue one utterance and wait for it to actually finish. Gives the engine
 * generous time to start (network voices can take a while) before giving up.
 */
function speakOnce(
  text: string,
  rate: number,
  assignVoice: boolean
): Promise<{ outcome: SpeakOutcome; error?: string }> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.lang = "en-US";
    utterance.volume = 1;
    if (assignVoice) {
      const voice = pickEnglishVoice();
      if (voice) utterance.voice = voice;
    }

    let settled = false;
    let started = false;
    let lastError: string | undefined;
    let resumeTick: number | null = null;

    const finish = (reason: SpeakOutcome) => {
      if (settled) return;
      settled = true;
      if (resumeTick) window.clearInterval(resumeTick);
      resolve({ outcome: reason, error: lastError });
    };

    utterance.onstart = () => {
      started = true;
    };
    utterance.onend = () => finish(started ? "done" : "silent");
    utterance.onerror = (event) => {
      lastError = (event as unknown as { error?: string })?.error;
      finish(started ? "done" : "silent");
    };

    synth.speak(utterance);

    // Chrome's real bug: it can silently pause a long utterance mid-way
    // (roughly every ~15s). Nudge it back only if it is actually speaking.
    resumeTick = window.setInterval(() => {
      if (settled) {
        if (resumeTick) window.clearInterval(resumeTick);
        return;
      }
      try {
        if (synth.speaking && synth.paused) synth.resume();
      } catch {
        // ignore
      }
    }, 3000);

    // Safety net only — generous, so a slow-starting (e.g. network) voice
    // is not mistaken for silence and cut off mid-start.
    window.setTimeout(() => {
      if (!settled) finish(started || synth.speaking ? "done" : "silent");
    }, Math.max(6000, text.length * 110));
  });
}

export function speak(text: string, rate = 0.95): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      resolve();
      return;
    }

    const trimmed = forSpeech(text).trim();
    if (!trimmed) {
      resolve();
      return;
    }

    const synth = window.speechSynthesis;

    void (async () => {
      await ensureVoices();

      // Clear anything already queued so this utterance is next, but do not
      // cancel-then-immediately-speak in the same tick (wedges Chrome).
      try {
        if (synth.speaking || synth.pending) synth.cancel();
      } catch {
        // ignore
      }
      if (synth.speaking || synth.pending) {
        await delay(60);
      }
      try {
        synth.resume();
      } catch {
        // ignore
      }

      const first = await speakOnce(trimmed, rate, true);
      // One retry, only if the first genuinely never started — try without a
      // pinned voice in case the chosen voice itself is unavailable.
      if (first.outcome === "silent") {
        await speakOnce(trimmed, rate, false);
      }
      resolve();
    })();
  });
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

export function listenOnce(lang = "en-US"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Speech recognition requires a browser."));
      return;
    }

    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      reject(
        new Error(
          "Speech recognition is not supported in this browser. Try Chrome."
        )
      );
      return;
    }

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    let settled = false;
    let transcript = "";
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      resolve(value);
    };

    recognition.onresult = (event) => {
      let next = "";
      for (let i = 0; i < event.results.length; i += 1) {
        next += event.results[i]?.[0]?.transcript || "";
      }
      transcript = next.trim();
      // Prefer final results; still keep interim so onend is not empty.
      const last = event.results[event.results.length - 1];
      if (last && last.isFinal && transcript) {
        finish(transcript);
      }
    };
    recognition.onerror = (event) => {
      if (settled) return;
      // Silence / cancel are normal — return whatever we heard
      if (event.error === "no-speech" || event.error === "aborted") {
        finish(transcript);
        return;
      }
      settled = true;
      reject(new Error(`Microphone listening failed: ${event.error}`));
    };
    // Chrome often fires onend before/without a settled onresult — never wipe a
    // transcript we already collected (that caused false “didn’t hear you”).
    recognition.onend = () => {
      finish(transcript);
    };

    try {
      recognition.start();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Could not start mic."));
    }
  });
}

export type ContinuousListenHandlers = {
  onTranscript: (transcript: string) => void;
  onError?: (message: string) => void;
  onListeningChange?: (listening: boolean) => void;
};

const MAX_NETWORK_RETRIES = 3;

/**
 * Restarting speech recognition loop for a Talk session.
 * Call pause() while TTS speaks so the mic does not hear ANVAYA.
 */
export class ContinuousListenSession {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private paused = false;
  /** Blocks onend from immediately restarting (used during network backoff). */
  private suppressAutoRestart = false;
  private networkFailures = 0;
  private lang: string;
  private handlers: ContinuousListenHandlers;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(handlers: ContinuousListenHandlers, lang = "en-US") {
    this.handlers = handlers;
    this.lang = lang;
  }

  get isActive(): boolean {
    return this.active;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    if (typeof window === "undefined") {
      this.handlers.onError?.("Speech recognition requires a browser.");
      return;
    }
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
      this.handlers.onError?.(
        "Speech recognition is not supported. Try Chrome, then tap Talk."
      );
      return;
    }

    this.stopInternal(false);
    this.active = true;
    this.paused = false;
    this.suppressAutoRestart = false;
    this.networkFailures = 0;
    this.bindRecognition();
    this.tryStart();
  }

  /** Pause recognition while TTS is speaking. */
  pause(): void {
    this.paused = true;
    this.suppressAutoRestart = true;
    this.clearRestart();
    this.abortRecognition();
    this.handlers.onListeningChange?.(false);
  }

  /** Resume listening after TTS ends (if session still active). */
  resume(): void {
    if (!this.active) return;
    this.paused = false;
    this.suppressAutoRestart = false;
    this.bindRecognition();
    this.scheduleRestart(300);
  }

  stop(): void {
    this.stopInternal(true);
  }

  private bindRecognition(): void {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) return;

    this.abortRecognition();
    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = this.lang;

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex] ?? event.results[0];
      const transcript = result?.[0]?.transcript?.trim() || "";
      if (transcript && this.active && !this.paused) {
        this.networkFailures = 0;
        this.handlers.onTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      const err = event.error;
      if (err === "aborted" || err === "no-speech") {
        return;
      }
      if (err === "not-allowed") {
        this.failAndStop(
          "Microphone permission denied. Allow the mic, then tap Talk again."
        );
        return;
      }
      if (err === "network" || err === "service-not-allowed") {
        this.handleNetworkError();
        return;
      }
      this.failAndStop(`Microphone listening failed: ${err}`);
    };

    recognition.onend = () => {
      this.handlers.onListeningChange?.(false);
      if (!this.active || this.paused || this.suppressAutoRestart) return;
      this.scheduleRestart();
    };
  }

  private handleNetworkError(): void {
    this.networkFailures += 1;
    this.suppressAutoRestart = true;
    this.clearRestart();
    this.handlers.onListeningChange?.(false);

    if (!this.active || this.paused) return;

    if (this.networkFailures >= MAX_NETWORK_RETRIES) {
      this.failAndStop(
        "Speech service unavailable. Try Chrome with a stable connection, then tap Talk again."
      );
      return;
    }

    const delayMs = 800 * this.networkFailures;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active || this.paused) return;
      this.suppressAutoRestart = false;
      this.bindRecognition();
      this.tryStart();
    }, delayMs);
  }

  private failAndStop(message: string): void {
    this.active = false;
    this.suppressAutoRestart = true;
    this.clearRestart();
    this.abortRecognition();
    this.handlers.onListeningChange?.(false);
    this.handlers.onError?.(message);
  }

  private abortRecognition(): void {
    try {
      this.recognition?.abort();
    } catch {
      try {
        this.recognition?.stop();
      } catch {
        // ignore
      }
    }
  }

  private stopInternal(notify: boolean): void {
    this.active = false;
    this.paused = false;
    this.suppressAutoRestart = true;
    this.networkFailures = 0;
    this.clearRestart();
    this.abortRecognition();
    this.recognition = null;
    if (notify) {
      this.handlers.onListeningChange?.(false);
    }
  }

  private clearRestart(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private scheduleRestart(delayMs = 280): void {
    this.clearRestart();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active || this.paused || this.suppressAutoRestart) return;
      this.tryStart();
    }, delayMs);
  }

  private tryStart(): void {
    if (!this.recognition || !this.active || this.paused) return;
    try {
      this.recognition.start();
      this.handlers.onListeningChange?.(true);
    } catch {
      this.scheduleRestart(500);
    }
  }
}
