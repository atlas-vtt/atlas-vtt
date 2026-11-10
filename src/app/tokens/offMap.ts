/**
 * Combatants kept beside the map (`BaseToken.offMap`): tokens of the scene, with their resources,
 * conditions, statblock and initiative entry, that are no part of the map. This module is the one
 * place that says which tokens the map holds: everything that draws, hit-tests, selects, sees,
 * lights, hears, measures, moves with the map or shares the map with players reads the scene's
 * tokens through `mapTokens`; what keeps a combatant (initiative, resources, statblock sync, the
 * DM screen) reads every token through `sceneTokens`. A lint rule (`MAP_TOKEN_READS` in
 * `eslint.config.mjs`) keeps raw `objects.tokens` reads out of the map's code.
 */

/** What tells a token beside the map from one on it. */
export interface OffMapFlag {
  offMap?: true | undefined;
}

/** A scene's objects, as far as its tokens go. */
export interface TokenHolder<T> {
  readonly tokens: Readonly<Record<string, T>>;
}

/** Whether `token` is kept beside the map. Only `true` counts, as written by this version. */
export function isOffMap(token: OffMapFlag | null | undefined): boolean {
  return token?.offMap === true;
}

const onMap = new WeakMap<object, Readonly<Record<string, unknown>>>();

/**
 * The tokens on the map: the scene's tokens without those kept beside it. The scene's own record
 * while none is beside it, and the same record for as long as the scene's is, so a reader that
 * compares records works nothing out while they stay.
 */
export function mapTokens<T extends OffMapFlag>(objects: TokenHolder<T>): Readonly<Record<string, T>> {
  const { tokens } = objects;
  const known = onMap.get(tokens) as Readonly<Record<string, T>> | undefined;
  if (known) return known;
  let kept: Record<string, T> | null = null;
  for (const [id, token] of Object.entries(tokens)) {
    if (!isOffMap(token)) continue;
    kept ??= { ...tokens };
    delete kept[id];
  }
  const result = kept ?? tokens;
  onMap.set(tokens, result);
  return result;
}

/** `ids` without those of combatants beside the map: what a selection may delete, cut or copy. */
export function withoutOffMap(objects: TokenHolder<OffMapFlag>, ids: readonly string[]): string[] {
  return ids.filter((id) => !isOffMap(objects.tokens[id]));
}

/** Every token of the scene, those beside the map included: for what keeps a combatant, never for what shows the map. */
export function sceneTokens<T>(objects: TokenHolder<T>): Readonly<Record<string, T>> {
  return objects.tokens;
}

/** How far apart combatants beside the map are put, in cells. */
const ROW_PITCH = 1.25;

/**
 * Where `count` new combatants are put beside the map, below those already there: a column one
 * cell left of the map image (whose corner is the world's origin), so an older version, which
 * draws them, shows them off to the side and never on the map.
 */
export function offMapPlaces(tokens: Readonly<Record<string, OffMapFlag>>, cellSize: number, count: number): Array<{ x: number; y: number }> {
  const cell = cellSize > 0 ? cellSize : 70;
  const taken = Object.values(tokens).filter(isOffMap).length;
  return Array.from({ length: count }, (_, i) => ({ x: -1.5 * cell, y: cell * (0.5 + ROW_PITCH * (taken + i)) }));
}

/** The part of the world the map image covers. */
export interface MapArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The combatants kept beside the map whose centre lies on the map image: an older Atlas draws
 * them, and the GM moved them onto the map there, which keeps the flag it does not know. A scene
 * that loads takes them as placed (`MapService`), so what was put on the map in that version shows.
 */
export function placedByOlderVersion(tokens: Readonly<Record<string, OffMapFlag & { x: number; y: number }>>, map: MapArea): string[] {
  const inside = (x: number, y: number): boolean => x >= map.x && x <= map.x + map.width && y >= map.y && y <= map.y + map.height;
  return Object.entries(tokens).flatMap(([id, token]) => (isOffMap(token) && inside(token.x, token.y) ? [id] : []));
}
