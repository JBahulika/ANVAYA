"use client";

import { useCallback, useEffect, useState } from "react";
import { CameraCapture } from "@/components/CameraCapture";
import { ModeSelector } from "@/components/ModeSelector";
import { ResultPanel } from "@/components/ResultPanel";
import { analyzeImage, checkHealth, type AnalyzeMode, type AnalyzeResponse } from "@/lib/api";
import { listenOnce, speak, speechSupported, stopSpeaking } from "@/lib/speech";

export default function HomePage() {
  const [mode, setMode] = useState<AnalyzeMode>("simple");
  const [question, setQuestion] = useState("");
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [backendReady, setBackendReady] = useState<boolean | null>(null);
  const [voiceOk, setVoiceOk] = useState({ recognition: false, synthesis: false });

  useEffect(() => {
    setVoiceOk(speechSupported());
    void checkHealth()
      .then((h) => setBackendReady(h.gemini_configured))
      .catch(() => setBackendReady(false));
  }, []);

  const onCapture = useCallback((blob: Blob, url: string) => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setImageBlob(blob);
    setError(null);
    setResult(null);
    stopSpeaking();
    setSpeaking(false);
  }, []);

  const playResult = useCallback(async (text: string) => {
    if (!speechSupported().synthesis) return;
    setSpeaking(true);
    try {
      await speak(text);
    } catch {
      // TTS optional — keep text visible
    } finally {
      setSpeaking(false);
    }
  }, []);

  const handleAnalyze = useCallback(async () => {
    if (!imageBlob) {
      setError("Capture or upload an image first.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    stopSpeaking();
    setSpeaking(false);

    try {
      const response = await analyzeImage({
        image: imageBlob,
        mode,
        question:
          mode === "ask" || mode === "explain" || question.trim()
            ? question
            : undefined,
      });
      setResult(response);
      void playResult(response.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [imageBlob, mode, playResult, question]);

  const handleListen = useCallback(async () => {
    setListening(true);
    setError(null);
    try {
      const transcript = await listenOnce();
      if (transcript) {
        setQuestion(transcript);
        if (mode !== "ask" && mode !== "explain") {
          setMode("ask");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone failed.");
    } finally {
      setListening(false);
    }
  }, [mode]);

  const needsQuestion = mode === "ask" || mode === "explain";

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">ANVAYA · Prasunethon 2.0</p>
        <h1 className="brand">AccessLens</h1>
        <p className="tagline">
          Point. Understand. Act. — a multimodal accessibility copilot for the
          visual world.
        </p>
        {backendReady === false && (
          <p className="banner" role="status">
            Backend offline or missing GEMINI_API_KEY. Start FastAPI and add your
            key to backend/.env
          </p>
        )}
      </header>

      <div className="workspace">
        <CameraCapture onCapture={onCapture} disabled={loading} />

        {previewUrl && (
          <figure className="preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Selected capture ready for analysis" />
            <figcaption>Ready to analyze</figcaption>
          </figure>
        )}

        <ModeSelector value={mode} onChange={setMode} disabled={loading} />

        <div className="ask-row">
          <label htmlFor="question" className="ask-label">
            {needsQuestion ? "Your question" : "Optional note"}
          </label>
          <div className="ask-controls">
            <input
              id="question"
              className="ask-input"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                needsQuestion
                  ? "e.g. What is the total amount due?"
                  : "Optional context for AccessLens"
              }
              disabled={loading}
              aria-required={needsQuestion}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void handleListen()}
              disabled={loading || listening || !voiceOk.recognition}
              aria-label="Speak your question"
              title={
                voiceOk.recognition
                  ? "Speak your question"
                  : "Speech recognition not supported in this browser"
              }
            >
              {listening ? "Listening…" : "Mic"}
            </button>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-analyze"
          onClick={() => void handleAnalyze()}
          disabled={loading || !imageBlob}
          aria-busy={loading}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>

        <ResultPanel
          result={result}
          loading={loading}
          error={error}
          speaking={speaking}
          onReplay={() => {
            if (result) void playResult(result.text);
          }}
          onStop={() => {
            stopSpeaking();
            setSpeaking(false);
          }}
        />
      </div>

      <footer className="safety-footer">
        AccessLens can misread images. It is not medical advice and not a
        guaranteed safety system. Images are processed ephemerally and not stored
        by the MVP backend.
      </footer>
    </main>
  );
}
