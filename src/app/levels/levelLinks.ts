/**
 * Stairs and other level links (Foundry's Change Level region): areas that join the levels they
 * stand on. A token put down inside one goes to another of its levels at the same place, as far as
 * the link's direction lets it; inside walked stairs only in their last row (`flightOnLevel`). The
 * one place that decides where a link leads.
 */

import type { LevelLink, LevelLinkDirection } from '../types/sceneLevelTypes';
import type { Point } from '../types/visionTypes';
import { isRecord } from '../utils/guards';
import { hasArea } from '../vision/polygonArea';
import { pointInPolygon } from '../vision/visibility';
import { hasLevels, onLevel, resolveLevel, type SceneLevels } from './sceneLevels';
import { flightEnds, readFlight, type FlightEnds } from './stairFlights';

/** The corners a link may have. */
export const MAX_LINK_CORNERS = 64;
/** The links a map may have: each is drawn and tested on every drop, and a damaged file must not hold thousands. */
export const MAX_LEVEL_LINKS = 256;

const DIRECTIONS: readonly LevelLinkDirection[] = ['up', 'down', 'both'];

const lists = new WeakMap<object, LevelLink[]>();
const NONE: LevelLink[] = [];

function isPoint(value: unknown): value is Point {
  return isRecord(value) && typeof value.x === 'number' && typeof value.y === 'number' && Number.isFinite(value.x) && Number.isFinite(value.y);
}

/**
 * A link as it is read: `id` is its place in the record; a direction it does not know reads as both
 * ways, and a flight it cannot have (`readFlight`) as none.
 */
function readLink(id: string, value: unknown): LevelLink | null {
  if (!isRecord(value)) return null;
  const { polygon, levels, direction } = value;
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > MAX_LINK_CORNERS || !polygon.every(isPoint) || !hasArea(polygon)) return null;
  const set = levels === 'all' ? 'all' : Array.isArray(levels) ? levels.filter((entry): entry is string => typeof entry === 'string') : undefined;
  const flight = readFlight(value.flight, polygon.length);
  return {
    id,
    kind: 'level-link',
    polygon,
    ...(set !== undefined && { levels: set }),
    ...(DIRECTIONS.includes(direction as LevelLinkDirection) && direction !== 'both' && { direction: direction as LevelLinkDirection }),
    ...(flight && { flight }),
  };
}

/**
 * The links of a map in the order they were drawn: the first `MAX_LEVEL_LINKS` that are areas.
 * The record itself stays as the file has it; the same list for the same record.
 */
export function levelLinkList(links: Record<string, LevelLink> | undefined): LevelLink[] {
  if (!isRecord(links)) return NONE;
  let list = lists.get(links);
  if (!list) {
    list = [];
    for (const [id, value] of Object.entries(links)) {
      const link = readLink(id, value);
      if (link) list.push(link);
      if (list.length === MAX_LEVEL_LINKS) break;
    }
    lists.set(links, list);
  }
  return list;
}

/** The links a map file holds, as the store keeps them: the file's record untouched, or none where it holds something else. */
export function levelLinksFromFile(value: unknown): Record<string, LevelLink> | undefined {
  return isRecord(value) ? (value as Record<string, LevelLink>) : undefined;
}

/** The way a link carries tokens; unset is both ways. */
export function linkDirection(link: Pick<LevelLink, 'direction'>): LevelLinkDirection {
  return link.direction ?? 'both';
}

/** The levels a link joins, bottom first. */
export function linkLevels(link: LevelLink, levels: SceneLevels): string[] {
  if (!hasLevels(levels)) return [];
  return levels.filter((level) => onLevel(link, level.id, levels)).map((level) => level.id);
}

/**
 * The levels a link takes a token on level `from` to, bottom first: the others it joins, those above
 * `from` only when it leads up, those below only when it leads down. None from a level it does not
 * stand on, and none in a scene without levels.
 */
export function linkTargets(link: LevelLink, from: string, levels: SceneLevels): string[] {
  if (!hasLevels(levels)) return [];
  const ends = linkLevels(link, levels);
  if (!ends.includes(from)) return [];
  const index = (id: string): number => levels.findIndex((level) => level.id === id);
  const at = index(from);
  const direction = linkDirection(link);
  return ends.filter((id) => id !== from && (direction === 'both' || (direction === 'up' ? index(id) > at : index(id) < at)));
}

/**
 * A walked flight's ends on level `from` (`flightEnds`): null where the link has no flight, or does
 * not join exactly two levels with `from` among them; such a link changes a token's level anywhere inside.
 */
export function flightOnLevel(link: LevelLink, from: string, levels: SceneLevels): FlightEnds | null {
  const { flight } = link;
  if (!flight) return null;
  const ends = linkLevels(link, levels);
  if (ends.length !== 2 || !ends.includes(from)) return null;
  return flightEnds(link.polygon, flight, ends[0] === from);
}

/**
 * The link a token put down at `point` on level `from` takes: the latest drawn that contains the
 * point and leads somewhere; of walked stairs only their last row at the far end (`flightOnLevel`).
 */
export function linkAt(links: readonly LevelLink[], point: Point, from: string, levels: SceneLevels): LevelLink | null {
  for (let i = links.length - 1; i >= 0; i--) {
    const link = links[i]!;
    if (!pointInPolygon(point, link.polygon) || linkTargets(link, from, levels).length === 0) continue;
    const flight = flightOnLevel(link, from, levels);
    if (!flight || pointInPolygon(point, flight.band)) return link;
  }
  return null;
}

/** The edges of walked stairs on level `level` that a walking token may not cross: all but each flight's ground end there. */
export function flightSides(links: readonly LevelLink[], level: string, levels: SceneLevels): [Point, Point][] {
  return links.flatMap((link) => flightOnLevel(link, level, levels)?.closed ?? []);
}

/** What a drop reads of a scene. */
export interface LinkedScene {
  objects: { tokens: Record<string, { level?: string | undefined }>; levelLinks?: Record<string, LevelLink> | undefined };
  levels?: SceneLevels;
}

/** A token put down in a link: the levels it may go to from there. */
export interface LinkLanding {
  tokenId: string;
  targets: string[];
}

/** The tokens of `places` that are put down inside a link, each with the levels it may go to, by the level each stands on now. */
export function linkLandings(scene: LinkedScene, places: readonly ({ id: string } & Point)[]): LinkLanding[] {
  const { levels } = scene;
  if (!hasLevels(levels)) return [];
  const links = levelLinkList(scene.objects.levelLinks);
  if (links.length === 0) return [];
  const landings: LinkLanding[] = [];
  for (const { id, x, y } of places) {
    const token = scene.objects.tokens[id];
    const from = token ? resolveLevel(levels, token.level) : null;
    const link = from === null ? null : linkAt(links, { x, y }, from, levels);
    if (link && from !== null) landings.push({ tokenId: id, targets: linkTargets(link, from, levels) });
  }
  return landings;
}

/** The choice a drop leaves to the GM: the tokens that landed where several levels are offered, and the levels all of them may go to. */
export interface LinkChoice {
  tokenIds: string[];
  targets: string[];
}

/**
 * What a drop leaves to the GM to pick: the tokens of `landings` offered several levels, and the
 * levels every one of them is offered (an elevator's floors), bottom first as `targets` lists them.
 * Null where no token was offered more than one, or no level is offered to all.
 */
export function linkChoice(landings: readonly LinkLanding[]): LinkChoice | null {
  const several = landings.filter((landing) => landing.targets.length > 1);
  if (several.length === 0) return null;
  const targets = several[0]!.targets.filter((id) => several.every((landing) => landing.targets.includes(id)));
  return targets.length > 0 ? { tokenIds: several.map((landing) => landing.tokenId), targets } : null;
}

/** Which way a link leads from level `from`: only up, only down, both ways, or nowhere from there. */
export function linkHeading(link: LevelLink, from: string, levels: SceneLevels): 'up' | 'down' | 'both' | 'none' {
  if (!hasLevels(levels)) return 'none';
  const at = levels.findIndex((level) => level.id === from);
  const targets = linkTargets(link, from, levels).map((id) => levels.findIndex((level) => level.id === id));
  const up = targets.some((index) => index > at);
  const down = targets.some((index) => index < at);
  return up && down ? 'both' : up ? 'up' : down ? 'down' : 'none';
}

/**
 * The level stairs drawn on level `from` lead to at first: the one above it, else the one below;
 * the GM changes it in the stairs' popover. Null in a scene without levels.
 */
export function firstLinkTarget(from: string, levels: SceneLevels): string | null {
  if (!hasLevels(levels)) return null;
  const at = levels.findIndex((level) => level.id === from);
  return levels[at + 1]?.id ?? levels[at - 1]?.id ?? null;
}
