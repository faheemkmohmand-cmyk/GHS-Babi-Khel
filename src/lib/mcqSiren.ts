// src/lib/mcqSiren.ts
// ─────────────────────────────────────────────────────────────────────────────
// SHARED MCQ TIMER + SIREN LOGIC
// ─────────────────────────────────────────────────────────────────────────────
// This module centralizes the MCQ-timer state shape (stored in localStorage
// under MCQ_TIMER_KEY) and the air-raid siren sound (Web Audio API) so that
// BOTH the per-page Hall3DView component AND the app-wide
// McqSirenGlobalController component can use the same source of truth.
//
// Why a shared module?
//   Previously the siren sound logic lived duplicated inside Hall3DView.tsx.
//   The siren only fired when the admin was viewing the 3D Hall page — if
//   the admin was on ANY other page (or the tab was backgrounded, or the
//   mobile screen was locked), the siren was silent and there was no red
//   flash. The user explicitly asked: "no matter where I am — outside the
//   hall, mobile locked, app in background — when MCQ time finishes, the
//   red flash + siren MUST fire for 15 seconds."
//
//   To support that, the siren now lives in a GLOBAL controller mounted
//   once in App.tsx (always running on every page), and the sound logic
//   is shared here so the in-Hall 3D visual + the global sound stay in
//   sync (no double AudioContexts, no double-firing).
//
// Sound design (LOUD + harsh, like a real civil-defense air-raid siren):
//   • Four sawtooth oscillators in two octaves (550/558 Hz + 1100/1116 Hz).
//   • An LFO (0.2 Hz = 5s cycle) sweeps all oscillators' pitch ±220 Hz
//     (±440 Hz on the octave-up pair), producing the classic slow wail.
//   • A waveshaper distortion adds the grinding-metal rotor character.
//   • Master gain at 0.85 — LOUD. Ramps up over 0.3s (no click), ramps
//     down over 0.2s on stop.

// ── MCQ Timer state (shared shape — DO NOT change without updating
//    Hall3DView.tsx, AdminExamConsole.tsx, McqSirenGlobalController.tsx) ──────
export const MCQ_TIMER_KEY = "ghs-exam-mcq-timer";
export const SIREN_DURATION_MS = 15 * 1000; // 15s — matches the user's spec

export interface McqTimerState {
  // Wall-clock epoch ms when the timer is supposed to hit zero.
  endTime: number;
  // Total duration the admin originally picked (ms).
  totalMs: number;
  //   running  → counting down from endTime
  //   stopped  → admin hit Stop before it finished (no siren fires)
  //   finished → reached zero naturally (siren fires globally)
  status: "running" | "stopped" | "finished";
  // Wall-clock epoch ms when the timer finished (siren dedup key).
  finishedAt?: number;
}

/** Read the MCQ timer state from localStorage. Returns null if absent/invalid. */
export function readMcqTimer(): McqTimerState | null {
  try {
    const raw = localStorage.getItem(MCQ_TIMER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.endTime !== "number") return null;
    if (typeof parsed.totalMs !== "number") return null;
    if (typeof parsed.status !== "string") return null;
    return parsed as McqTimerState;
  } catch {
    return null;
  }
}

/** Write the MCQ timer state to localStorage (or remove it when null). */
export function writeMcqTimer(state: McqTimerState | null): void {
  try {
    if (state === null) {
      localStorage.removeItem(MCQ_TIMER_KEY);
    } else {
      localStorage.setItem(MCQ_TIMER_KEY, JSON.stringify(state));
    }
  } catch { /* ignore quota / private-mode errors */ }
}

/** Format ms as MM:SS for display. */
export function formatMcqTime(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── Siren sound (Web Audio API) ──────────────────────────────────────────────
// The AudioContext is created lazily and unlocked on the first user gesture
// (see unlockSirenAudio()). Mobile autoplay policy requires a user gesture
// to start audio — the admin's login click / navigation tap counts, so by
// the time a timer could finish the context is already 'running'.

interface SirenNodes {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  osc3: OscillatorNode;
  osc4: OscillatorNode;
  lfo: OscillatorNode;
  lfoGain: GainNode;
  lfoGain2: GainNode;
  masterGain: GainNode;
  distortion: WaveShaperNode;
  osc2Gain: GainNode;
  osc3Gain: GainNode;
  osc4Gain: GainNode;
}

let sirenAudioCtx: AudioContext | null = null;
let sirenNodes: SirenNodes | null = null;

/** Create (or reuse) the shared AudioContext for the siren. */
export function ensureSirenAudioCtx(): AudioContext | null {
  if (sirenAudioCtx) return sirenAudioCtx;
  try {
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    sirenAudioCtx = new Ctx();
  } catch {
    sirenAudioCtx = null;
  }
  return sirenAudioCtx;
}

/**
 * Unlock the AudioContext on a user gesture. Mobile autoplay policy requires
 * a user gesture to start audio. The SIREN trigger arrives from a timer (not
 * a gesture), so we must resume the AudioContext BEFORE the siren needs to
 * fire. Call this from a pointerdown/keydown listener.
 */
export function unlockSirenAudio() {
  const ctx = ensureSirenAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

/** Create a waveshaper distortion curve for the harsh siren character. */
function makeDistortionCurve(amount: number): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  const k = amount * 100;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Start the air-raid siren wail. Idempotent — if already playing, does
 * nothing. Creates four sawtooth oscillators (two octaves) + an LFO that
 * sweeps their pitch + a waveshaper for the harsh mechanical character.
 */
export function startSirenSound() {
  const ctx = ensureSirenAudioCtx();
  if (!ctx) return;
  // Resume if suspended (best-effort — may fail outside a user gesture,
  // but unlockSirenAudio() should have already resumed it on the admin's
  // first click/tap anywhere in the app).
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  // If already playing, don't start a second layer.
  if (sirenNodes) return;

  const now = ctx.currentTime;

  // Master gain — LOUD (0.85). Ramps up from 0 over 0.3s to avoid a click.
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.exponentialRampToValueAtTime(0.85, now + 0.3);
  masterGain.connect(ctx.destination);

  // Waveshaper distortion — harsh, grinding electromechanical rotor character.
  const distortion = ctx.createWaveShaper();
  distortion.curve = makeDistortionCurve(0.4);
  distortion.oversample = "4x";
  distortion.connect(masterGain);

  // LFO (0.2 Hz = 5 seconds per wail cycle — the classic slow, ominous wail).
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.2;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 220; // ±220 Hz sweep on the base oscillators
  lfo.connect(lfoGain);

  // Oscillator 1 — main siren tone (sawtooth = harsh, buzzy). 550 Hz base.
  const osc1 = ctx.createOscillator();
  osc1.type = "sawtooth";
  osc1.frequency.value = 550;
  lfoGain.connect(osc1.frequency);
  osc1.connect(distortion);

  // Oscillator 2 — detuned +8 Hz for chorus-like richness (two rotors).
  const osc2 = ctx.createOscillator();
  osc2.type = "sawtooth";
  osc2.frequency.value = 558;
  lfoGain.connect(osc2.frequency);
  const osc2Gain = ctx.createGain();
  osc2Gain.gain.value = 0.7;
  osc2.connect(osc2Gain);
  osc2Gain.connect(distortion);

  // Oscillator 3 — one octave UP (1100 Hz) for piercing presence.
  const lfoGain2 = ctx.createGain();
  lfoGain2.gain.value = 440; // ±440 Hz sweep on the octave-up pair
  lfo.connect(lfoGain2);

  const osc3 = ctx.createOscillator();
  osc3.type = "sawtooth";
  osc3.frequency.value = 1100;
  lfoGain2.connect(osc3.frequency);
  const osc3Gain = ctx.createGain();
  osc3Gain.gain.value = 0.4;
  osc3.connect(osc3Gain);
  osc3Gain.connect(distortion);

  // Oscillator 4 — detuned octave-up (+16 Hz).
  const osc4 = ctx.createOscillator();
  osc4.type = "sawtooth";
  osc4.frequency.value = 1116;
  lfoGain2.connect(osc4.frequency);
  const osc4Gain = ctx.createGain();
  osc4Gain.gain.value = 0.3;
  osc4.connect(osc4Gain);
  osc4Gain.connect(distortion);

  osc1.start(now);
  osc2.start(now);
  osc3.start(now);
  osc4.start(now);
  lfo.start(now);

  sirenNodes = {
    osc1, osc2, osc3, osc4, lfo, lfoGain, lfoGain2,
    masterGain, distortion, osc2Gain, osc3Gain, osc4Gain,
  };
}

/**
 * Stop the air-raid siren. Idempotent. Ramps the master gain to 0 over 0.2s
 * (so it doesn't click off) then stops and disconnects everything.
 */
export function stopSirenSound() {
  if (!sirenNodes || !sirenAudioCtx) return;
  const ctx = sirenAudioCtx;
  const n = sirenNodes;
  const now = ctx.currentTime;
  try {
    n.masterGain.gain.cancelScheduledValues(now);
    n.masterGain.gain.setValueAtTime(n.masterGain.gain.value, now);
    n.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    n.osc1.stop(now + 0.25);
    n.osc2.stop(now + 0.25);
    n.osc3.stop(now + 0.25);
    n.osc4.stop(now + 0.25);
    n.lfo.stop(now + 0.25);
    n.osc1.onended = () => {
      try {
        n.osc1.disconnect(); n.osc2.disconnect();
        n.osc3.disconnect(); n.osc4.disconnect();
        n.lfo.disconnect(); n.lfoGain.disconnect(); n.lfoGain2.disconnect();
        n.masterGain.disconnect(); n.distortion.disconnect();
        n.osc2Gain.disconnect(); n.osc3Gain.disconnect(); n.osc4Gain.disconnect();
      } catch { /* ignore */ }
    };
  } catch {
    try {
      n.osc1.stop(); n.osc2.stop(); n.osc3.stop(); n.osc4.stop(); n.lfo.stop();
    } catch { /* ignore */ }
  }
  sirenNodes = null;
}

/** Returns true if the siren is currently playing. */
export function isSirenPlaying(): boolean {
  return sirenNodes !== null;
}
