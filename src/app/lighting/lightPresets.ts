import type { LightEmission, LightKind } from '../types/lightingTypes';
import { coneAngle } from '../vision/visionCone';

export type LightPresetId = Exclude<LightKind, 'custom'>;

/** The colour a darkness source's marker and rings take; its emission has no light to colour. */
export const DARKNESS_COLOR = '#8f7cf0';

export interface LightPreset {
  label: string;
  emission: LightEmission;
}

/**
 * The generic lights, in feet-based game units like the D&D defaults; the magical light is the
 * Light cantrip's 20 and 40 feet. Offered as presets through `GENERIC_LIGHT_PRESETS`.
 */
export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  candle: { label: 'Candle', emission: { bright: 5, dim: 10, color: '#ffb347', intensity: 0.9, animation: 'candle', sourceRadius: 1 } },
  torch: { label: 'Torch', emission: { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch', sourceRadius: 2 } },
  lantern: { label: 'Lantern', emission: { bright: 30, dim: 60, color: '#ffd28a', intensity: 1, animation: 'none', sourceRadius: 1.5 } },
  magical: { label: 'Magical light', emission: { bright: 20, dim: 40, color: '#8fb8ff', intensity: 1, animation: 'magic', sourceRadius: 2.5 } },
  // Magical darkness, three squares wide like the Darkness spell: it swallows light instead of giving any.
  darkness: { label: 'Darkness', emission: { bright: 0, dim: 15, color: DARKNESS_COLOR, intensity: 1, animation: 'none', sourceRadius: 1, darkness: true } },
};

export const LIGHT_PRESET_IDS = Object.keys(LIGHT_PRESETS) as LightPresetId[];

/** Whether two lights shine alike; their kind and the preset they record are not compared. */
export function sameEmission(a: LightEmission, b: LightEmission): boolean {
  return a.bright === b.bright && a.dim === b.dim && a.color.toLowerCase() === b.color.toLowerCase()
    && a.intensity === b.intensity && a.animation === b.animation && (a.sourceRadius ?? 0) === (b.sourceRadius ?? 0)
    && !!a.darkness === !!b.darkness && (a.priority ?? 0) === (b.priority ?? 0) && coneAngle(a.angle) === coneAngle(b.angle);
}

/** The preset an emission is identical to, or null once any field was edited. */
export function presetOf(emission: LightEmission): LightPresetId | null {
  return LIGHT_PRESET_IDS.find((id) => sameEmission(LIGHT_PRESETS[id].emission, emission)) ?? null;
}

/** Every kind of light, in the order they are offered. */
export const LIGHT_KINDS: readonly LightKind[] = [...LIGHT_PRESET_IDS, 'custom'];

/**
 * The light's kind: the one it was given, else the preset it still equals, else custom. A stored
 * kind this version does not know (a newer Atlas, a hand-edited file) counts as none. A source
 * of magical darkness is always a darkness: its marker says what it does.
 */
export function lightKindOf(emission: LightEmission): LightKind {
  if (emission.darkness) return 'darkness';
  const { kind } = emission;
  return kind && LIGHT_KINDS.includes(kind) ? kind : presetOf(emission) ?? 'custom';
}
