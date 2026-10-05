import type { TokenVisionDefaults } from '../types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../types/senseTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { positiveNumber } from '../utils/numberInput';
import { coneAngle } from '../vision/visionCone';
import { parseTokenSenses, readCollectionSenses } from './senseValidation';

interface VisionDefaultsSource {
  getCollectionForMap(mapPath: string): string | null;
  getCollectionSettings(collectionId: string): { defaultTokenVision?: unknown; senses?: unknown; systemPresetId?: string | undefined };
}

/** The fields senses replaced: read only while the default has no list of senses, as on a token. */
const OLD_SENSE_FIELDS = ['darkvision', 'tremorsense'] as const;

/**
 * The usable part of stored default vision, read as the forms read it: distances above 0, a cone
 * angle as `coneAngle` takes it (360 is no cone, so it is dropped), senses as `parseTokenSenses`
 * reads them (with the collection's `definitions`, only senses it knows), anything else (unknown
 * fields, `enabled`) dropped. A list of senses, even an empty one, replaces the old darkvision
 * and tremorsense numbers, as it does on a token (`tokenSenses`). Undefined when nothing is
 * left, since an empty default means new tokens get no vision settings.
 */
export function parseVisionDefaults(raw: unknown, definitions?: readonly SenseDefinition[]): TokenVisionDefaults | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const result: TokenVisionDefaults = {};
  const range = positiveNumber(record.range);
  if (range !== undefined) result.range = range;
  const angle = coneAngle(record.angle);
  if (angle !== undefined) result.angle = angle;
  const senses = parseTokenSenses(record.senses, definitions);
  if (senses?.length) result.senses = senses;
  for (const field of senses ? [] : OLD_SENSE_FIELDS) {
    const value = positiveNumber(record[field]);
    if (value !== undefined) result[field] = value;
  }
  return hasVisionDefaults(result) ? result : undefined;
}

/** `defaults` as it is read: with a list of senses, without the old fields the list replaces. */
function effective(defaults: TokenVisionDefaults | undefined): TokenVisionDefaults {
  if (!defaults?.senses) return defaults ?? {};
  const { darkvision: _darkvision, tremorsense: _tremorsense, ...rest } = defaults;
  return rest;
}

/** Whether `defaults` sets anything new tokens would start with; a list of senses that is empty sets nothing. */
export function hasVisionDefaults(defaults: TokenVisionDefaults | undefined): defaults is TokenVisionDefaults {
  return Object.values(effective(defaults)).some((value) => (Array.isArray(value) ? value.length > 0 : value !== undefined));
}

/** A list of senses as a comparable key, whatever its order. */
function sensesKey(senses: readonly TokenSense[] | undefined): string {
  return (senses ?? []).map((sense) => `${sense.id}=${sense.range ?? ''}`).sort().join('\n');
}

/** Whether two defaults give tokens the same vision; none and empty are the same. */
export function sameVisionDefaults(a: TokenVisionDefaults | undefined, b: TokenVisionDefaults | undefined): boolean {
  const [left, right] = [effective(a), effective(b)];
  return left.range === right.range
    && left.darkvision === right.darkvision
    && left.tremorsense === right.tremorsense
    && left.angle === right.angle
    && sensesKey(left.senses) === sensesKey(right.senses);
}

/**
 * The default vision of the collection that holds `mapPath`, with the senses the collection
 * knows (`collectionSenses`); undefined when it or the map has none.
 */
export function mapVisionDefaults(
  assetService: VisionDefaultsSource,
  mapPath: string | null | undefined,
  presets: readonly SystemPreset[],
): TokenVisionDefaults | undefined {
  const collectionId = mapPath ? assetService.getCollectionForMap(mapPath) : null;
  if (!collectionId) return undefined;
  const settings = assetService.getCollectionSettings(collectionId);
  return parseVisionDefaults(settings.defaultTokenVision, readCollectionSenses(settings, presets));
}
