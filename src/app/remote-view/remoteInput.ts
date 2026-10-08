/**
 * What a remote view takes from its owner, checked whole before anything is written: a malformed
 * input throws and changes nothing. Numbers that reach the viewport or the ruler must be finite
 * and in range; text stays text.
 */
import { frozenCopy } from '../../api/frozen';
import type { RemoteMeasurementInput, RemotePlayerState, RemoteSceneInput } from '../../api/types/remoteViews';
import { gridProblem } from '../grid/gridLimits';
import { isValidConeAngle, type MeasurementSettings } from '../grid/measurementFormat';

/** The largest map side a remote scene may have, in world pixels. */
export const MAX_REMOTE_MAP_SIDE = 100_000;
/**
 * The most fog operations a remote scene shows. Fog since #300 is one clipped coverage, replayed whole on most changes
 * (about 15 s for 2,000 operations in tests); a scene with more shows fully covered fog instead (`RemoteView.setScene`).
 */
export const REMOTE_FOG_OPS_MAX = 2000;
/** The most fog points (brush and lasso) a remote scene shows in all: each is quantised and clipped on a replay. */
export const REMOTE_FOG_POINTS_MAX = 200_000;
/** The most points one fog operation may have in a remote scene. */
export const REMOTE_FOG_OP_POINTS_MAX = 10_000;

/** The radius a fog brush may have: the map's longer side, or the largest side a remote map may have while its size is unknown. */
function brushRadiusMax(background: RemoteSceneInput['background']): number {
  const side = Math.max(background.width, background.height);
  return side > 0 ? side : MAX_REMOTE_MAP_SIDE;
}

/**
 * Whether the scene's fog is more than a remote view works out: more than `REMOTE_FOG_OPS_MAX` operations, more than
 * `REMOTE_FOG_POINTS_MAX` points in all or `REMOTE_FOG_OP_POINTS_MAX` in one operation, or a brush wider than the map.
 * Such fog fails closed (`RemoteView.setScene`): it covers the whole map. Reads only counts and radii, never a point,
 * and stops at the first limit passed; a record that cannot be read counts as too large.
 */
export function isFogTooLarge(scene: Pick<RemoteSceneInput, 'objects' | 'background'>): boolean {
  const operations = Object.values(scene.objects.fog);
  if (operations.length > REMOTE_FOG_OPS_MAX) return true;
  const radiusMax = brushRadiusMax(scene.background);
  let total = 0;
  try {
    for (const operation of operations) {
      const { points, brushRadius } = operation as { points?: unknown; brushRadius?: unknown };
      const count = Array.isArray(points) ? points.length : 0;
      total += count;
      if (count > REMOTE_FOG_OP_POINTS_MAX || total > REMOTE_FOG_POINTS_MAX) return true;
      if (typeof brushRadius === 'number' && brushRadius > radiusMax) return true;
    }
  } catch {
    return true;
  }
  return false;
}

const MODES: readonly unknown[] = ['metric', 'abstract'];
const UNITS: readonly unknown[] = ['feet', 'yards', 'meters', 'units', 'custom'];
const DIAGONALS: readonly unknown[] = ['equidistant', 'alternating', 'euclidean'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isSide = (value: unknown): boolean => isFiniteNumber(value) && value >= 0 && value <= MAX_REMOTE_MAP_SIDE;
/** An image a remote view may load: never a path, which would read the player's own vault. */
export const isRemoteImageUrl = (value: unknown): value is string => typeof value === 'string' && /^(?:blob:|data:|https:)/i.test(value);
const isUrl = (value: unknown): boolean => value === null || isRemoteImageUrl(value);

function fail(method: string, what: string): never {
  throw new Error(`[Atlas API] RemoteView.${method}: ${what}.`);
}

/** `value`'s own entries in a new object, each read once; ids such as "__proto__" stay own properties. */
function ownEntries(value: unknown): Record<string, unknown> | null {
  if (!isObject(value)) return null;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) Object.defineProperty(copy, key, { value: entry, enumerable: true, writable: true, configurable: true });
  return copy;
}

/**
 * The scene's parts, each read once, so neither a getter nor a later change gets past the checks: the background, the
 * token image URLs and the grid are copied; the records are kept by reference and copied (frozen) when shown.
 */
function takenScene(scene: Record<string, unknown>): Record<string, unknown> {
  const { background, grid, objects, widgets, tokenImages, initiative } = scene;
  const kinds = ownEntries(objects);
  const records = kinds && Object.fromEntries(OBJECT_KINDS.map((kind) => [kind, ownEntries(kinds[kind])]));
  return {
    background: isObject(background) ? { url: background.url, width: background.width, height: background.height } : null,
    grid: isObject(grid) ? frozenCopy(grid) : grid,
    objects: records,
    tokenImages: ownEntries(tokenImages),
    widgets: isObject(widgets) ? { settings: widgets.settings, values: widgets.values } : null,
    initiative,
  };
}

const OBJECT_KINDS = ['tokens', 'texts', 'drawings', 'fog'] as const;
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The scene, read once and checked; the result holds no getter of the caller's. */
export function checkedScene(input: unknown): RemoteSceneInput | null {
  if (input === null) return null;
  if (!isObject(input)) fail('setScene', 'the scene must be a RemoteSceneInput, or null');
  let scene: Record<string, unknown>;
  try {
    scene = takenScene(input);
  } catch (error) {
    fail('setScene', `the scene could not be read (${message(error)})`);
  }
  const objects = scene.objects as Record<string, unknown> | null;
  const widgets = scene.widgets as Record<string, unknown> | null;
  const shaped = isObject(scene.background) && objects !== null && OBJECT_KINDS.every((kind) => objects[kind] !== null)
    && widgets !== null && isObject(widgets.settings) && isObject(widgets.values) && scene.tokenImages !== null && isObject(scene.initiative);
  if (!shaped) fail('setScene', 'the scene must be a RemoteSceneInput, or null');
  const background = scene.background as Record<string, unknown>;
  const tokenImages = scene.tokenImages as Record<string, unknown>;
  if (!isUrl(background.url)) fail('setScene', '"background.url" must be a blob:, data: or https: URL, or null');
  if (!isSide(background.width) || !isSide(background.height)) {
    fail('setScene', `"background.width" and "background.height" must be numbers from 0 to ${MAX_REMOTE_MAP_SIDE}`);
  }
  if (!Object.values(tokenImages).every(isUrl)) fail('setScene', 'every "tokenImages" value must be a blob:, data: or https: URL, or null');
  const gridError = scene.grid === null ? null : gridProblem(scene.grid, { width: background.width as number, height: background.height as number });
  if (gridError) fail('setScene', gridError);
  return scene as unknown as RemoteSceneInput;
}

function isMeasurement(value: unknown): value is RemoteMeasurementInput {
  return isObject(value) && MODES.includes(value.mode) && UNITS.includes(value.unitType) && DIAGONALS.includes(value.diagonalRule)
    && isFiniteNumber(value.unitDistance) && value.unitDistance > 0 && isValidConeAngle(value.coneAngle)
    && (value.ruleDistance === undefined || (isFiniteNumber(value.ruleDistance) && value.ruleDistance > 0))
    && Array.isArray(value.rangeBands) && value.rangeBands.every((band) => isObject(band) && typeof band.name === 'string' && isFiniteNumber(band.maxSquares));
}

const isDefinition = (value: unknown): boolean => isObject(value) && typeof value.key === 'string' && typeof value.visibleToPlayers === 'boolean';
const isCondition = (value: unknown): boolean => isObject(value) && typeof value.id === 'string' && typeof value.name === 'string';
const isHealth = (value: unknown): boolean => isObject(value) && isFiniteNumber(value.value) && isFiniteNumber(value.max);

/** The player's state, copied (deep, frozen) and then checked, so nothing the caller changes afterwards gets past the checks. */
export function checkedPlayer(input: unknown): RemotePlayerState & { measurement: MeasurementSettings } {
  let state: unknown;
  try {
    state = structuredClone(input);
  } catch (error) {
    fail('setPlayer', `the state could not be copied (${message(error)})`);
  }
  if (!isObject(state) || !isObject(state.tokenUi) || !isObject(state.initiative)) fail('setPlayer', 'the state must be a RemotePlayerState');
  const { movableTokenIds, measurement, tokenUi, initiative } = state;
  if (!Array.isArray(movableTokenIds) || !movableTokenIds.every((id) => typeof id === 'string')) fail('setPlayer', '"movableTokenIds" must be a list of token ids');
  if (!isMeasurement(measurement)) fail('setPlayer', '"measurement" must be MeasurementSettings with a distance above 0 and a cone of 1 to 360 degrees');
  if (!Array.isArray(tokenUi.conditions) || !tokenUi.conditions.every(isCondition)) fail('setPlayer', '"tokenUi.conditions" must be condition definitions');
  const resources = tokenUi.resources;
  if (!isObject(resources) || !Object.values(resources).every((list) => Array.isArray(list) && list.every(isDefinition))) {
    fail('setPlayer', '"tokenUi.resources" must list resource definitions by token id');
  }
  if (initiative.rules !== null && !isObject(initiative.rules)) fail('setPlayer', '"initiative.rules" must be InitiativeRules or null');
  if (!isObject(initiative.health) || !Object.values(initiative.health).every(isHealth)) fail('setPlayer', '"initiative.health" values must be { value, max } numbers');
  // An extension written before `ruleDistance` existed measures squares like cells.
  const settings: MeasurementSettings = { ...measurement, ruleDistance: measurement.ruleDistance ?? measurement.unitDistance };
  return frozenCopy({ ...(state as unknown as RemotePlayerState), measurement: settings });
}
