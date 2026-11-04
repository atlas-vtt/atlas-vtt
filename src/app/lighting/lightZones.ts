import type { LightZone, SceneLighting } from '../types/lightingTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { isHexColor } from '../utils/hexColor';
import type { AmbientLight, AmbientZone } from '../vision/sight';
import { hasArea } from '../vision/polygonArea';

/** The corners a zone may have: the engine reads its outline from a list of this length. */
export const MAX_ZONE_CORNERS = 64;
/**
 * The zones a map may have. Every zone is a draw of its own over its area, with every corner
 * read for every texel: 64 zones of 64 corners that each cover a whole 8,192 px map take the
 * graphics card about 1.5 s to draw (measured on an Apple M4 Pro; room-sized zones of a few
 * corners take under a millisecond each), where the 5,000 of a damaged file would stall it.
 */
export const MAX_LIGHT_ZONES = 64;

const lists = new WeakMap<object, LightZone[]>();

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/** A zone as it is read: `id` is its place in the record, which is how the store finds it. */
function readZone(id: string, value: unknown): LightZone | null {
  if (!isRecord(value) || typeof value.ambient !== 'number' || !Number.isFinite(value.ambient)) return null;
  const { polygon } = value;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_ZONE_CORNERS || !polygon.every(isPoint) || !hasArea(polygon)) return null;
  return {
    id,
    kind: 'light-zone',
    polygon,
    ambient: Math.min(1, Math.max(0, value.ambient)),
    ...(typeof value.name === 'string' && value.name !== '' && { name: value.name }),
    ...(isHexColor(value.ambientColor) && { ambientColor: value.ambientColor }),
  };
}

/**
 * The zones of a map in the order they were drawn, as everything reads them: the first
 * `MAX_LIGHT_ZONES` that are zones. One that is no area (a hand edit) or has more corners than
 * the engine reads is passed over, a level outside 0–1 is brought into it and a colour that is
 * not `#rrggbb` dropped. The record itself stays as the file has it, with what a newer Atlas
 * wrote into it and what is passed over here: the next save writes it back. The same list for
 * the same record, so whoever compares lists finds unchanged zones unchanged.
 */
export function lightZoneList(zones: Record<string, LightZone> | undefined): LightZone[] {
  if (!isRecord(zones)) return NONE;
  let list = lists.get(zones);
  if (!list) {
    list = [];
    for (const [id, value] of Object.entries(zones)) {
      const zone = readZone(id, value);
      if (zone) list.push(zone);
      if (list.length === MAX_LIGHT_ZONES) break;
    }
    lists.set(zones, list);
  }
  return list;
}

/** The zones a map file holds, as the store keeps them: the file's record untouched, or none when the file holds something else in their place. */
export function lightZonesFromFile(value: unknown): Record<string, LightZone> | undefined {
  return isRecord(value) ? (value as Record<string, LightZone>) : undefined;
}

const NONE: LightZone[] = [];

/** A scene's lighting as the rules read it: itself, or with its zones when it has any. */
export function withZones<Lighting extends SceneLighting>(lighting: Lighting, zones: readonly AmbientZone[]): Lighting & AmbientLight {
  return zones.length > 0 ? { ...lighting, zones } : lighting;
}
