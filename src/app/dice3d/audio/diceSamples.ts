import { dataUrlToArrayBuffer } from '../../audio/dataUrl';
import throw1 from '../../sounds/dice-sfx/dice-throw-1.mp3?inline';
import throw2 from '../../sounds/dice-sfx/dice-throw-2.mp3?inline';
import throw3 from '../../sounds/dice-sfx/dice-throw-3.mp3?inline';
import soft0 from '../../sounds/dice-sfx/impactsoft-heavy-000.mp3?inline';
import plate0 from '../../sounds/dice-sfx/impactplate-light-000.mp3?inline';
import plate1 from '../../sounds/dice-sfx/impactplate-light-001.mp3?inline';
import plate2 from '../../sounds/dice-sfx/impactplate-light-002.mp3?inline';
import metal0 from '../../sounds/dice-sfx/impactmetal-light-000.mp3?inline';
import metal1 from '../../sounds/dice-sfx/impactmetal-light-001.mp3?inline';
import metal2 from '../../sounds/dice-sfx/impactmetal-light-002.mp3?inline';
import glass0 from '../../sounds/dice-sfx/impactglass-light-000.mp3?inline';
import glass1 from '../../sounds/dice-sfx/impactglass-light-001.mp3?inline';
import glass2 from '../../sounds/dice-sfx/impactglass-light-002.mp3?inline';
import glass3 from '../../sounds/dice-sfx/impactglass-light-003.mp3?inline';
import glass4 from '../../sounds/dice-sfx/impactglass-light-004.mp3?inline';
import bell0 from '../../sounds/dice-sfx/impactbell-heavy-000.mp3?inline';
import bell1 from '../../sounds/dice-sfx/impactbell-heavy-001.mp3?inline';

/**
 * The samples of the 3D dice and the voice that plays them.
 *
 * ## Why wood comes from a plate recording
 *
 * There is no wood in the pool. Kenney's pack has glass (2.8 kHz), plate
 * (3.2 kHz), metal (3.6 kHz), bell (2.6 kHz) and a single dull piece,
 * `impactsoft` at 1.6 kHz. Everything else rings.
 *
 * A wooden knock is not just "darker": it is a strike without a tail. What
 * makes it is the body around three hundred hertz and the fact that nothing is
 * left after a tenth of a second. Both can be carved out of a ringing
 * recording: a lowpass against the ring, a peak at 300 Hz for the body, and a
 * short envelope that cuts the tail before it starts. That is the difference
 * between a plate and a board, and it lives in `voice`.
 *
 * The `AudioContext` is created on the first sound, in the main window, and
 * only where one exists (not in jsdom). If the browser refuses sound without a
 * user gesture, the roll stays silent and works just the same.
 */
export const POOLS = {
  /** Dice falling: a real recording, and the only one left as it is. */
  throw: [throw1, throw2, throw3],
  /** The dullest piece in the pool, the raw material of everything wooden. */
  soft: [soft0],
  /** Rings, but varies: filtered, it gives the spread of the box rim. */
  plate: [plate0, plate1, plate2],
  metal: [metal0, metal1, metal2],
  glass: [glass0, glass1, glass2, glass3, glass4],
  /** The only long piece in the pool (one and a half seconds). Only the high crit uses it, see `reveal`. */
  bell: [bell0, bell1],
};

/** The resting volume every roll fades in to, at full dice volume. */
const MASTER = 0.5;

let ctx: AudioContext | null = null;
/** The user's dice volume, 0 to 1 (`SettingsService.getDiceVolume`). */
let volume = 1;
let master: GainNode | null = null;
/** Decoded samples, data URL to buffer. Filled by `prime()`. */
const decoded = new Map<string, AudioBuffer>();
let primed: Promise<void> | null = null;
/** Whether `prime` is through: successful or not, but finished. */
let ready = false;

export function audio(): AudioContext | null {
  if (typeof window === 'undefined' || typeof window.AudioContext === 'undefined') return null;
  if (ctx === null) {
    try {
      ctx = new window.AudioContext();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** The resting volume every roll fades in to: `MASTER` scaled by the user's dice volume. */
export function masterLevel(): number {
  return MASTER * volume;
}

/** Sets the user's dice volume, 0 to 1; sounds already playing take it at once. */
export function setDiceVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (ctx && master) master.gain.setValueAtTime(masterLevel(), ctx.currentTime);
}

/** The gain every voice ends in; `null` until `audio()` created the context. */
export function masterGain(): GainNode | null {
  return master;
}

/**
 * Decodes every sample once, as soon as there is an `AudioContext`. The promise
 * settles when each sample is either decoded or has failed, so whoever waits
 * on it never waits in vain.
 */
export function prime(c: AudioContext): Promise<void> {
  if (primed !== null) return primed;
  primed = Promise.all(
    Object.values(POOLS)
      .flat()
      .map((url) =>
        c
          .decodeAudioData(dataUrlToArrayBuffer(url))
          .then((buffer) => {
            decoded.set(url, buffer);
          })
          .catch(() => undefined),
      ),
  ).then(() => {
    ready = true;
  });
  return primed;
}

/** Closes the audio context and forgets the decoded samples; the next sound starts over. */
export function disposeDiceSamples(): void {
  ctx?.close().catch(() => undefined);
  ctx = null;
  master = null;
  primed = null;
  ready = false;
  decoded.clear();
}

/**
 * Starts decoding the samples ahead of the first sound. Call it when a roll
 * starts: decoding takes a moment, and without it the first roll of a session
 * would be silent.
 */
export function warmDiceSounds(): void {
  const c = audio();
  if (c !== null) void prime(c);
}

/**
 * Runs `fn` once the samples are decoded; returns `true` instead when they
 * already are, so the caller plays now.
 *
 * For sounds that are still right a moment later: the rattle and the reveal
 * stand at the end of the roll, and a rattle a tenth of a second late beats no
 * rattle at all.
 */
export function whenReady(fn: () => void): boolean {
  if (ready) return true;
  const c = audio();
  if (c !== null) void prime(c).then(fn);
  return false;
}

export interface Voice {
  urls: string[];
  rate: number;
  gain: number;
  /** When, in the context's time. `0` means now. */
  when?: number;
  /** Position on the stage, -1 to 1. */
  pan?: number;
  /** Lowpass in hertz. Without it the recording keeps its ring. */
  lowpass?: number;
  /**
   * Highpass in hertz: the floor under a voice.
   *
   * For a voice layered over another: without its lows it no longer doubles
   * the body of the lower one and only adds on top, so two strikes fuse into
   * one instead of adding up.
   */
  highpass?: number;
  /** Peaking filter as `[hertz, decibels]`: the body wood has and plate has not. */
  body?: readonly [number, number];
  /** The sound is over after this time. That turns a sound into a strike. */
  decay?: number;
}

/**
 * One recording, randomised in pitch, strength, position and shape.
 *
 * Samples not decoded yet stay silent: better a missing strike at the start
 * than a late one in the middle of the roll.
 */
export function voice({
  urls,
  rate,
  gain,
  when = 0,
  pan = 0,
  lowpass,
  highpass,
  body,
  decay,
}: Voice): AudioBufferSourceNode | null {
  const c = audio();
  if (c === null || master === null || urls.length === 0) return null;
  void prime(c);
  const url = urls[Math.floor(Math.random() * urls.length)];
  const buffer = url === undefined ? undefined : decoded.get(url);
  if (buffer === undefined) return null;

  const at = when === 0 ? c.currentTime : when;
  const source = c.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const env = c.createGain();
  env.gain.setValueAtTime(gain, at);
  if (decay !== undefined) {
    // Exponential with a hard cut at the end: a tail that runs down to zero is
    // no longer a tail but a leftover.
    env.gain.exponentialRampToValueAtTime(gain * 0.0016, at + decay);
    env.gain.setValueAtTime(0, at + decay + 0.005);
  }

  let tail: AudioNode = source.connect(env);
  if (highpass !== undefined) {
    const filter = c.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = highpass;
    filter.Q.value = 0.7;
    tail = tail.connect(filter);
  }
  if (lowpass !== undefined) {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    filter.Q.value = 0.7;
    tail = tail.connect(filter);
  }
  if (body !== undefined) {
    const filter = c.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = body[0];
    filter.gain.value = body[1];
    filter.Q.value = 1.1;
    tail = tail.connect(filter);
  }
  if (pan !== 0 && typeof c.createStereoPanner === 'function') {
    const panner = c.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    tail = tail.connect(panner);
  }
  tail.connect(master);
  source.start(at);
  if (decay !== undefined) source.stop(at + decay + 0.02);
  return source;
}

export const jitter = (spread: number): number => 1 + (Math.random() - 0.5) * spread;
