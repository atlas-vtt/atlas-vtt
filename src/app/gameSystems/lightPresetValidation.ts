/**
 * Reads light presets from stored data (a user preset, a collection's settings). The data can
 * be edited by hand or written by another Atlas version, so every field is checked.
 */

import { LIGHT_KINDS } from '../lighting/lightPresets';
import { isRecord } from '../utils/guards';
import type { LightPresetDefinition, LightPresetUnit } from '../types/lightPresetTypes';
import type { LightAnimation } from '../types/lightingTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { isHexColor } from '../utils/hexColor';
import { coneAngle } from '../vision/visionCone';
import { collectionLightPresets } from './lightPresetRules';

const ANIMATIONS: readonly LightAnimation[] = ['none', 'torch', 'candle', 'pulse', 'magic'];
const UNITS: readonly LightPresetUnit[] = ['feet', 'yards', 'meters', 'squares'];
/** The ranges the light popover's sliders give intensity and softness. */
const MAX_INTENSITY = 2;
const MAX_SOURCE_RADIUS = 5;

function oneOf<T extends string>(options: readonly T[], value: unknown, fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** A finite number of at least 0 and at most `max`; undefined for anything that is no number. */
function within(value: unknown, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, value)) : undefined;
}

/**
 * A stored light preset, or null without an id, a name or a reach (a dim radius above 0). Every
 * other field that cannot be used is repaired: distances without a known unit are the
 * collection's own, bright never ends past dim, an unknown colour is white, an unknown flicker
 * steady, an unknown kind the plain marker; intensity and softness stay in their ranges and are
 * left out when they are no numbers. How far a light may reach depends on the map, so the
 * distances are limited where the preset is offered (`lightPresetsOnMap`).
 */
function parseLightPreset(raw: unknown): LightPresetDefinition | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || raw.id.trim() === '' || typeof raw.name !== 'string' || raw.name.trim() === '') return null;
  const dim = within(raw.dim, Infinity);
  if (dim === undefined || dim === 0) return null;
  const sourceRadius = within(raw.sourceRadius, MAX_SOURCE_RADIUS);
  const intensity = within(raw.intensity, MAX_INTENSITY);
  const unit = oneOf<LightPresetUnit | ''>(UNITS, raw.unit, '');
  const angle = coneAngle(raw.angle);
  return {
    id: raw.id,
    name: raw.name.trim(),
    ...(unit !== '' && { unit }),
    bright: Math.min(dim, within(raw.bright, Infinity) ?? 0),
    dim,
    color: isHexColor(raw.color) ? raw.color.toLowerCase() : '#ffffff',
    animation: oneOf(ANIMATIONS, raw.animation, 'none'),
    kind: oneOf(LIGHT_KINDS, raw.kind, 'custom'),
    ...(sourceRadius !== undefined && { sourceRadius }),
    ...(intensity !== undefined && { intensity }),
    ...(angle !== undefined && { angle }),
    ...(raw.darkness === true && { darkness: true }),
    ...(typeof raw.priority === 'number' && Number.isFinite(raw.priority) && raw.priority !== 0 && { priority: raw.priority }),
  };
}

/** Every usable light preset in `raw`, the first one kept when ids repeat; undefined when `raw` is no list. */
export function parseLightPresets(raw: unknown): LightPresetDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const ids = new Set<string>();
  return raw.flatMap((entry) => {
    const light = parseLightPreset(entry);
    if (!light || ids.has(light.id)) return [];
    ids.add(light.id);
    return [light];
  });
}

/**
 * The lights of a collection from its stored settings: its own as far as they can be used
 * (`parseLightPresets`), else its preset's, else the generic ones (`collectionLightPresets`).
 */
export function readCollectionLightPresets(
  settings: { lightPresets?: unknown; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): readonly LightPresetDefinition[] {
  return collectionLightPresets({ lightPresets: parseLightPresets(settings.lightPresets), systemPresetId: settings.systemPresetId }, presets);
}
