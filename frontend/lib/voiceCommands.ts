import type { AnalyzeMode } from "@/lib/api";

export type VoiceAgent = "reader" | "scene" | "ask";

export type VoiceAction =
  | "capture"
  | "help"
  | "stop"
  | "repeat"
  | "unknown";

export type ParsedVoiceCommand = {
  action: VoiceAction;
  agent?: VoiceAgent;
  /** Backend mode for capture actions */
  mode?: AnalyzeMode;
  /** Free-form question for Ask agent */
  question?: string;
  /** Short label for UI / spoken confirm */
  label?: string;
};

const HELP_TEXT =
  "Say read this for documents. Say what's in front of me for the scene. " +
  "Say ask, then your question. Say repeat to hear the last answer. Say stop to end.";

export function helpSpeech(): string {
  return HELP_TEXT;
}

function normalize(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((p) => text.includes(p));
}

const STOP_PHRASES = [
  "stop",
  "goodbye",
  "good bye",
  "quit",
  "end session",
  "cancel",
  "shut up",
];

const HELP_PHRASES = [
  "help",
  "what can you do",
  "what can i say",
  "commands",
  "how do i",
];

const REPEAT_PHRASES = [
  "repeat",
  "say that again",
  "say it again",
  "hear again",
  "speak again",
];

const READER_PHRASES = [
  "read this",
  "read that",
  "read it",
  "read the",
  "read my",
  "reader",
  "what does this say",
  "what does that say",
  "what does it say",
  "read the bill",
  "read the sign",
  "read the label",
  "read the text",
  "extract text",
];

const SCENE_PHRASES = [
  "what's in front of me",
  "what is in front of me",
  "whats in front of me",
  "look around",
  "look ahead",
  "scene",
  "is it safe",
  "any hazards",
  "any danger",
  "what's ahead",
  "what is ahead",
  "describe the scene",
  "what's around me",
  "what is around me",
];

const ASK_PREFIXES = ["ask ", "ask,", "question ", "i want to know "];

/**
 * Map a speech transcript to a voice action / agent.
 * Offline keyword matching — no extra API.
 */
export function parseVoiceCommand(transcript: string): ParsedVoiceCommand {
  const text = normalize(transcript);
  if (!text) {
    return { action: "unknown" };
  }

  if (includesAny(text, STOP_PHRASES)) {
    return { action: "stop", label: "Stop" };
  }

  if (includesAny(text, HELP_PHRASES)) {
    return { action: "help", label: "Help" };
  }

  if (includesAny(text, REPEAT_PHRASES)) {
    return { action: "repeat", label: "Repeat" };
  }

  if (includesAny(text, READER_PHRASES) || text === "read") {
    return {
      action: "capture",
      agent: "reader",
      mode: "read",
      label: "Reader",
    };
  }

  if (includesAny(text, SCENE_PHRASES)) {
    return {
      action: "capture",
      agent: "scene",
      mode: "alert",
      label: "Scene",
    };
  }

  for (const prefix of ASK_PREFIXES) {
    if (text.startsWith(prefix.trim()) || text.startsWith(prefix)) {
      const stripped = transcript
        .trim()
        .replace(/^ask\b[,:\s]*/i, "")
        .replace(/^question\b[,:\s]*/i, "")
        .replace(/^i want to know\b[,:\s]*/i, "")
        .trim();
      return {
        action: "capture",
        agent: "ask",
        mode: "ask",
        question: stripped || transcript.trim(),
        label: "Ask",
      };
    }
  }

  if (text === "ask" || text.startsWith("ask")) {
    const question = transcript.replace(/^ask\b[,:\s]*/i, "").trim();
    return {
      action: "capture",
      agent: "ask",
      mode: "ask",
      question: question || undefined,
      label: "Ask",
    };
  }

  // Free-form that sounds like a question → Ask
  if (
    text.endsWith("?") ||
    text.startsWith("what ") ||
    text.startsWith("where ") ||
    text.startsWith("how ") ||
    text.startsWith("is there ") ||
    text.startsWith("can you ")
  ) {
    return {
      action: "capture",
      agent: "ask",
      mode: "ask",
      question: transcript.trim(),
      label: "Ask",
    };
  }

  return { action: "unknown" };
}

export function agentSpokenName(agent: VoiceAgent): string {
  if (agent === "reader") return "Reader";
  if (agent === "scene") return "Scene";
  return "Ask";
}
