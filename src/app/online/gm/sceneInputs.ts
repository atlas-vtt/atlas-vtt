import {
  MAX_SIGHT_TOKENS, type JsonRecord, type SharedEffect, type SharedFog, type SharedFogOperation, type SharedLightingScene, type SharedSight,
  type SharedVision, type SharedWall, type SightToken,
} from '../protocol/index.ts';
import { validateFogOperation } from '../../fog/fogOperationShape';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { lightList, readEmission } from '../../lighting/lightingObjects';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { lightZoneList } from '../../lighting/lightZones';
import { heldForSight } from '../../lighting/sightOnDrop';
import type { TokenEntity } from '../../types';
import type { FogOperation } from '../../types/fogTypes';
import type { WallSegment } from '../../types/wallTypes';
import { tokenEffects, type SightRules } from '../../vision/sightRules';
import { tokenSenses } from '../../vision/tokenSenses';
import { wallList } from '../../vision/wallList';
import type { SceneState } from './atlasView.ts';
import { roundPlace } from './scenePicture.ts';
import { mapTokens } from '../../tokens/offMap';

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function sharedOperation(operation: FogOperation, id: string): SharedFogOperation {
  const ox = operation.offsetX ?? 0;
  const oy = operation.offsetY ?? 0;
  const erase = operation.isErasing;
  if (operation.type === 'rectangle') return { id, type: 'rectangle', erase, x: operation.x + ox, y: operation.y + oy, width: operation.width, height: operation.height };
  const points = operation.points.flatMap((point) => [point.x + ox, point.y + oy]);
  return operation.type === 'brush' ? { id, type: 'brush', erase, points, radius: operation.brushRadius } : { id, type: 'lasso', erase, points };
}

/**
 * The scene's committed fog as players get it: every operation in the order Atlas replays them
 * (by time, then as stored), with its drag offset applied and the random id `alias` gives its key
 * (so a delta can name it). Null when an operation cannot be read, which covers the whole map for
 * the players as it does in Atlas's own player frame.
 */
export function sharedFog(operations: Readonly<Record<string, FogOperation>>, alias: (key: string) => string): SharedFog {
  try {
    const ordered = Object.entries(operations).map(([key, operation], index) => {
      validateFogOperation(operation);
      return { key, operation, index };
    }).sort((a, b) => a.operation.timestamp - b.operation.timestamp || a.index - b.index);
    return ordered.map(({ key, operation }) => sharedOperation(operation, alias(key)));
  } catch {
    return null;
  }
}

/**
 * A wall as players get it. A secret door is a plain wall while closed and an open door once
 * opened (light and sight read only `closed`); no wall says it is locked.
 */
export function sharedWall(wall: WallSegment): SharedWall {
  const closed = wall.closed ?? true;
  const door = wall.type === 'door' || (wall.type === 'secret-door' && !closed) ? { door: closed ? 'closed' as const : 'open' as const } : {};
  return {
    p: [wall.p1.x, wall.p1.y, wall.p2.x, wall.p2.y], ...door,
    ...(wall.direction && { direction: wall.direction }), ...(wall.blocks && { blocks: wall.blocks }), ...(wall.limited === true && { limited: true as const }),
  };
}

/** The parts of a lit scene that change seldom: its scale, walls, light zones and the senses of its collection. */
export function sharedLightingScene(state: SceneState, rules: SightRules, measurement: MeasurementSettings): SharedLightingScene {
  const { unitDistance, cellSize } = unitScaleOf(measurement, state.grid);
  return {
    cellSize,
    unitDistance,
    walls: wallList(state.objects.walls).map(sharedWall),
    zones: lightZoneList(state.objects.lightZones).map((zone) => ({
      polygon: zone.polygon.flatMap((corner) => [corner.x, corner.y]), ambient: zone.ambient, ...(zone.ambientColor && { colour: zone.ambientColor }),
    })),
    senses: rules.definitions.map((definition): JsonRecord => ({ ...definition })),
  };
}

/** How a vision token perceives, as the GM's sight works it out (`sightSources`). */
function sharedVision(token: TokenEntity & { vision: NonNullable<TokenEntity['vision']> }, rules: SightRules): SharedVision {
  const how = rules.visionOf?.(token) ?? { senses: tokenSenses(token.vision, rules.definitions), ...(token.vision.range !== undefined && { sightRange: token.vision.range }) };
  return {
    senses: how.senses.map(({ id, range }) => ({ id, ...(finite(range) && { range }) })),
    ...(finite(token.vision.angle) && { angle: token.vision.angle }),
    ...(finite(how.sightRange) && { sightRange: how.sightRange }),
    ...(how.pending === true && { pending: true as const }),
  };
}

export interface SightInputs {
  readonly state: SceneState;
  readonly rules: SightRules;
  /** The tokens the players see (`playerRollTokens`), by GM id. */
  readonly shown: ReadonlySet<string>;
  /** The random id players know a token or a placed light by. */
  tokenAlias(id: string): string;
  lightAlias(id: string): string;
}

/**
 * One token as sight and light read it, or null for one players get nothing of: a hidden token,
 * or an unseen one that neither sees nor shines. An unseen token goes out with its place, size,
 * vision, light and blindness only.
 */
function sightToken(token: TokenEntity, inputs: SightInputs): SightToken | null {
  if (token.isHidden === true || !finite(token.x) || !finite(token.y)) return null;
  const seen = inputs.shown.has(token.id);
  const vision = token.vision?.enabled === true ? token.vision : undefined;
  const light = readEmission(token.light);
  if (!seen && vision === undefined && light === null) return null;
  const effects: SharedEffect[] = [...tokenEffects(token, inputs.rules.conditions)].filter((effect) => seen || effect === 'blinded');
  return {
    id: inputs.tokenAlias(token.id),
    x: roundPlace(token.x),
    y: roundPlace(token.y),
    size: finite(token.size) && token.size > 0 ? token.size : 1,
    ...(finite(token.rotation) && { rotation: token.rotation }),
    ...(vision && { vision: sharedVision({ ...token, vision }, inputs.rules) }),
    ...(light && { light: { ...light } }),
    ...(effects.length > 0 && { effects }),
  };
}

/** The parts of a lit scene that change while it is played: its lighting, its lights that are switched on, its tokens and the held ones. */
export function sharedSight(inputs: SightInputs): SharedSight {
  const { state } = inputs;
  const every = Object.values(mapTokens(state.objects)).flatMap((token) => {
    const entry = sightToken(token, inputs);
    return entry === null ? [] : [{ entry, id: token.id }];
  });
  // In the store's order, which sight keeps; past the limit those that see come first.
  const tokens = every.length <= MAX_SIGHT_TOKENS ? every : [...every].sort((a, b) => Number(b.entry.vision !== undefined) - Number(a.entry.vision !== undefined)).slice(0, MAX_SIGHT_TOKENS);
  const sent = new Set(tokens.map(({ id }) => id));
  const held = Object.entries(heldForSight(state)).flatMap(([id, at]) => (sent.has(id) && finite(at.x) && finite(at.y) ? [{ id: inputs.tokenAlias(id), x: roundPlace(at.x), y: roundPlace(at.y) }] : []));
  return {
    lighting: { ...state.lighting },
    lights: lightList(state.objects.lights).filter((light) => light.hidden !== true).map((light) => ({
      id: inputs.lightAlias(light.id), x: light.x, y: light.y, emission: { ...light.emission },
      ...(finite(light.rotation) && { rotation: light.rotation }), ...(finite(light.activeBelowAmbient) && { activeBelowAmbient: light.activeBelowAmbient }),
    })),
    tokens: tokens.map(({ entry }) => entry),
    held,
    // Every vision token hidden: the players' sight is none, not all (`selectSight`).
    ...(!every.some(({ entry }) => entry.vision) && Object.values(mapTokens(state.objects)).some((token) => token.vision?.enabled === true) && { blind: true as const }),
  };
}
