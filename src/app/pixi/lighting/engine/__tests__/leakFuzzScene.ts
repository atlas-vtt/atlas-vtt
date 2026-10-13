import { Container, Matrix, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { BUILT_IN_SENSES, GENERIC_SENSES } from '../../../../gameSystems/senses';
import type { MeasurementSettings } from '../../../../grid/measurementFormat';
import type { SenseDefinition } from '../../../../types/senseTypes';
import type { WallSegment } from '../../../../types/wallTypes';
import { darkvision, senseSource } from '../../../../vision/__tests__/senseSources';
import type { SeenSpot } from '../../../../vision/perception';
import type { SenseSource, Sight } from '../../../../vision/sight';
import { sightWedges } from '../../../../vision/sightWedges';
import { blocksFrom, type MapBounds } from '../../../../vision/visibility';
import { SceneSpots, type SceneModel } from '../../../../vision/sceneModel';
import type { LightingEngine } from '../LightingEngine';
import { readRgba } from './gpuTestUtils';
import { distToOutline, insidePolygon, type FuzzRoom, type P } from './fuzzRooms';

/** What the leak fuzz builds its scenes from and reads its pictures with. */

/** Vision tokens that perceive nothing: nothing of the map is shown but the footprints. */
export const NO_SIGHT: Sight = { all: false, regions: [] };
/** Token sizes whose footprints are 31, 93 and 217 px in radius on a 70 px grid. */
const SIZES = [1, 2, 4];
const MEASUREMENT = (): MeasurementSettings => ({ unitDistance: 5 }) as MeasurementSettings;

/**
 * Footprints of party tokens inside the room, as the lighting view hands them to the engine
 * (`SceneSpots`, the production path: breaking its clipping fails the fuzz): at a wall (8, 2 and 0.5 px from
 * it), in corners (0.5 and 8 px from the corner), at the middle of a closed door if the room has
 * one, and where the lights stand; in the three sizes in turn. Like the lights, a token stands
 * only where every one-way wall of the room blocks: from its other side a one-way wall lets
 * sight out of the room by its own rule (an arm of a star-shaped room can lie there).
 */
export function footprints(room: FuzzRoom, outline: readonly P[], walls: readonly WallSegment[], rand: () => number): SeenSpot[] {
  const centre: P = [outline.reduce((sum, p) => sum + p[0], 0) / outline.length, outline.reduce((sum, p) => sum + p[1], 0) / outline.length];
  const inward = (p: P, by: number): P => {
    const d = Math.hypot(centre[0] - p[0], centre[1] - p[1]) || 1;
    return [p[0] + ((centre[0] - p[0]) / d) * by, p[1] + ((centre[1] - p[1]) / d) * by];
  };
  const corners = room.outline;
  const onWall = (): P => {
    const i = Math.floor(rand() * corners.length), f = 0.2 + rand() * 0.6, a = corners[i]!, b = corners[(i + 1) % corners.length]!;
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  };
  const door = room.walls.slice(0, room.roomWallCount).find((wall) => wall.type === 'door');
  const places: P[] = [
    inward(onWall(), 8), inward(onWall(), 2), inward(onWall(), 0.5),
    inward(corners[Math.floor(rand() * corners.length)]!, 0.5), inward(corners[Math.floor(rand() * corners.length)]!, 8),
    ...(door ? [inward([(door.p1.x + door.p2.x) / 2, (door.p1.y + door.p2.y) / 2], 1)] : []),
    ...room.lights,
  ];
  const oneWay = room.walls.filter((wall) => wall.direction);
  const kept = places.filter((p) => insidePolygon(p, outline) && oneWay.every((wall) => blocksFrom(wall, { x: p[0], y: p[1] })));
  const tokens = Object.fromEntries(kept.map(([x, y], i) => [`p${i}`, { id: `p${i}`, kind: 'token', imagePath: '', x, y, size: SIZES[i % SIZES.length]!, vision: { enabled: true } }]));
  const model: SceneModel = { walls, lights: [], reaches: [], sight: NO_SIGHT, explored: null, zones: [], ambient: { ambient: 0 } };
  return new SceneSpots().update(model, { objects: { tokens, walls: {}, lights: {} }, lighting: { enabled: true, ambient: 0 }, grid: null, heldTokens: {} } as unknown as Parameters<SceneSpots['update']>[1], MEASUREMENT);
}

/** A point outside the room, 60 px or more from its walls, for a token that looks at the room from outside. */
export function outsideOf(room: FuzzRoom, outline: readonly P[], bounds: MapBounds, rand: () => number): P | null {
  for (let attempt = 0; attempt < 40; attempt++) {
    const angle = rand() * Math.PI * 2;
    const reach = 250 + rand() * 500;
    const p: P = [room.centre[0] + Math.cos(angle) * reach, room.centre[1] + Math.sin(angle) * reach];
    if (p[0] < 20 || p[1] < 20 || p[0] > bounds.width - 20 || p[1] > bounds.height - 20) continue;
    if (!insidePolygon(p, outline) && distToOutline(p, outline) > 60) return p;
  }
  return null;
}

/**
 * Whether `p` lies where the picture softens a shadow of `sight`: in the wedge that opens from a
 * wall's corner along the shadow's edge, on the side that is seen (`sightWedges`). There the
 * rule counts the point as seen and the picture shows it from fully to not at all.
 */
export function inPenumbra(p: P, sight: Sight, radius: number): boolean {
  return sight.regions.some((region) => !!region.polygon && sightWedges(region.origin, region.polygon, radius, region.apex).some(({ a, e, side, phi }) => {
    const vx = p[0] - a.x, vy = p[1] - a.y;
    const turn = Math.atan2(e.x * vy - e.y * vx, e.x * vx + e.y * vy) * side;
    return turn >= -0.02 && turn <= phi + 0.02;
  }));
}

const sense = (id: string): SenseDefinition => [...GENERIC_SENSES, ...Object.values(BUILT_IN_SENSES).flat()].find((candidate) => candidate.id === id)!;
/** The senses with line of sight that draw the map, in every channel: one set per room in turn. */
export const SENSE_SETS: SenseSource[][] = [
  [darkvision(4000)],
  [senseSource('blindsight', 4000), senseSource('low-light-vision', 4000)],
  [senseSource('truesight', 4000)],
  [{ definition: sense('pathfinder2e-greater-darkvision'), range: 4000 }, { definition: sense('dnd5e-devils-sight'), range: 4000 }],
  [{ definition: sense('ose-infravision'), range: 4000 }, { definition: sense('dnd5e-darkvision'), range: 4000 }],
];

export interface Report {
  rooms: number;
  /** Rooms with a closed door, with one-way walls, with two lights among their outline. */
  doors: number;
  oneWay: number;
  twoLights: number;
  checked: number;
  leaks: number;
  sightChecked: number;
  sightLeaks: number;
  /** Pixels past the walls shown by a sense that perceives without light. */
  senseLeaks: number;
  /** Pixels inside the room that only such a sense shows: beyond every light's reach, without bounce. */
  senseInside: number;
  /** Token footprints drawn, and the pixels past the walls and inside the room they showed. */
  spots: number;
  spotLeaks: number;
  spotInside: number;
  litInside: number;
  /** Lit pixels inside the room beyond every light's reach: only bounce lights them. */
  bounceInside: number;
  /** Rooms with a source of magical darkness, in daylight with every light on. */
  darkRooms: number;
  /** Pixels past the walls of such a room that differ from the same room without the darkness. */
  darkLeaks: number;
  /** Pixels in plain view of the darkness source, well within its radius, and those of them that show more than its veil. */
  darkInside: number;
  darkRevealed: number;
  /** Of those pixels, the ones in rooms whose senses do not see in magical darkness, and those of them a sense shows all the same. */
  senseDarkInside: number;
  senseDarkRevealed: number;
  /** Rooms whose lights shone as beams too, the pixels inside the room those lit, and the lit ones past its walls. */
  beamRooms: number;
  beamInside: number;
  beamLeaks: number;
}

/** A white map under the lighting layer, seen through a camera at `scale` offset by (x, y). */
export function renderView(renderer: WebGLRenderer, engine: LightingEngine, target: RenderTexture, bounds: MapBounds, scale: number, x: number, y: number): Uint8ClampedArray {
  const stage = new Container();
  const map = new Sprite(Texture.WHITE);
  map.setSize(bounds.width, bounds.height);
  const world = new Container();
  world.addChild(map, engine.layer);
  world.scale.set(scale);
  world.position.set(x, y);
  stage.addChild(world);
  try {
    engine.setView(new Matrix(scale, 0, 0, scale, x, y).invert(), scale);
    renderer.render({ container: stage, target, clear: true });
    return readRgba(renderer, target);
  } finally {
    world.removeChild(engine.layer);
    stage.destroy({ children: true });
  }
}
