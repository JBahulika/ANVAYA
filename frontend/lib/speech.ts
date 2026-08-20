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

/** Call from a tap so iOS will allow later spoken results. */
export function unlockSpeech(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(" ");
  utterance.volume = 0;
  window.speechSynthesis.speak(utterance);
}

export function speak(text: string, rate = 0.95): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new Error("Speech synthesis is not available in this browser."));
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.rate = rate;
    utterance.lang = "en-US";
    utterance.onend = () => resolve();
    utterance.onerror = () =>
      reject(new Error("Could not play the spoken response."));
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
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
    recognition.interimResults = false;
    recognition.lang = lang;

    let settled = false;
    const finish = (value: string) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    recognition.onresult = (event) => {
      finish(event.results[0]?.[0]?.transcript?.trim() || "");
    };
    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      reject(new Error(`Microphone listening failed: ${event.error}`));
    };
    recognition.onend = () => {
      finish("");
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

/**
 * Restarting speech recognition loop for a Talk session.
 * Call pause() while TTS speaks so the mic does not hear ANVAYA.
 */
export class ContinuousListenSession {
  private recognition: SpeechRecognitionLike | null = null;
  private active = false;
  private paused = false;
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
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      this.handlers.onError?.(
        "Speech recognition is not supported. Try Chrome, then tap Talk to ANVAYA."
      );
      return;
    }

    this.stopInternal(false);
    this.active = true;
    this.paused = false;

    const recognition = new Ctor();
    this.recognition = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = this.lang;

    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex] ?? event.results[0];
      const transcript = result?.[0]?.transcript?.trim() || "";
      if (transcript && this.active && !this.paused) {
        this.handlers.onTranscript(transcript);
      }
    };

    recognition.onerror = (event) => {
      const err = event.error;
      if (err === "aborted" || err === "no-speech") {
        return;
      }
      if (err === "not-allowed") {
        this.active = false;
        this.handlers.onListeningChange?.(false);
        this.handlers.onError?.(
          "Microphone permission denied. Allow the mic, or use Capture & hear."
        );
        return;
      }
      this.handlers.onError?.(`Microphone listening failed: ${err}`);
    };

    recognition.onend = () => {
      this.handlers.onListeningChange?.(false);
      if (!this.active || this.paused) return;
      this.scheduleRestart();
    };

    this.tryStart();
  }

  /** Pause recognition while TTS is speaking. */
  pause(): void {
    this.paused = true;
    this.clearRestart();
    try {
      this.recognition?.abort();
    } catch {
      try {
        this.recognition?.stop();
      } catch {
        // ignore
      }
    }
    this.handlers.onListeningChange?.(false);
  }

  /** Resume listening after TTS ends (if session still active). */
  resume(): void {
    if (!this.active) return;
    this.paused = false;
    this.scheduleRestart(250);
  }

  stop(): void {
    this.stopInternal(true);
  }

  private stopInternal(notify: boolean): void {
    this.active = false;
    this.paused = false;
    this.clearRestart();
    try {
      this.recognition?.abort();
    } catch {
      try {
        this.recognition?.stop();
      } catch {
        // ignore
      }
    }
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

  private scheduleRestart(delayMs = 180): void {
    this.clearRestart();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.active || this.paused) return;
      this.tryStart();
    }, delayMs);
  }

  private tryStart(): void {
    if (!this.recognition || !this.active || this.paused) return;
    try {
      this.recognition.start();
      this.handlers.onListeningChange?.(true);
    } catch {
      this.scheduleRestart(400);
    }
  }
}
