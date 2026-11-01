import type { DiceCrit } from '../tools/diceCrit';
import { dataUrlToArrayBuffer } from './dataUrl';
import { followOutputDevice, forgetOutputFollower } from '../sound/engine/outputDevice';
import throw1 from '../sounds/dice-sfx/dice-throw-1.mp3?inline';
import throw2 from '../sounds/dice-sfx/dice-throw-2.mp3?inline';
import throw3 from '../sounds/dice-sfx/dice-throw-3.mp3?inline';
import soft0 from '../sounds/dice-sfx/impactsoft-heavy-000.mp3?inline';
import bell0 from '../sounds/dice-sfx/impactbell-heavy-000.mp3?inline';
import bell1 from '../sounds/dice-sfx/impactbell-heavy-001.mp3?inline';
import metal0 from '../sounds/dice-sfx/impactmetal-light-000.mp3?inline';
import metal1 from '../sounds/dice-sfx/impactmetal-light-001.mp3?inline';
import metal2 from '../sounds/dice-sfx/impactmetal-light-002.mp3?inline';
import plate0 from '../sounds/dice-sfx/impactplate-light-000.mp3?inline';
import plate1 from '../sounds/dice-sfx/impactplate-light-001.mp3?inline';
import plate2 from '../sounds/dice-sfx/impactplate-light-002.mp3?inline';

/**
 * The sound of a dice result, in two layers. First the rattle: a real recording
 * of dice landing, left untouched. Then the reveal on its tail, shaped from
 * Kenney's CC0 impact samples (pitch, lowpass, body, decay): a wooden chime for
 * a critical success, a dull thud for a critical failure, a short dark knock of
 * metal or plate for everything else.
 */
const POOLS = {
  throw: [throw1, throw2, throw3],
  soft: [soft0],
  bell: [bell0, bell1],
  metal: [metal0, metal1, metal2],
  plate: [plate0, plate1, plate2],
};

const MASTER_GAIN = 0.5;
/** The reveal lands as the rattle (0.45–0.7 s) dies away, not on top of it. */
const REVEAL_DELAY_SECONDS = 0.3;

/** Just intonation: root, major third, fifth, octave. */
const CHIME_RATIOS = [1, 5 / 4, 3 / 2, 2];
const CHIME_ROOT_HZ = 300;
/** Measured pitch of the bell samples at playback rate 1. */
const BELL_SAMPLE_HZ = 380;
const CHIME_STEP_SECONDS = 0.07;

interface Voice {
  samples: string[];
  rate: number;
  gain: number;
  /** Seconds after now. */
  delay?: number;
  lowpass?: number;
  /** Peaking filter as `[hertz, decibels]`. */
  body?: readonly [number, number];
  /** Without it the sample plays out in full. */
  decay?: number;
}

let context: AudioContext | null = null;
let master: GainNode | null = null;
let decoding: Promise<void> | null = null;
const buffers = new Map<string, AudioBuffer>();

function decodeSamples(ctx: AudioContext): Promise<void> {
  decoding ??= Promise.all(
    Object.values(POOLS)
      .flat()
      .map(async (sample) => {
        try {
          buffers.set(sample, await ctx.decodeAudioData(dataUrlToArrayBuffer(sample)));
        } catch (error) {
          console.error('[diceRevealSound] Failed to decode sample:', error);
        }
      }),
  ).then(() => undefined);
  return decoding;
}

function playVoice(ctx: AudioContext, output: AudioNode, voice: Voice): void {
  const sample = voice.samples[Math.floor(Math.random() * voice.samples.length)];
  const buffer = sample === undefined ? undefined : buffers.get(sample);
  if (!buffer) return;

  const at = ctx.currentTime + (voice.delay ?? 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = voice.rate;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(voice.gain, at);
  if (voice.decay !== undefined) {
    // A ramp to a hard cut: cutting the tail is what turns a ring into a strike.
    envelope.gain.exponentialRampToValueAtTime(voice.gain * 0.0016, at + voice.decay);
    envelope.gain.setValueAtTime(0, at + voice.decay + 0.005);
  }

  let tail: AudioNode = source.connect(envelope);
  if (voice.lowpass !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.lowpass;
    filter.Q.value = 0.7;
    tail = tail.connect(filter);
  }
  if (voice.body !== undefined) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = voice.body[0];
    filter.gain.value = voice.body[1];
    filter.Q.value = 1.1;
    tail = tail.connect(filter);
  }
  tail.connect(output);
  source.start(at);
  if (voice.decay !== undefined) source.stop(at + voice.decay + 0.02);
}

/** Fixed pitches on purpose: a critical success must sound the same every time. */
function chimeVoices(): Voice[] {
  return CHIME_RATIOS.flatMap((ratio, i) => {
    const hz = CHIME_ROOT_HZ * ratio;
    const delay = i * CHIME_STEP_SECONDS;
    return [
      // The mallet: wood on wood, gone before the note settles.
      { samples: POOLS.soft, rate: 2.2 * Math.sqrt(ratio), gain: 0.24, delay, lowpass: 2600, decay: 0.05 },
      // The resonator: the bell retuned, its metal filtered away.
      {
        samples: POOLS.bell,
        rate: hz / BELL_SAMPLE_HZ,
        gain: 0.3 - i * 0.035,
        delay,
        lowpass: hz * 10,
        body: [hz * 2.75, 6] as const,
        decay: 0.5 + i * 0.22,
      },
    ];
  });
}

/** Pitches are drawn continuously so consecutive rolls never form a musical interval. */
function revealVoices(crit: DiceCrit): Voice[] {
  if (crit === 'high') return chimeVoices();
  if (crit === 'low') {
    return [
      {
        samples: POOLS.soft,
        rate: 0.5 + Math.random() * 0.22,
        gain: 0.72 + Math.random() * 0.12,
        lowpass: 600 + Math.random() * 340,
        body: [250, 5],
        decay: 0.3 + Math.random() * 0.2,
      },
    ];
  }
  return [
    {
      samples: Math.random() < 0.5 ? POOLS.metal : POOLS.plate,
      rate: 0.7 + Math.random() * 0.46,
      gain: 0.4 + Math.random() * 0.14,
      lowpass: 2100 + Math.random() * 2300,
      decay: 0.26 + Math.random() * 0.24,
    },
  ];
}

export async function playDiceReveal(crit: DiceCrit, volume: number): Promise<void> {
  if (typeof AudioContext === 'undefined') return;
  if (!context) {
    context = new AudioContext();
    followOutputDevice(context);
    master = context.createGain();
    master.connect(context.destination);
  }
  const ctx = context;
  const output = master;
  if (!output) return;

  if (ctx.state === 'suspended') await ctx.resume();
  await decodeSamples(ctx);

  output.gain.value = MASTER_GAIN * volume;
  playVoice(ctx, output, { samples: POOLS.throw, rate: 0.97 + Math.random() * 0.1, gain: 0.72 });
  for (const voice of revealVoices(crit)) {
    playVoice(ctx, output, { ...voice, delay: (voice.delay ?? 0) + REVEAL_DELAY_SECONDS });
  }
}

export function disposeDiceRevealSound(): void {
  if (context) forgetOutputFollower(context);
  context?.close().catch(() => undefined);
  context = null;
  master = null;
  decoding = null;
  buffers.clear();
}
