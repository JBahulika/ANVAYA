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
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
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

export function speak(text: string, rate = 0.95): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      reject(new Error("Speech synthesis is not available in this browser."));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
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

    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() || "";
      resolve(transcript);
    };
    recognition.onerror = (event) => {
      reject(new Error(`Microphone listening failed: ${event.error}`));
    };
    recognition.onend = () => {
      // If no result fired, resolve empty so UI can recover
    };

    try {
      recognition.start();
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Could not start mic."));
    }
  });
}
