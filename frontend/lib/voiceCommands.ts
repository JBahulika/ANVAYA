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
  mode?: AnalyzeMode;
  question?: string;
  label?: string;
  /** Always take a new photo (ignore saved bill) */
  forceNewCapture?: boolean;
  /** Prefer the last saved photo when one exists */
  reuseSavedImage?: boolean;
};

const HELP_TEXT =
  "Hold the page to the camera. After the beep, say what you need — what is this, how much is due, or how many items. " +
  "I will confirm, read the page, and speak the answer. Say new bill for another page. Say okay bye or stop when done.";

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
  "ok bye",
  "okay bye",
  "ok goodbye",
  "okay goodbye",
  "thank you bye",
  "thanks bye",
  "quit",
  "end session",
  "cancel",
  "shut up",
];

function isStopCommand(text: string): boolean {
  if (includesAny(text, STOP_PHRASES)) return true;
  // Catch farewells even when speech-to-text mangles them: "ok bye", "thank you bye"
  return /\b(good\s*)?bye$/.test(text);
}

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

/** User is pointing at something now — capture, do not reuse. */
const LOOK_NOW_PHRASES = [
  "new bill",
  "another bill",
  "next bill",
  "different bill",
  "different page",
  "new document",
  "new page",
  "capture again",
  "take again",
  "retake",
  "fresh capture",
  "look at this",
  "look at the bill",
  "look at the",
  "looking at",
  "i'm holding",
  "i am holding",
  "i'm showing",
  "i am showing",
  "showing you",
  "in front of the camera",
  "in the camera",
  "pointing at",
  "here's a",
  "here is a",
  "this new",
];

const READER_PHRASES = [
  "read this",
  "reed this",
  "read dis",
  "red this",
  "read that",
  "read it",
  "read the bill",
  "read my bill",
  "read the document",
  "read this paper",
  "read this letter",
  "read this form",
  "read the receipt",
  "read the invoice",
  "please read",
  "can you read this",
  "what does this say",
  "what does that say",
  "what does it say",
  "what is this",
  "what's this",
  "whats this",
  "what is that",
  "what's that",
  "whats that",
  "tell me what this is",
  "tell me what that is",
  "tell me what it is",
  "what am i holding",
  "what am i looking at",
  "what do i have",
  "describe this",
  "describe that",
  "help me with this",
  "can you see this",
  "can you see that",
  "look at this",
  "extract text",
  "capture and hear",
  "capture the bill",
  "take a photo",
  "take the photo",
  "scan this",
  "scan the bill",
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

const SIMPLIFY_PHRASES = [
  "simplify",
  "plain language",
  "make it simple",
  "step by step",
  "what do i do",
  "what should i do",
];

/** Full spoken inventory — reuse saved bill unless LOOK_NOW also matches. */
const FULL_LIST_PHRASES = [
  "list everything",
  "list all",
  "list the items",
  "list items",
  "all the items",
  "every item",
  "every line",
  "read everything",
  "read it all",
  "read the whole",
  "recite",
  "tell me everything",
  "tell me all",
  "what did you see",
  "what do you see",
  "everything on the bill",
  "everything on this bill",
  "whole bill",
  "full bill",
  "complete bill",
  "all the lines",
  "line by line",
  "what items",
  "which items",
  "items in the bill",
  "items on the bill",
  "what's on this bill",
  "what is on this bill",
  "whats on this bill",
  "what's in this bill",
  "what is in this bill",
  "whats in this bill",
];

/** Short field follow-ups — reuse saved bill. */
const FIELD_FOLLOWUP_PHRASES = [
  "how many items",
  "item count",
  "number of items",
  "how many line",
  "line items",
  "amount due",
  "how much do i owe",
  "how much is due",
  "how much is it",
  "what is due",
  "due date",
  "when is it due",
  "late fee",
  "is it overdue",
  "account number",
  "consumer number",
  "who is it from",
  "who sent",
  "from whom",
  "what is this bill",
  "what's this bill",
  "the total",
  "subtotal",
  "tax amount",
];

const ASK_PREFIXES = ["ask ", "ask,", "question ", "i want to know "];

function asAsk(
  question: string,
  opts: { reuse?: boolean; forceNew?: boolean } = {}
): ParsedVoiceCommand {
  return {
    action: "capture",
    agent: "ask",
    mode: "ask",
    question,
    label: "Ask",
    reuseSavedImage: opts.forceNew ? false : opts.reuse !== false,
    forceNewCapture: Boolean(opts.forceNew),
  };
}

function asRead(forceNew = true): ParsedVoiceCommand {
  return {
    action: "capture",
    agent: "reader",
    mode: "read",
    label: "Reader",
    forceNewCapture: forceNew,
  };
}

/**
 * Map a speech transcript to a voice action / agent.
 * Offline keyword matching — no extra API.
 */
export function parseVoiceCommand(transcript: string): ParsedVoiceCommand {
  const text = normalize(transcript);
  if (!text) {
    return { action: "unknown" };
  }

  if (isStopCommand(text)) {
    return { action: "stop", label: "Stop" };
  }

  if (includesAny(text, HELP_PHRASES)) {
    return { action: "help", label: "Help" };
  }

  if (includesAny(text, REPEAT_PHRASES)) {
    return { action: "repeat", label: "Repeat" };
  }

  const lookNow = includesAny(text, LOOK_NOW_PHRASES);
  const wantsFullList = includesAny(text, FULL_LIST_PHRASES);

  if (includesAny(text, SIMPLIFY_PHRASES)) {
    return {
      action: "capture",
      agent: "reader",
      mode: "simplify",
      label: "Simplify",
      reuseSavedImage: !lookNow,
      forceNewCapture: lookNow,
    };
  }

  // Referring to the last reading → reuse saved photo (full recite if they ask for items)
  if (
    text.includes("did you see") ||
    text.includes("you just read") ||
    text.includes("you already") ||
    text.includes("the last bill") ||
    text.includes("that bill") ||
    text.includes("previous bill") ||
    text.includes("same bill")
  ) {
    return asAsk(transcript.trim(), { reuse: true });
  }

  if (lookNow || includesAny(text, READER_PHRASES) || text === "read") {
    return asRead(true);
  }

  if (wantsFullList) {
    // Inventory while showing a page → capture what's in front now, then recite fully
    return asAsk(transcript.trim(), { forceNew: true });
  }

  if (includesAny(text, FIELD_FOLLOWUP_PHRASES)) {
    return asAsk(transcript.trim(), { reuse: true });
  }

  if (includesAny(text, SCENE_PHRASES)) {
    return {
      action: "capture",
      agent: "scene",
      mode: "alert",
      label: "Scene",
      forceNewCapture: true,
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
      return asAsk(stripped || transcript.trim(), { reuse: true });
    }
  }

  if (text === "ask" || text.startsWith("ask")) {
    const question = transcript.replace(/^ask\b[,:\s]*/i, "").trim();
    return asAsk(question || transcript.trim(), { reuse: true });
  }

  // First look at whatever is in front of the camera
  if (
    text === "this" ||
    text === "this one" ||
    text.startsWith("what is this") ||
    text.startsWith("what's this") ||
    text.startsWith("whats this") ||
    text.startsWith("tell me what")
  ) {
    return asRead(true);
  }

  // Free-form follow-up about the last photo
  if (
    text.endsWith("?") ||
    text.startsWith("what ") ||
    text.startsWith("where ") ||
    text.startsWith("how ") ||
    text.startsWith("who ") ||
    text.startsWith("when ") ||
    text.startsWith("which ") ||
    text.startsWith("is there ") ||
    text.startsWith("can you ") ||
    text.startsWith("tell me ")
  ) {
    return asAsk(transcript.trim(), { reuse: true });
  }

  return asRead(true);
}

export function agentSpokenName(agent: VoiceAgent): string {
  if (agent === "reader") return "Reader";
  if (agent === "scene") return "Scene";
  return "Ask";
}
