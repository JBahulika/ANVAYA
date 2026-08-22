"use client";

import type { AnalyzeMode } from "@/lib/api";

const MODES: { id: AnalyzeMode; label: string; hint: string }[] = [
  { id: "read", label: "Read", hint: "Bills and documents" },
  { id: "simplify", label: "Simplify", hint: "First / then / finally" },
  { id: "ask", label: "Ask", hint: "Answer a question" },
  { id: "explain", label: "Explain", hint: "Help me understand" },
  { id: "auto", label: "Auto", hint: "Prefer documents" },
  { id: "simple", label: "Simple", hint: "Short answer" },
  { id: "detailed", label: "Detailed", hint: "More context" },
  { id: "alert", label: "Alert", hint: "Later: scene cues" },
];

type ModeSelectorProps = {
  value: AnalyzeMode;
  onChange: (mode: AnalyzeMode) => void;
  disabled?: boolean;
};

export function ModeSelector({ value, onChange, disabled }: ModeSelectorProps) {
  return (
    <fieldset className="mode-selector" disabled={disabled}>
      <legend className="mode-legend">Mode</legend>
      <div className="mode-grid" role="radiogroup" aria-label="Accessibility mode">
        {MODES.map((mode) => {
          const selected = value === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`mode-chip${selected ? " is-selected" : ""}`}
              onClick={() => onChange(mode.id)}
            >
              <span className="mode-label">{mode.label}</span>
              <span className="mode-hint">{mode.hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
