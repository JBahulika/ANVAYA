"use client";

import type { AnalyzeResponse } from "@/lib/api";

type ResultPanelProps = {
  result: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  onReplay: () => void;
  onStop: () => void;
  speaking: boolean;
};

export function ResultPanel({
  result,
  loading,
  error,
  onReplay,
  onStop,
  speaking,
}: ResultPanelProps) {
  return (
    <section className="result-panel" aria-live="polite" aria-atomic="true">
      <div className="result-header">
        <h2 className="result-title">AccessLens says</h2>
        {result && (
          <div className="result-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReplay}
              aria-label="Speak the response again"
            >
              {speaking ? "Speaking…" : "Speak again"}
            </button>
            {speaking && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onStop}
                aria-label="Stop speaking"
              >
                Stop
              </button>
            )}
          </div>
        )}
      </div>

      {loading && (
        <p className="result-status" role="status">
          Analyzing your image — usually under 5 seconds…
        </p>
      )}

      {error && (
        <p className="result-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !result && (
        <p className="result-placeholder">
          Capture or upload an image, choose a mode, then tap Analyze.
        </p>
      )}

      {result && (
        <div className="result-body">
          <p className="result-mode">Mode: {result.mode}</p>
          <p className="result-text">{result.text}</p>
          {result.confidence_note && (
            <p className="result-confidence">
              Confidence note: {result.confidence_note}
            </p>
          )}
          <p className="result-disclaimer">{result.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
