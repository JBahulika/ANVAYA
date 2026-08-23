"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraCapture, type CameraHandle } from "@/components/CameraCapture";
import { ResultPanel } from "@/components/ResultPanel";
import {
  analyzeImage,
  checkHealth,
  spokenAnswer,
  type AnalyzeMode,
  type AnalyzeResponse,
} from "@/lib/api";
import { playCaptureBeep, playShotTakenDing } from "@/lib/feedback";
import {
  listenOnce,
  speak,
  speechSupported,
  stopSpeaking,
  unlockSpeech,
} from "@/lib/speech";
import {
  agentSpokenName,
  helpSpeech,
  parseVoiceCommand,
  type VoiceAgent,
} from "@/lib/voiceCommands";

type SessionPhase =
  | "idle"
  | "listening"
  | "capturing"
  | "analyzing"
  | "speaking";

export default function HomePage() {
  const cameraRef = useRef<CameraHandle>(null);
  const resultRef = useRef<AnalyzeResponse | null>(null);
  const imageBlobRef = useRef<Blob | null>(null);
  const sessionActiveRef = useRef(false);
  const busyRef = useRef(false);
  const loopGenerationRef = useRef(0);

  const [hasSavedBill, setHasSavedBill] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [status, setStatus] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [phase, setPhase] = useState<SessionPhase>("idle");
  const [activeAgent, setActiveAgent] = useState<VoiceAgent | null>(null);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [voiceHeard, setVoiceHeard] = useState<string | null>(null);

  useEffect(() => {
    void checkHealth()
      .then((h) => setBackendReady(h.gemini_configured))
      .catch(() => setBackendReady(false));
  }, []);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    return () => {
      sessionActiveRef.current = false;
      loopGenerationRef.current += 1;
      stopSpeaking();
    };
  }, []);

  const storeImage = useCallback((blob: Blob) => {
    imageBlobRef.current = blob;
    setHasSavedBill(true);
  }, []);

  const speakAndWait = useCallback(async (text: string) => {
    if (!speechSupported().synthesis) return;
    setSpeaking(true);
    setPhase("speaking");
    setListening(false);
    try {
      await speak(text);
    } catch {
      // TTS optional
    } finally {
      setSpeaking(false);
      setPhase(sessionActiveRef.current ? "listening" : "idle");
    }
  }, []);

  const endSession = useCallback(async (farewell = true) => {
    loopGenerationRef.current += 1;
    sessionActiveRef.current = false;
    setSessionActive(false);
    setListening(false);
    busyRef.current = false;
    setPhase("idle");
    setStatus(farewell ? "Session ended" : "");
    stopSpeaking();
    cameraRef.current?.stop();
    if (farewell) {
      try {
        await speak("Okay. Session ended. Tap Talk when you need me again.");
      } catch {
        // ignore
      }
    }
  }, []);

  const runAnalyze = useCallback(
    async (
      blob: Blob,
      mode: AnalyzeMode,
      question?: string
    ): Promise<AnalyzeResponse | null> => {
      setLoading(true);
      setError(null);
      setResult(null);
      setPhase("analyzing");

      try {
        const response = await analyzeImage({
          image: blob,
          mode,
          question:
            mode === "ask" || mode === "explain" || (question && question.trim())
              ? question
              : undefined,
        });
        setResult(response);
        setStatus("Answer ready");
        return response;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        setStatus("");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const captureAndAnalyze = useCallback(
    async (mode: AnalyzeMode, agent: VoiceAgent | null, question?: string) => {
      busyRef.current = true;
      setActiveAgent(agent);
      setPhase("capturing");
      setStatus("Got it — capturing…");
      setListening(false);

      try {
        await speak("Got it. Capturing now.");
      } catch {
        // continue
      }

      try {
        const started = await cameraRef.current?.start();
        const shot = started ? await cameraRef.current?.capture() : null;
        if (!shot) {
          setError("Camera missed. Try again.");
          setStatus("Camera missed. Try again.");
          await speakAndWait(
            "Camera missed. Hold the page up and try again."
          );
          return;
        }

        playShotTakenDing();
        setPhase("analyzing");
        setStatus("Reading the page…");
        try {
          await speak("Photo taken. Reading the page now.");
        } catch {
          // continue
        }

        const response = await runAnalyze(shot.blob, mode, question);
        if (!response) {
          await speakAndWait(
            "I could not read that. Hold it up and try again."
          );
          return;
        }
        setStatus("Answer ready");
        await speakAndWait(spokenAnswer(response));
      } finally {
        busyRef.current = false;
      }
    },
    [runAnalyze, speakAndWait]
  );

  const analyzeSaved = useCallback(
    async (mode: AnalyzeMode, agent: VoiceAgent | null, question?: string) => {
      const blob = imageBlobRef.current;
      if (!blob) {
        await speakAndWait(
          "I do not have a photo yet. Hold a page up and ask again."
        );
        return;
      }

      busyRef.current = true;
      setActiveAgent(agent);
      setListening(false);
      setPhase("analyzing");
      setStatus("Got it — working on your question…");

      try {
        await speak("Got it. Working on your question.");
      } catch {
        // continue
      }

      try {
        const response = await runAnalyze(blob, mode, question);
        if (!response) {
          await speakAndWait(
            "I could not answer from that photo. Hold it up and ask again."
          );
          return;
        }
        setStatus("Answer ready");
        await speakAndWait(spokenAnswer(response));
      } finally {
        busyRef.current = false;
      }
    },
    [runAnalyze, speakAndWait]
  );

  const handleCommand = useCallback(
    async (transcript: string) => {
      setVoiceHeard(transcript);
      const cmd = parseVoiceCommand(transcript);

      if (cmd.action === "stop") {
        await endSession(true);
        return;
      }

      if (cmd.action === "help") {
        setStatus("Help");
        await speakAndWait(helpSpeech());
        return;
      }

      if (cmd.action === "repeat") {
        const last = resultRef.current;
        if (!last) {
          await speakAndWait("Nothing yet. Hold up a page and ask what it is.");
          return;
        }
        setStatus("Repeating");
        await speakAndWait(spokenAnswer(last));
        return;
      }

      if (cmd.action === "capture" && cmd.mode && cmd.agent) {
        if (cmd.agent === "ask" && !cmd.question?.trim()) {
          await speakAndWait(
            "Ask what? For example: how many items, or what is the amount due?"
          );
          return;
        }

        const canReuse =
          Boolean(imageBlobRef.current) &&
          !cmd.forceNewCapture &&
          (cmd.reuseSavedImage ||
            cmd.mode === "ask" ||
            cmd.mode === "simplify" ||
            cmd.mode === "explain");

        if (canReuse) {
          await analyzeSaved(cmd.mode, cmd.agent, cmd.question);
          return;
        }

        await captureAndAnalyze(cmd.mode, cmd.agent, cmd.question);
        return;
      }

      await speakAndWait(
        imageBlobRef.current
          ? "Ask another question, or say new bill for a different page."
          : "Just tell me what you need. For example, what is this?"
      );
    },
    [analyzeSaved, captureAndAnalyze, endSession, speakAndWait]
  );

  const runListenLoop = useCallback(
    async (generation: number) => {
      while (
        sessionActiveRef.current &&
        loopGenerationRef.current === generation
      ) {
        if (busyRef.current) {
          await new Promise((r) => setTimeout(r, 200));
          continue;
        }

        setPhase("listening");
        setStatus(
          imageBlobRef.current
            ? "Listening — ask anything about this page"
            : "Listening — say what you need"
        );
        setListening(true);
        playCaptureBeep();

        let transcript = "";
        try {
          transcript = await listenOnce();
        } catch (err) {
          setListening(false);
          if (
            !sessionActiveRef.current ||
            loopGenerationRef.current !== generation
          ) {
            return;
          }
          setError(err instanceof Error ? err.message : "Microphone failed.");
          await speakAndWait(
            "Mic failed. Allow microphone access, then tap Talk again."
          );
          await endSession(false);
          return;
        }

        setListening(false);

        if (
          !sessionActiveRef.current ||
          loopGenerationRef.current !== generation
        ) {
          return;
        }

        if (!transcript.trim()) {
          await speakAndWait(
            imageBlobRef.current
              ? "I didn't hear you. Ask a question, or say new bill."
              : "I didn't hear you. Hold the page up and ask again."
          );
          continue;
        }

        await handleCommand(transcript);
      }
    },
    [endSession, handleCommand, speakAndWait]
  );

  const startTalkSession = useCallback(async () => {
    if (sessionActiveRef.current) {
      await endSession(true);
      return;
    }

    if (!speechSupported().recognition) {
      setError("Speech recognition not available. Try Chrome.");
      void speak("Speech is not available in this browser. Try Chrome.");
      return;
    }

    // Unlock TTS in the same tap as Talk. Speak a short line before any await
    // so Chrome keeps speech allowed after the camera permission dialog.
    unlockSpeech();
    busyRef.current = false;
    setError(null);
    setVoiceHeard(null);
    setActiveAgent("reader");

    const generation = loopGenerationRef.current + 1;
    loopGenerationRef.current = generation;
    sessionActiveRef.current = true;
    setSessionActive(true);
    setPhase("speaking");
    setSpeaking(true);
    setStatus("Starting camera…");
    try {
      await speak("Okay. Starting the camera.");
    } catch {
      // continue even if TTS fails
    } finally {
      setSpeaking(false);
    }

    if (
      !sessionActiveRef.current ||
      loopGenerationRef.current !== generation
    ) {
      return;
    }

    const cameraOn = (await cameraRef.current?.start()) ?? false;
    if (!cameraOn) {
      setError("Camera did not start. Allow camera access, then tap Talk.");
      await speakAndWait(
        "I could not start the camera. Allow camera access, then tap Talk again."
      );
      await endSession(false);
      return;
    }

    if (
      !sessionActiveRef.current ||
      loopGenerationRef.current !== generation
    ) {
      return;
    }

    // Brief settle so the camera stream does not mute the first TTS line.
    await new Promise((r) => setTimeout(r, 300));

    // Camera is on — speak the full opening instructions, then listen.
    const opening = imageBlobRef.current
      ? "Camera is on. Hold a page up if you need a new photo, or ask about the last one. " +
        "After the beep, say what you need — for example, what is this, how much is due, or how many items. " +
        "Say new bill for a different page. Say okay bye or stop when you are done."
      : "Camera is on. Hold your bill or document in front of the camera. " +
        "After the beep, say what you need — for example, what is this, how much is due, or how many items. " +
        "I will capture it, read it, and speak the answer. Say okay bye or stop when you are done.";

    setSpeaking(true);
    setStatus("Instructions…");
    try {
      await speak(opening);
    } catch {
      // continue even if TTS fails
    } finally {
      setSpeaking(false);
    }

    if (
      !sessionActiveRef.current ||
      loopGenerationRef.current !== generation
    ) {
      return;
    }

    void runListenLoop(generation);
  }, [endSession, runListenLoop, speakAndWait]);

  const phaseLabel = (() => {
    if (phase === "listening") {
      return hasSavedBill
        ? "ANVAYA is listening — the last page is still here"
        : "ANVAYA is listening";
    }
    if (phase === "capturing") return "ANVAYA is taking the photo";
    if (phase === "analyzing") return "ANVAYA is reading the page";
    if (phase === "speaking") return "ANVAYA is speaking";
    return hasSavedBill
      ? "Ask a follow-up about the last page — ANVAYA will guide you through it."
      : "Tap Talk and show a bill or document — ANVAYA will read it out loud.";
  })();

  return (
    <main className="shell">
      <header className="topbar">
        <p className="wordmark">ANVAYA</p>
      </header>

      {backendReady === false && (
        <p className="banner" role="status">
          Backend offline or missing GEMINI_API_KEY. Start FastAPI and add your
          key to backend/.env
        </p>
      )}

      <div className="workspace">
        <p className="session-status" role="status" aria-live="polite">
          {sessionActive
            ? `${phaseLabel}${activeAgent ? ` · ${agentSpokenName(activeAgent)}` : ""}`
            : phaseLabel}
        </p>

        <CameraCapture ref={cameraRef} onCapture={storeImage} />

        <button
          type="button"
          className={`btn btn-talk${sessionActive ? " is-active" : ""}`}
          onClick={() => void startTalkSession()}
          disabled={loading && !sessionActive}
          aria-pressed={sessionActive}
          aria-describedby="trust-line talk-hint"
          aria-label={
            sessionActive ? "Stop listening" : "Talk — give a voice command"
          }
        >
          {sessionActive
            ? listening
              ? "Listening… (tap to stop)"
              : "Talk on (tap to stop)"
            : "Talk"}
        </button>

        <ol id="talk-hint" className="talk-hint">
          <li>
            <strong>Show</strong> — hold the bill or page in front of the camera.
          </li>
          <li>
            <strong>Ask</strong> — tap Talk and say what you need: “what is
            this?”, “how much is due?”, “how many items?”
          </li>
          <li>
            <strong>Hear</strong> — ANVAYA captures the page and reads it back
            to you.
          </li>
        </ol>

        {voiceHeard && (
          <p className="voice-confirm" role="status">
            Heard: {voiceHeard}
          </p>
        )}

        <ResultPanel
          result={result}
          loading={loading || phase === "analyzing" || phase === "capturing"}
          error={error}
          status={status}
          speaking={speaking}
          onReplay={() => {
            unlockSpeech();
            if (result) void speakAndWait(spokenAnswer(result));
          }}
          onStop={() => {
            stopSpeaking();
            setSpeaking(false);
            if (sessionActiveRef.current) setPhase("listening");
          }}
        />
      </div>

      <footer className="safety-footer">
        <p id="trust-line">
          Photo is processed and not stored. Not medical, legal, or financial
          advice.
        </p>
        <details className="about">
          <summary className="about-pop">About ANVAYA</summary>
          <div className="about-body">
            <p>
              ANVAYA began with a simple question: if you cannot see the page in
              your hand, or the room in front of you, what do you need to know
              first? This project is built to help people who are blind or have
              low vision understand their surroundings through the camera —
              starting with bills, letters, labels, and other printed pages, then
              speaking the answer clearly.
            </p>
            <p>
              It is still an MVP. It is made with care, and it will keep
              receiving updates. The long-term aim is a calm, trustworthy guide
              — not a dump of every object in a photo.
            </p>
            <p>
              Contributors who believe they can make ANVAYA kinder or more
              useful are welcome. Reach out at{" "}
              <a href="mailto:jbahulika@gmail.com">jbahulika@gmail.com</a>.
            </p>
            <div className="about-maker">
              <p className="about-maker-title">About the maker</p>
              <p>Built by J. Bahulika.</p>
            </div>
          </div>
        </details>
        <nav className="socials" aria-label="Maker profiles">
          <a
            className="social-btn"
            href="https://www.linkedin.com/in/j-bahulika-8b8237207"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="J. Bahulika on LinkedIn"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8.5h4V24h-4V8.5zM8.5 8.5h3.8v2.1h.05c.53-1 1.84-2.1 3.79-2.1 4.05 0 4.8 2.67 4.8 6.14V24h-4v-7.7c0-1.84-.03-4.2-2.56-4.2-2.56 0-2.95 2-2.95 4.06V24h-4V8.5z"
              />
            </svg>
          </a>
          <a
            className="social-btn"
            href="https://github.com/JBahulika"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="J. Bahulika on GitHub"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 2.87-.39c.97 0 1.95.13 2.87.39 2.18-1.49 3.14-1.18 3.14-1.18.63 1.58.24 2.75.12 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14 0 1.54-.01 2.79-.01 3.17 0 .31.21.67.8.56A10.51 10.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"
              />
            </svg>
          </a>
        </nav>
      </footer>
    </main>
  );
}
