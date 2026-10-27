import type { LightAnimation } from '../../types/lightingTypes';

/** How a light deviates from its settings at one moment. */
export interface FlickerSample {
  intensity: number;
  /** Multiplies the light's bright radius; its dim radius, where the rules end it, stays. */
  radiusScale: number;
}

export const STEADY: FlickerSample = { intensity: 1, radiusScale: 1 };

/** A random walk channel: its range and how much of the previous value each step keeps. */
interface Channel { min: number; max: number; keep: number }

interface WalkProfile {
  /** Milliseconds between random steps; samples in between are interpolated. */
  step: number;
  intensity: Channel;
  radius: Channel;
}

const WALKS: Partial<Record<LightAnimation, WalkProfile>> = {
  torch: { step: 60, intensity: { min: 0.85, max: 1.1, keep: 0.85 }, radius: { min: 0.97, max: 1.03, keep: 0.9 } },
  candle: { step: 45, intensity: { min: 0.8, max: 1.05, keep: 0.7 }, radius: { min: 0.98, max: 1.02, keep: 0.8 } },
  magic: { step: 120, intensity: { min: 1, max: 1, keep: 1 }, radius: { min: 0.96, max: 1.04, keep: 0.95 } },
};

/**
 * How many slots of the map's animation clock (`ANIMATION_FPS`) an animation is redrawn every:
 * a torch's walk steps every 60 ms and needs every slot; a slow swell (a pulse over 2 s, lava
 * over 3 to 7 s) changes by about one percent from one slot to the next, so every second will do.
 */
const SLOTS: Partial<Record<LightAnimation, number>> = { pulse: 2, smoulder: 2 };

/** The slots of the animation clock `animation` is redrawn every (at least one). */
export function flickerSlots(animation: LightAnimation): number {
  return SLOTS[animation] ?? 1;
}

/** Two random walks in [-1, 1]: intensity and radius. */
interface WalkState {
  stepIndex: number;
  previous: number[];
  current: number[];
}

/**
 * Organic light animation. Torches and candles follow autoregressive random walks
 * (the AR(1) flicker Foundry VTT uses), stepped at a fixed rate and interpolated in
 * between, so they stay smooth at any frame rate; pulse and magic lights breathe, and a
 * smouldering surface swells slowly (`smoulder`).
 * State is per instance and per light id; `forget` drops a removed light. Moving the flame
 * would shift its cached visibility past walls, so flicker changes brightness and the size of
 * the bright range only.
 */
export class LightFlicker {
  private readonly walks = new Map<string, WalkState>();

  constructor(private readonly random: () => number = Math.random) {}

  sample(id: string, animation: LightAnimation, timeMs: number): FlickerSample {
    if (animation === 'pulse') {
      return { ...STEADY, intensity: 1 + 0.15 * Math.sin((timeMs * 2 * Math.PI) / 2000) };
    }
    if (animation === 'smoulder') return smoulder(timeMs, phaseOf(id));
    const profile = WALKS[animation];
    // Steady, and any animation this version does not know (a newer Atlas wrote it).
    if (!profile) return STEADY;
    const [intensityWalk, radiusWalk] = this.walk(id, profile, timeMs);
    const intensity = animation === 'magic' ? magicBreathing(timeMs) : channelValue(profile.intensity, intensityWalk!);
    return { intensity, radiusScale: channelValue(profile.radius, radiusWalk!) };
  }

  forget(id: string): void {
    this.walks.delete(id);
  }

  private walk(id: string, profile: WalkProfile, timeMs: number): number[] {
    const stepIndex = Math.floor(timeMs / profile.step);
    let state = this.walks.get(id);
    if (!state) {
      state = { stepIndex, previous: [0, 0], current: [0, 0] };
      this.walks.set(id, state);
    }
    const keeps = [profile.intensity.keep, profile.radius.keep];
    // A long pause (hidden tab) restarts the walk instead of replaying every missed step.
    if (stepIndex - state.stepIndex > 50) state.stepIndex = stepIndex - 1;
    while (state.stepIndex < stepIndex) {
      state.previous = state.current;
      state.current = state.current.map((value, i) => {
        const keep = keeps[i]!;
        return Math.max(-1, Math.min(1, value * keep + (1 - keep) * (this.random() * 2 - 1) * 3));
      });
      state.stepIndex++;
    }
    const t = (timeMs % profile.step) / profile.step;
    const eased = t * t * (3 - 2 * t);
    const { previous } = state;
    return state.current.map((value, i) => previous[i]! + (value - previous[i]!) * eased);
  }
}

function channelValue(channel: Channel, walk: number): number {
  return channel.min + ((walk + 1) / 2) * (channel.max - channel.min);
}

function magicBreathing(timeMs: number): number {
  return 1 + 0.1 * Math.sin(timeMs / 700) + 0.05 * Math.sin(timeMs / 230);
}

/**
 * The slow glow of a smouldering surface, lava or a bed of embers: two long swells that never
 * meet in step (about 7 and 3.1 seconds), so the light rises and sinks unevenly, by about a
 * tenth at most, and its bright range breathes a few percent with it. Each light starts at its
 * own point of the swell (`phase`), so pieces of one lava field do not pulse together.
 */
export function smoulder(timeMs: number, phase: number): FlickerSample {
  const t = timeMs / 1000 + phase;
  const swell = 0.65 * Math.sin((2 * Math.PI * t) / 7) + 0.35 * Math.sin((2 * Math.PI * t) / 3.1 + 1.7);
  return { intensity: 1 + 0.09 * swell, radiusScale: 1 + 0.03 * swell };
}

/** A light's own point in a swell, in seconds: the same for its id every time. */
function phaseOf(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 7000) / 1000;
}
