import { normaliseGridOffset } from '../../grid/gridPlacement';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { toGameUnits } from '../../grid/statedDistance';
import { withEmissionValue } from '../../lighting/lightEmissionForm';
import { maxLightRange } from '../../lighting/lightRanges';
import { unitScaleOf } from '../../lighting/lightingUnits';
import type { GridState } from '../../types/gridTypes';
import type { LightEmission, LightSource, SceneLighting } from '../../types/lightingTypes';
import type { WallSegment } from '../../types/wallTypes';
import { clipSegment, isWithin, placeableRect } from './uvttClip';
import type { UvttLight, UvttMap, UvttPoint } from './uvttTypes';

/** Where a file's map goes: onto an image whose cells are `cellSize` world pixels wide, in a collection measuring in `unit`. */
export interface UvttTarget {
  cellSize: number;
  unit: Pick<MeasurementSettings, 'unitType' | 'unitDistance'>;
}

export interface UvttCounts {
  walls: number;
  doors: number;
  lights: number;
}

/** What of a file a scene does not take, for the log. */
export interface UvttSkipped {
  /** Wall segments, doors and lights that lie outside the map (`placeableRect`). */
  outside: number;
  /** Lights without a range, which light nothing. */
  unlit: number;
  /** Portals that are not closed: Dungeondraft's windows, which stop movement and neither light nor sight. */
  windows: number;
}

/** What a file gives a scene, in Atlas' own terms: world pixels for positions, game units for light. */
export interface UvttScene {
  grid: Pick<GridState, 'size' | 'offsetX' | 'offsetY'>;
  walls: Record<string, WallSegment>;
  lights: Record<string, LightSource>;
  lighting: SceneLighting;
  counts: UvttCounts;
  skipped: UvttSkipped;
  /** How many of the file's wall segments, doors and lights lie on the map; none of many means the file's origin is off. */
  onImage: number;
}

/** A scene whose image carries its own light is shown as it is; so is one whose file names no ambient light. */
const DAYLIGHT = 1;

/** How bright a `#rrggbb` colour is, 0 to 1 (Rec. 709 luma), in hundredths. */
function brightnessOf(color: string): number {
  const channel = (start: number): number => parseInt(color.slice(start, start + 2), 16) / 255;
  return Math.round((0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)) * 100) / 100;
}

function emissionOf(light: UvttLight, { unit, cellSize }: UvttTarget): LightEmission {
  // The file's cells are the scene's own, whatever a rules square spans
  const cells = (value: number): number => toGameUnits({ value, unit: 'squares' }, { unitType: unit.unitType, ruleDistance: unit.unitDistance });
  const farthest = maxLightRange(unitScaleOf(unit, { size: cellSize }));
  let emission: LightEmission = { bright: 0, dim: 0, color: light.color, intensity: 1, animation: 'none', kind: 'custom' };
  emission = withEmissionValue(emission, 'dim', cells(light.range), farthest);
  // Half of where the light ends on this map, which may be nearer than the file says
  emission = withEmissionValue(emission, 'bright', emission.dim / 2, farthest);
  return withEmissionValue(emission, 'intensity', light.intensity);
}

/**
 * The walls, doors, lights and lighting of a file as a scene holds them. A position `p` of the
 * file lies at `(p - origin) * cellSize` world pixels, with the image's top-left corner at 0, so
 * the file's grid is the scene's. Each wall line becomes one segment per pair of points, which
 * keep the exact coordinates they share. A closed portal becomes a closed door between its two
 * ends; an open one is a window in Dungeondraft and nothing in Atlas. A light ends at its range,
 * is bright to half of that, and is switched off where the image shows its glow already; one
 * without a range is left out.
 *
 * Nothing is placed farther than one cell from the image: a wall is cut where it leaves that
 * rectangle, and a wall, a door or a light outside it is left out.
 */
export function uvttToScene(map: UvttMap, target: UvttTarget): UvttScene {
  const { cellSize } = target;
  const rect = placeableRect(map.size);
  const fromCorner = (point: UvttPoint): UvttPoint => ({ x: point.x - map.origin.x, y: point.y - map.origin.y });
  const toWorld = (cell: UvttPoint): UvttPoint => ({ x: cell.x * cellSize, y: cell.y * cellSize });
  const walls: Record<string, WallSegment> = {};
  const counts: UvttCounts = { walls: 0, doors: 0, lights: 0 };
  const skipped: UvttSkipped = { outside: 0, unlit: 0, windows: 0 };
  let onImage = 0;
  let segments = 0;

  const addWall = (from: UvttPoint, to: UvttPoint, rest: Pick<WallSegment, 'type' | 'closed' | 'chainId'>): boolean => {
    if (from.x === to.x && from.y === to.y) return false;
    const id = `wall_uvtt_${++segments}`;
    walls[id] = { id, kind: 'wall', p1: toWorld(from), p2: toWorld(to), ...rest };
    return true;
  };

  map.polylines.forEach((line, lineIndex) => {
    const cells = line.map(fromCorner);
    for (let index = 1; index < cells.length; index++) {
      const inside = clipSegment(cells[index - 1]!, cells[index]!, rect);
      if (!inside) {
        skipped.outside++;
        continue;
      }
      onImage++;
      if (addWall(inside[0], inside[1], { type: 'solid', chainId: `chain_uvtt_${lineIndex + 1}` })) counts.walls++;
    }
  });
  for (const portal of map.portals) {
    const [from, to] = [fromCorner(portal.bounds[0]), fromCorner(portal.bounds[1])];
    if (!isWithin(from, rect) || !isWithin(to, rect)) {
      skipped.outside++;
      continue;
    }
    onImage++;
    if (!portal.closed) skipped.windows++;
    else if (addWall(from, to, { type: 'door', closed: true })) counts.doors++;
  }

  const lights: Record<string, LightSource> = {};
  for (const light of map.lights) {
    const position = fromCorner(light.position);
    if (!isWithin(position, rect)) {
      skipped.outside++;
      continue;
    }
    onImage++;
    if (light.range === 0) {
      skipped.unlit++;
      continue;
    }
    const id = `light_uvtt_${++counts.lights}`;
    lights[id] = { id, kind: 'light', ...toWorld(position), emission: emissionOf(light, target), ...(map.bakedLighting && { hidden: true }) };
  }

  const ambient = map.bakedLighting || map.ambientLight === null ? DAYLIGHT : brightnessOf(map.ambientLight);
  return {
    grid: { size: cellSize, ...normaliseGridOffset('square', cellSize, -map.origin.x * cellSize, -map.origin.y * cellSize) },
    walls,
    lights,
    lighting: { enabled: true, ambient },
    counts,
    skipped,
    onImage,
  };
}

/** Sides may differ by this many pixels from what square cells give: an exporter rounds each side to whole pixels. */
const SIDE_TOLERANCE = 2;

/**
 * World pixels one cell of the file spans on its image once that is `image` pixels large, or
 * null when the image does not fit the map size the file states: its cells would not be square,
 * and walls would not lie where the image shows them.
 */
export function uvttCellSize(map: Pick<UvttMap, 'size'>, image: { width: number; height: number }): number | null {
  const cellSize = image.width / map.size.x;
  return Math.abs(cellSize * map.size.y - image.height) <= SIDE_TOLERANCE ? cellSize : null;
}
