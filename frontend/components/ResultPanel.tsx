"use client";

import { formatDocumentKind, type AnalyzeResponse } from "@/lib/api";

type ResultPanelProps = {
  result: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  status: string;
  onReplay: () => void;
  onStop: () => void;
  speaking: boolean;
};

export function ResultPanel({
  result,
  loading,
  error,
  status,
  onReplay,
  onStop,
  speaking,
}: ResultPanelProps) {
  const needsRetry =
    result?.aim_hint && result.aim_hint !== "ok" && result.aim_instruction;

  return (
    <section className="result-panel" aria-labelledby="result-heading">
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </p>

      <div className="result-header">
        <h2 id="result-heading" className="result-title">
          ANVAYA says
        </h2>
        <div className="result-actions">
          {result && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onReplay}
              aria-label="Speak the response again"
            >
              {speaking ? "Speaking…" : "Speak again"}
            </button>
          )}
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
      </div>

      {loading && (
        <div className="think" role="status" aria-live="polite">
          <div className="think-rings" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="result-status">Reading the page…</p>
        </div>
      )}

      {error && (
        <p className="result-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !result && (
        <p className="result-placeholder">
          The spoken answer will appear here as text.
        </p>
      )}

      {result && (
        <div className="result-body">
          <p className="result-mode">
            {formatDocumentKind(result.document_kind)
              ? `Reading: ${formatDocumentKind(result.document_kind)}`
              : `Mode: ${result.mode}`}
          </p>
          {needsRetry && (
            <p className="result-confidence">{result.aim_instruction}</p>
          )}
          <blockquote className="result-quote">
            <p className="result-text">“{result.text}”</p>
          </blockquote>
          {result.confidence_note && (
            <p className="result-confidence">{result.confidence_note}</p>
          )}
        </div>
      )}
    </section>
  );
}
