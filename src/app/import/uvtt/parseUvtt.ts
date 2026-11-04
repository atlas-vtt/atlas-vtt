import { isFiniteNumber, isRecord } from '../../utils/guards';
import { UvttFormatError, isAbsent, own, readColor, readFlag, readList, readNumber, readPoint, readRecord, refuse } from './uvttFields';
import { readImage } from './uvttImage';
import { UVTT_LIMITS, type UvttLight, type UvttMap, type UvttParseResult, type UvttPoint, type UvttPortal } from './uvttTypes';

const count = (value: number): string => value.toLocaleString('en-US');
const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export const UVTT_TOO_LARGE = `The file is larger than ${UVTT_LIMITS.fileBytes / 1024 / 1024} MB.`;
const TOO_MANY_WALLS = `The file has more than ${count(UVTT_LIMITS.wallSegments)} wall segments.`;
const TOO_MANY_LIGHTS = `The file has more than ${count(UVTT_LIMITS.lights)} lights.`;

/** Wall segments and doors a file may still add; counted before anything is read, so a file over the limit costs no reading. */
interface SegmentBudget {
  left: number;
}

function spend(budget: SegmentBudget, segments: number): void {
  budget.left -= segments;
  if (budget.left < 0) refuse(TOO_MANY_WALLS);
}

function readPolylines(value: unknown, what: string, budget: SegmentBudget): UvttPoint[][] {
  return readList(value, `The list of ${what}s`, UVTT_LIMITS.wallSegments, TOO_MANY_WALLS).map((line, index) => {
    const label = `${what} ${index + 1}`;
    if (!Array.isArray(line)) return refuse(`${capitalized(label)} is not a list of positions.`);
    spend(budget, Math.max(0, line.length - 1));
    return line.map((point, pointIndex) => readPoint(point, `Point ${pointIndex + 1} of ${label}`));
  });
}

function readPortal(value: unknown, index: number): UvttPortal {
  const what = `door ${index + 1}`;
  const portal = readRecord(value, capitalized(what));
  const bounds = own(portal, 'bounds');
  if (!Array.isArray(bounds) || bounds.length !== 2) return refuse(`${capitalized(what)} does not have two ends.`);
  return {
    bounds: [readPoint(bounds[0], `The first end of ${what}`), readPoint(bounds[1], `The second end of ${what}`)],
    closed: readFlag(own(portal, 'closed'), true),
  };
}

function readLight(value: unknown, index: number): UvttLight {
  const what = `light ${index + 1}`;
  const light = readRecord(value, capitalized(what));
  const intensity = own(light, 'intensity');
  return {
    position: readPoint(own(light, 'position'), `The position of ${what}`),
    range: readNumber(own(light, 'range'), `The range of ${what}`, 0, UVTT_LIMITS.distance),
    intensity: isFiniteNumber(intensity) && intensity >= 0 ? intensity : 1,
    color: readColor(own(light, 'color')) ?? '#ffffff',
  };
}

/**
 * A file's content with what the import places things by checked: the map's size and origin,
 * every position, each light's range, and the image. What a file states beyond that (its format
 * version, the pixels per cell it was exported at, a door's rotation) is not looked at.
 */
function readMap(root: unknown): UvttMap {
  const file = readRecord(root, 'The file\'s content');
  const resolution = readRecord(own(file, 'resolution'), 'The map\'s resolution');
  const sizeIn = readRecord(own(resolution, 'map_size'), 'The map size');
  const size = {
    x: readNumber(own(sizeIn, 'x'), 'The map\'s width', 1, UVTT_LIMITS.mapCells),
    y: readNumber(own(sizeIn, 'y'), 'The map\'s height', 1, UVTT_LIMITS.mapCells),
  };
  const originIn = own(resolution, 'map_origin');
  const origin = isAbsent(originIn) ? { x: 0, y: 0 } : readPoint(originIn, 'The map\'s origin');

  const budget: SegmentBudget = { left: UVTT_LIMITS.wallSegments };
  const polylines = [...readPolylines(own(file, 'line_of_sight'), 'wall line', budget), ...readPolylines(own(file, 'objects_line_of_sight'), 'object outline', budget)];
  const doors = readList(own(file, 'portals'), 'The list of doors', UVTT_LIMITS.wallSegments, TOO_MANY_WALLS);
  spend(budget, doors.length);
  const portals = doors.map(readPortal);
  const lights = readList(own(file, 'lights'), 'The list of lights', UVTT_LIMITS.lights, TOO_MANY_LIGHTS).map(readLight);

  const environmentIn = own(file, 'environment');
  const environment = isRecord(environmentIn) ? environmentIn : {};
  const ambientLight = readColor(own(environment, 'ambient_light'));
  const bakedLighting = readFlag(own(environment, 'baked_lighting'), false);

  // Last: decoding the image is the costly part, and a refused file needs none of it
  return { origin, size, image: readImage(own(file, 'image')), polylines, portals, lights, ambientLight, bakedLighting };
}

/**
 * Reads the text of a Universal VTT file. Every field the import uses is checked for its type
 * and range, and the counts against `UVTT_LIMITS`; a file that fails a check is refused as a
 * whole. Never throws.
 */
export function parseUvtt(text: string): UvttParseResult {
  if (text.length > UVTT_LIMITS.fileBytes) return { ok: false, problem: UVTT_TOO_LARGE };
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'The file is not a Universal VTT map (it is not valid JSON).' };
  }
  try {
    return { ok: true, map: readMap(root) };
  } catch (error) {
    if (error instanceof UvttFormatError) return { ok: false, problem: error.message };
    console.error('[Atlas] Reading a Universal VTT file failed', error);
    return { ok: false, problem: 'The file could not be read.' };
  }
}
