"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraCapture, type CameraHandle } from "@/components/CameraCapture";
import { MoreOptions } from "@/components/MoreOptions";
import { ResultPanel } from "@/components/ResultPanel";
import {
  analyzeImage,
  checkHealth,
  spokenAnswer,
  type AnalyzeMode,
  type AnalyzeResponse,
} from "@/lib/api";
import { playCaptureBeep } from "@/lib/feedback";
import {
  ContinuousListenSession,
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
  const listenRef = useRef<ContinuousListenSession | null>(null);
  const resultRef = useRef<AnalyzeResponse | null>(null);
  const sessionActiveRef = useRef(false);
  const busyRef = useRef(false);
  const onTranscriptRef = useRef<(transcript: string) => void>(() => {});

  const [mode, setMode] = useState<AnalyzeMode>("auto");
  const [question, setQuestion] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
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
  const [voiceOk, setVoiceOk] = useState({ recognition: false, synthesis: false });
  const [voiceHeard, setVoiceHeard] = useState<string | null>(null);

  useEffect(() => {
    setVoiceOk(speechSupported());
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
      listenRef.current?.stop();
      listenRef.current = null;
      stopSpeaking();
    };
  }, []);

  const storeImage = useCallback((blob: Blob, url: string) => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setImageBlob(blob);
  }, []);

  const speakAndWait = useCallback(async (text: string) => {
    if (!speechSupported().synthesis) return;
    setSpeaking(true);
    setPhase("speaking");
    listenRef.current?.pause();
    try {
      await speak(text);
    } catch {
      // TTS optional
    } finally {
      setSpeaking(false);
      if (sessionActiveRef.current) {
        listenRef.current?.resume();
        setPhase("listening");
      } else {
        setPhase("idle");
      }
    }
  }, []);

  const endSession = useCallback(async (farewell = true) => {
    sessionActiveRef.current = false;
    setSessionActive(false);
    listenRef.current?.stop();
    listenRef.current = null;
    setListening(false);
    setPhase("idle");
    setStatus(farewell ? "Session ended" : "");
    if (farewell) {
      try {
        await speak("Okay. Session ended. Tap Talk to ANVAYA when you need me.");
      } catch {
        // ignore
      }
    }
  }, []);

  const runAnalyzeWithMode = useCallback(
    async (
      blob: Blob,
      analyzeMode: AnalyzeMode,
      analyzeQuestion?: string
    ): Promise<AnalyzeResponse | null> => {
      setLoading(true);
      setError(null);
      setResult(null);
      setPhase("analyzing");

      try {
        const response = await analyzeImage({
          image: blob,
          mode: analyzeMode,
          question:
            analyzeMode === "ask" ||
            analyzeMode === "explain" ||
            (analyzeQuestion && analyzeQuestion.trim())
              ? analyzeQuestion
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
    async (
      analyzeMode: AnalyzeMode,
      agent: VoiceAgent | null,
      analyzeQuestion?: string
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;

      const label = agent ? agentSpokenName(agent) : "ANVAYA";
      setActiveAgent(agent);
      setMode(analyzeMode);
      if (analyzeQuestion) setQuestion(analyzeQuestion);

      setPhase("capturing");
      setStatus(`${label}. Capturing.`);
      listenRef.current?.pause();
      playCaptureBeep();

      try {
        await speak(`${label}. Capturing.`);
      } catch {
        // continue
      }

      const shot = await cameraRef.current?.capture();
      if (!shot) {
        setError("Camera missed. Try again.");
        setStatus("Camera missed. Try again.");
        await speakAndWait("Camera missed. Point at the subject and try again.");
        busyRef.current = false;
        return;
      }

      storeImage(shot.blob, shot.url);
      setStatus("Analyzing.");

      const response = await runAnalyzeWithMode(
        shot.blob,
        analyzeMode,
        analyzeQuestion
      );

      if (!response) {
        await speakAndWait("Analysis failed. You can try again.");
        busyRef.current = false;
        return;
      }

      await speakAndWait(spokenAnswer(response));
      busyRef.current = false;
    },
    [runAnalyzeWithMode, speakAndWait, storeImage]
  );

  const handleVoiceTranscript = useCallback(
    async (transcript: string) => {
      if (busyRef.current || !sessionActiveRef.current) return;

      setVoiceHeard(transcript);
      const cmd = parseVoiceCommand(transcript);

      if (cmd.action === "stop") {
        busyRef.current = true;
        listenRef.current?.pause();
        await endSession(true);
        busyRef.current = false;
        return;
      }

      if (cmd.action === "help") {
        busyRef.current = true;
        setStatus("Help");
        await speakAndWait(helpSpeech());
        busyRef.current = false;
        return;
      }

      if (cmd.action === "repeat") {
        const last = resultRef.current;
        if (!last) {
          busyRef.current = true;
          await speakAndWait("Nothing to repeat yet. Say read this, or what's in front of me.");
          busyRef.current = false;
          return;
        }
        busyRef.current = true;
        setStatus("Repeating");
        await speakAndWait(spokenAnswer(last));
        busyRef.current = false;
        return;
      }

      if (cmd.action === "capture" && cmd.mode && cmd.agent) {
        if (cmd.agent === "ask" && !cmd.question?.trim()) {
          busyRef.current = true;
          await speakAndWait(
            "Ask what? Say ask, then your question. For example: ask, what is the amount due?"
          );
          busyRef.current = false;
          return;
        }
        await captureAndAnalyze(cmd.mode, cmd.agent, cmd.question);
        return;
      }

      busyRef.current = true;
      await speakAndWait(
        "I didn't catch a command. Say help for options, or say read this, or what's in front of me."
      );
      busyRef.current = false;
    },
    [captureAndAnalyze, endSession, speakAndWait]
  );

  useEffect(() => {
    onTranscriptRef.current = (transcript: string) => {
      void handleVoiceTranscript(transcript);
    };
  }, [handleVoiceTranscript]);

  const startTalkSession = useCallback(async () => {
    if (sessionActiveRef.current) {
      await endSession(true);
      return;
    }

    if (!speechSupported().recognition) {
      setError(
        "Speech recognition not available. Try Chrome, or use Capture & hear."
      );
      void speak(
        "Speech recognition is not available. Try Chrome, or use Capture and hear."
      );
      return;
    }

    unlockSpeech();
    stopSpeaking();
    busyRef.current = false;
    setError(null);
    setVoiceHeard(null);
    setStatus("Listening");
    setPhase("listening");
    sessionActiveRef.current = true;
    setSessionActive(true);

    listenRef.current?.stop();
    const session = new ContinuousListenSession({
      onTranscript: (t) => {
        onTranscriptRef.current(t);
      },
      onError: (message) => {
        setError(message);
        setStatus("");
        sessionActiveRef.current = false;
        setSessionActive(false);
        setPhase("idle");
        setListening(false);
      },
      onListeningChange: (isListening) => {
        setListening(isListening);
        if (isListening && sessionActiveRef.current && !busyRef.current) {
          setPhase("listening");
        }
      },
    });
    listenRef.current = session;
    session.start();
    session.pause();
    setSpeaking(true);
    setPhase("speaking");
    try {
      await speak(
        "Listening. Say read this, what's in front of me, ask a question, help, or stop."
      );
    } catch {
      // continue listening
    } finally {
      setSpeaking(false);
    }

    if (sessionActiveRef.current) {
      session.resume();
      setPhase("listening");
    }
  }, [endSession]);

  // Fallback: Capture & hear uses current More-options mode (or auto)
  const handleCaptureAndHear = useCallback(async () => {
    if (loading || busyRef.current) return;
    unlockSpeech();
    await captureAndAnalyze(
      mode,
      mode === "read"
        ? "reader"
        : mode === "alert"
          ? "scene"
          : mode === "ask"
            ? "ask"
            : null,
      mode === "ask" || mode === "explain" ? question : undefined
    );
  }, [captureAndAnalyze, loading, mode, question]);

  const handleHearThisPhoto = useCallback(async () => {
    if (!imageBlob || busyRef.current) return;
    unlockSpeech();
    busyRef.current = true;
    setStatus("Analyzing.");
    listenRef.current?.pause();
    try {
      await speak("Analyzing.");
    } catch {
      // continue
    }
    const response = await runAnalyzeWithMode(
      imageBlob,
      mode,
      mode === "ask" || mode === "explain" || question.trim()
        ? question
        : undefined
    );
    if (response) {
      await speakAndWait(spokenAnswer(response));
    } else {
      await speakAndWait("Analysis failed. Try again.");
    }
    busyRef.current = false;
  }, [imageBlob, mode, question, runAnalyzeWithMode, speakAndWait]);

  const handleUpload = useCallback(
    async (blob: Blob, url: string) => {
      unlockSpeech();
      storeImage(blob, url);
      await captureAndAnalyze(
        mode,
        mode === "read"
          ? "reader"
          : mode === "alert"
            ? "scene"
            : mode === "ask"
              ? "ask"
              : null,
        mode === "ask" || mode === "explain" ? question : undefined
      );
    },
    [captureAndAnalyze, mode, question, storeImage]
  );

  const handleListenMic = useCallback(async () => {
    stopSpeaking();
    setError(null);
    setVoiceHeard(null);
    setOptionsOpen(true);
    try {
      const transcript = await listenOnce();
      if (!transcript) {
        setError("I didn’t catch that. Try typing, or find a quieter spot.");
        return;
      }
      setQuestion(transcript);
      setMode("ask");
      setVoiceHeard(transcript);
      void speak(`You said: ${transcript}. Capture and hear when ready.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone failed.");
    }
  }, []);

  const playResult = useCallback(
    async (response: AnalyzeResponse) => {
      await speakAndWait(spokenAnswer(response));
    },
    [speakAndWait]
  );

  const phaseLabel = (() => {
    if (phase === "listening") return "Listening for a command…";
    if (phase === "capturing") return "Capturing…";
    if (phase === "analyzing") return "Analyzing…";
    if (phase === "speaking") return "Speaking…";
    return "Tap Talk to ANVAYA to start";
  })();

  return (
    <main className="shell">
      <header className="hero">
        <p className="brand-kicker">ANVAYA</p>
        <h1 className="brand">Talk</h1>
        {backendReady === false && (
          <p className="banner" role="status">
            Backend offline or missing GEMINI_API_KEY. Start FastAPI and add your
            key to backend/.env
          </p>
        )}
      </header>

      <div className="workspace">
        <p className="session-status" role="status" aria-live="polite">
          {sessionActive
            ? `${phaseLabel}${activeAgent ? ` · Agent: ${agentSpokenName(activeAgent)}` : ""}`
            : phaseLabel}
        </p>

        <CameraCapture
          ref={cameraRef}
          onCapture={storeImage}
          onUpload={(blob, url) => void handleUpload(blob, url)}
          onReadyChange={setCameraReady}
          disabled={loading || phase === "capturing"}
        />

        <button
          type="button"
          className={`btn btn-talk${sessionActive ? " is-active" : ""}`}
          onClick={() => void startTalkSession()}
          disabled={loading && !sessionActive}
          aria-pressed={sessionActive}
          aria-describedby="trust-line talk-hint"
          aria-label={
            sessionActive
              ? "Stop talking to ANVAYA"
              : "Talk to ANVAYA — start voice session"
          }
        >
          {sessionActive
            ? listening
              ? "Listening… (tap to stop)"
              : "Session on (tap to stop)"
            : "Talk to ANVAYA"}
        </button>

        <p id="talk-hint" className="talk-hint">
          Say <strong>read this</strong>, <strong>what&apos;s in front of me</strong>,{" "}
          <strong>ask …</strong>, <strong>help</strong>, or <strong>stop</strong>.
          Chrome works best for the mic.
        </p>

        <button
          type="button"
          className="btn btn-secondary btn-hear-again"
          onClick={() => void handleCaptureAndHear()}
          disabled={loading || !cameraReady || speaking}
          aria-label="Capture photo and hear without voice"
        >
          {loading ? "Analyzing…" : "Capture & hear"}
        </button>

        {imageBlob && (
          <button
            type="button"
            className="btn btn-ghost btn-hear-again"
            onClick={() => void handleHearThisPhoto()}
            disabled={loading}
          >
            Hear this photo again
          </button>
        )}

        {previewUrl && (
          <figure className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="" />
            <figcaption>
              Last photo — change mode under More options, then Hear this photo
              again
            </figcaption>
          </figure>
        )}

        {voiceHeard && (
          <p className="voice-confirm" role="status">
            Heard: {voiceHeard}
          </p>
        )}

        <MoreOptions
          open={optionsOpen}
          onOpenChange={setOptionsOpen}
          mode={mode}
          onModeChange={setMode}
          question={question}
          onQuestionChange={(value) => {
            setQuestion(value);
          }}
          listening={false}
          voiceOk={voiceOk.recognition}
          onListen={() => void handleListenMic()}
          disabled={loading}
        />

        <ResultPanel
          result={result}
          loading={loading}
          error={error}
          status={status}
          speaking={speaking}
          onReplay={() => {
            if (result) void playResult(result);
          }}
          onStop={() => {
            stopSpeaking();
            setSpeaking(false);
            if (sessionActiveRef.current) {
              listenRef.current?.resume();
              setPhase("listening");
            }
          }}
        />
      </div>

      <footer className="safety-footer">
        <p id="trust-line">
          Photo is processed and not stored. Not medical advice. Not a safety
          system.
        </p>
        <details className="about">
          <summary>About ANVAYA</summary>
          <p>
            Voice-first accessibility agent. Tap Talk once, then say Reader or
            Scene commands. Capture & hear is the silent fallback. More options
            keep the full mode set for demos.
          </p>
        </details>
      </footer>
    </main>
  );
}
