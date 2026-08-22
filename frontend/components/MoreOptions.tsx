"use client";

import { ModeSelector } from "@/components/ModeSelector";
import type { AnalyzeMode } from "@/lib/api";

type MoreOptionsProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: AnalyzeMode;
  onModeChange: (mode: AnalyzeMode) => void;
  question: string;
  onQuestionChange: (value: string) => void;
  listening: boolean;
  voiceOk: boolean;
  onListen: () => void;
  disabled?: boolean;
};

const MODE_LABELS: Record<AnalyzeMode, string> = {
  auto: "Auto",
  simple: "Simple",
  detailed: "Detailed",
  alert: "Alert",
  read: "Read",
  ask: "Ask",
  explain: "Explain",
  simplify: "Simplify",
};

export function MoreOptions({
  open,
  onOpenChange,
  mode,
  onModeChange,
  question,
  onQuestionChange,
  listening,
  voiceOk,
  onListen,
  disabled,
}: MoreOptionsProps) {
  const needsQuestion = mode === "ask" || mode === "explain";

  return (
    <details
      className="more-options"
      open={open}
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="more-summary">
        More options · Mode: {MODE_LABELS[mode]}
      </summary>

      <div className="more-body">
        <ModeSelector value={mode} onChange={onModeChange} disabled={disabled} />

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
              onChange={(e) => onQuestionChange(e.target.value)}
              placeholder={
                needsQuestion
                  ? "e.g. What is the total amount due?"
                  : "Optional context"
              }
              disabled={disabled}
              aria-required={needsQuestion}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onListen}
              disabled={disabled || listening || !voiceOk}
              aria-label={
                listening ? "Listening for your question" : "Speak your question"
              }
              title={
                voiceOk
                  ? "Speak your question"
                  : "Speech recognition not supported in this browser. Try Chrome."
              }
            >
              {listening ? "Listening…" : "Mic"}
            </button>
          </div>
        </div>
      </div>
    </details>
  );
}
