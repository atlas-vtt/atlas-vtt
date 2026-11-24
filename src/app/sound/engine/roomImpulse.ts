import { kWeightedEnergy } from '../codec/loudness';
import type { RoomId } from '../soundTypes';

/** What makes a space sound like itself: how long it rings, how soon, how dark its tail turns, and its first echoes. */
interface RoomShape {
  /** Time for the tail to fall 60 dB. */
  rt60: number;
  preDelayMs: number;
  /** The tail starts this bright and darkens towards `darkHz` as it dies, as air and stone take the highs first. */
  brightHz: number;
  darkHz: number;
  /** Early reflections: when, and how loud against as much of the tail's start as `ECHO_WINDOW_SECONDS` holds. */
  reflections: ReadonlyArray<readonly [ms: number, gain: number]>;
}

export const ROOM_SHAPES: Readonly<Record<RoomId, RoomShape>> = {
  room: { rt60: 0.7, preDelayMs: 6, brightHz: 9000, darkHz: 3500, reflections: [[11, 0.5], [17, 0.35], [23, 0.25]] },
  hall: { rt60: 2.1, preDelayMs: 18, brightHz: 7500, darkHz: 2200, reflections: [[21, 0.3], [34, 0.22], [47, 0.15]] },
  cave: { rt60: 3, preDelayMs: 30, brightHz: 4200, darkHz: 900, reflections: [[90, 0.4], [170, 0.26], [260, 0.14]] },
  cathedral: { rt60: 4.5, preDelayMs: 40, brightHz: 6500, darkHz: 1500, reflections: [[45, 0.2], [70, 0.15]] },
};

/** The diffuse tail grows in over this, so it never starts with a click. */
const ONSET_SECONDS = 0.005;
/** A reflection of gain 1 carries as much energy as this much of the tail's start: what the ear sums an echo against. */
const ECHO_WINDOW_SECONDS = 0.01;
/** The two ears hear the same echo this far apart, which makes the space wide. */
const STEREO_SPREAD_MS = 1.3;

/** The longest a room rings, in seconds: how long a bus is kept after its last send. */
export const roomTailSeconds = (room: RoomId): number => ROOM_SHAPES[room].preDelayMs / 1000 + ROOM_SHAPES[room].rt60;

/** A seeded noise source: every device builds the very same room. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

function channel(shape: RoomShape, sampleRate: number, side: 0 | 1): Float32Array<ArrayBuffer> {
  const preDelay = Math.round((shape.preDelayMs / 1000) * sampleRate);
  const length = preDelay + Math.ceil(shape.rt60 * sampleRate);
  const out = new Float32Array(length);
  const random = noise(0x5eed + side * 0x9e3779b9 + Math.round(shape.rt60 * 1000));
  const decayPerSample = Math.log(1000) / (shape.rt60 * sampleRate);
  const onset = ONSET_SECONDS * sampleRate;
  let low = 0;
  for (let i = preDelay; i < length; i++) {
    const n = i - preDelay;
    const progress = n / (length - preDelay);
    const cutoff = shape.brightHz * (shape.darkHz / shape.brightHz) ** progress;
    low += (1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate)) * (random() - low);
    out[i] = low * Math.exp(-decayPerSample * n) * Math.min(1, n / onset);
  }
  // The tail's level over its first 20 ms: what the reflections are measured against.
  const start = out.subarray(preDelay, preDelay + Math.round(0.02 * sampleRate));
  let sum = 0;
  for (const value of start) sum += value * value;
  const echo = Math.sqrt((sum / Math.max(1, start.length)) * ECHO_WINDOW_SECONDS * sampleRate);
  const spread = side === 0 ? 0 : Math.round((STEREO_SPREAD_MS / 1000) * sampleRate);
  for (const [ms, gain] of shape.reflections) {
    const at = Math.round((ms / 1000) * sampleRate) + spread;
    if (at < length) out[at] = (out[at] ?? 0) + gain * echo * (side === 0 ? 1 : -1);
  }
  return out;
}

/** Long enough for the spectrum and K-weighting filters to ring out after an impulse's last sample. */
const FILTER_SETTLE_SECONDS = 0.5;

/** Paul Kellet's pink filter, -3 dB an octave, over `length` samples. */
function pinked(input: Float32Array, length: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  let [b0, b1, b2, b3, b4, b5, b6] = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < length; i++) {
    const white = input[i] ?? 0;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
  }
  return out;
}

/**
 * How much louder a steady sound falling 6 dB an octave comes out of an impulse response than it goes in,
 * in K-weighted energy. Music and ambience lie about there: calibrated on pink, the tails of real tracks
 * still came out 1 to 2.4 dB over them; on this, within 0.8 dB in every room.
 */
function loudnessGain(impulse: Float32Array, sampleRate: number): number {
  const length = impulse.length + Math.round(FILTER_SETTLE_SECONDS * sampleRate);
  const weighted = (signal: Float32Array): number => kWeightedEnergy(pinked(pinked(signal, length), length));
  return weighted(impulse) / weighted(Float32Array.of(1));
}

/**
 * A room's impulse response, left and right, each as loud as what goes in (`loudnessGain`). Unit energy
 * alone left a room's tail 2 to 5 dB louder than the sound, as its energy lies low, where music has its
 * own. Pure and deterministic.
 */
export function roomImpulse(room: RoomId, sampleRate: number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const shape = ROOM_SHAPES[room];
  const sides = [channel(shape, sampleRate, 0), channel(shape, sampleRate, 1)] as const;
  for (const side of sides) {
    const gain = loudnessGain(side, sampleRate);
    const scale = gain > 0 ? 1 / Math.sqrt(gain) : 0;
    for (let i = 0; i < side.length; i++) side[i] = (side[i] ?? 0) * scale;
  }
  return [sides[0], sides[1]];
}
