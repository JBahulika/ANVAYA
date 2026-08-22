/** Capture cues — must run from a user gesture (or shortly after one). */

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  return new AudioCtx();
}

/** Soft cue that listening / capture is about to start. */
export function playCaptureBeep(): void {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.09;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc.start(now);
    osc.stop(now + 0.15);
    osc.onended = () => void ctx.close();
  } catch {
    // Audio is a cue, not required
  }

  try {
    navigator.vibrate?.(40);
  } catch {
    // Vibration not available
  }
}

/**
 * Loud two-note ding after the photo is saved.
 * Means: you can lower your hand — reading continues in the background.
 */
export function playShotTakenDing(): void {
  if (typeof window === "undefined") return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    void ctx.resume();

    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    playTone(988, now, 0.16);
    playTone(1319, now + 0.14, 0.22);

    window.setTimeout(() => void ctx.close(), 500);
  } catch {
    // Audio is a cue, not required
  }

  try {
    navigator.vibrate?.([50, 40, 80]);
  } catch {
    // Vibration not available
  }
}
