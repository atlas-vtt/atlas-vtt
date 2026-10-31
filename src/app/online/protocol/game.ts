import { isCount, parseAsset, parseAssetProgress, parseVideoAsset, type AssetProgress, type AssetRef } from './asset.ts';
import { isBookType, isPlayerBookType, parseBookCover, parseBookMessage, parseBookTokenMessage, parsePlayerBookMessage, type BookMessage, type BookTokenMessage, type PlayerBookCover, type PlayerBookMessage, type PlayerBookParts } from './book.ts';
import { parseBookRestMessage, type BookRestMessage } from './bookRest.ts';
import { isDeltaOf, parseDelta, parseSeq, type DeltaMessage, type DeltaOf } from './delta.ts';
import { parseFloor, type SharedFloor } from './floor.ts';
import { parseFog, type SharedFog } from './fog.ts';
import { parseImageMessage, type ImageMessage } from './image.ts';
import { parseInitiative, type SharedInitiative } from './initiative.ts';
import { parseLightingScene, parseSight, type SharedLightingScene, type SharedSight } from './lighting.ts';
import { parseLiquids, type SharedLiquid } from './liquids.ts';
import { parseLive, type LiveMessage } from './live.ts';
import type { LogMessage, PlayerLogMessage } from './log.ts';
import { isPlayerLogType, parseLogMessage, parsePlayerLog } from './logParse.ts';
import { parsePlayerRoll, parseRoll, parseRollDice, parseRollRefused, type PlayerRoll, type RollMessage, type RollRefused, type SharedRollDice } from './dice.ts';
import { parseAnnotations, parseDoors, parseGrid, parsePinFound, parsePins, parseSensed, type PlayerPinFound, type SensedMark, type SharedAnnotations, type SharedDoor, type SharedGrid, type SharedPin } from './mapLayers.ts';
import { parseMapPlacement, type SharedMapPlacement } from './mapPlacement.ts';
import { parseMarks, parsePlayerMark, type MarksMessage, type PlayerCursor, type PlayerLaser, type PlayerMeasure } from './marks.ts';
import { isRecord } from './shape.ts';
import { MAX_SCENE_ID, parseDragCancel, parseMoveRefused, parsePlayerMove, parseSnapGrid, type MoveRefused, type PlayerDrag, type PlayerDragCancel, type PlayerMove, type SnapGrid } from './moves.ts';
import { parseRules, type RulesMessage } from './rules.ts';
import { MAX_TOKEN_SIZE, MAX_TOKENS, parseTokens, TOKEN_ID_PATTERN, type SharedToken } from './tokens.ts';
import { parseWidgetBar, type SharedWidgetBar } from './widgets.ts';

/** What the players see of the shared scene; null while nothing is shared. A scene with a map may say where it lies (`SharedMapPlacement`). */
export interface SharedScene extends SharedMapPlacement {
  /** Random per shared scene, so a client can tell a new scene from a resend. */
  readonly id: string;
  /** The map image, drawn at its natural size at (0, 0) unless `stretch` or `fit` say otherwise; null for a scene without one. */
  readonly map: AssetRef | null;
  /**
   * The scene is lit: players see only what the lighting shows them, worked out from the `lighting`
   * and `sight` messages, and nothing until it can be (never the map unlit).
   */
  readonly lit: boolean;
  /** Which floor of a map with several this scene is; none for a map of one floor (and from an older GM). */
  readonly floor?: SharedFloor;
  /**
   * An animated map's video, fetched from the asset host like the map, which stays its poster: a page that plays
   * it shows the poster until it plays and where it cannot. Added later: an older page shows the poster.
   */
  readonly video?: AssetRef;
}

/** Bytes of a message's JSON per part (`part`): their base64 is exactly 256 KiB. */
export const PART_BYTES = 192 * 1024;
/** Parts of one message a client puts together: at most this many, each of at most `PART_BYTES`. */
export const MAX_PARTS = 64;

/** The largest explored memory (a PNG) that goes inline in an `explored` message; a larger one is stored like any asset. */
export const EXPLORED_INLINE_BYTES = 200 * 1024;
/** The first GM level whose explored memories carry the GM's count of removals (`serial`): an older GM's always replace the players'. */
export const EXPLORED_MERGE_GM_LEVEL = 10;
/** The largest count of removals an `explored` message may carry. */
export const MAX_EXPLORED_SERIAL = Number.MAX_SAFE_INTEGER;
const EXPLORED_INLINE_BASE64 = 4 * Math.ceil(EXPLORED_INLINE_BYTES / 3);

export type GmMessage =
  | { readonly t: 'scene'; readonly scene: SharedScene | null }
  /**
   * Every token the players see in the scene `scene`, in drawing order (the last lies on top), the
   * grid's cell size the tokens are sized by (`cell`, world pixels), and the grid a player's own token
   * snaps to when dropped (null: it does not snap). `seq` numbers it for the deltas that follow (`DeltaMessage`).
   */
  | { readonly t: 'tokens'; readonly scene: string; readonly seq?: number; readonly tokens: readonly SharedToken[]; readonly cell: number; readonly snap: SnapGrid | null }
  /**
   * Sent to one player: the ids of the tokens in scene `scene`'s list that are theirs, and by id the
   * dice a roll for one of them is made with where they are not the scene's (`SharedRules.dice`: its
   * character's template names a set of its own). Added later: an older GM names no dice.
   */
  | { readonly t: 'mine'; readonly scene: string; readonly tokens: readonly string[]; readonly dice?: Readonly<Record<string, SharedRollDice>> }
  /** How far the GM's uploads to the asset store have come. */
  | AssetProgress
  /** The committed fog of the scene `scene`; `seq` numbers it for the deltas that follow. */
  | { readonly t: 'fog'; readonly scene: string; readonly seq?: number; readonly fog: SharedFog }
  | ({ readonly t: 'lighting'; readonly scene: string } & SharedLightingScene)
  | ({ readonly t: 'sight'; readonly scene: string; readonly seq?: number } & SharedSight)
  /** The change from the last `tokens`, `sight` or `fog` message to the next. */
  | DeltaMessage
  /** Where the tokens being dragged are now: the fast lane beside the token list, the latest wins. */
  | LiveMessage
  /**
   * The explored memory the GM last saved, a PNG: inline as base64 (`png`, at most
   * `EXPLORED_INLINE_BYTES`), else stored and fetched by its id like any image (`mask`); at most one
   * of the two, and neither is none. `serial` counts the times the GM took memory away from the floor
   * (forgot, erased or undid by hand, switched the memory off, restored a snapshot) and never goes
   * back: a player whose last memory taken in had another replaces theirs with this one; with the
   * same, they keep what they have seen since and add this one, which may be older. Added later (level 10).
   */
  | { readonly t: 'explored'; readonly scene: string; readonly png?: string; readonly mask?: AssetRef; readonly serial?: number }
  /**
   * One piece of a message too large for one frame: `data` is base64 of its JSON text's UTF-8
   * bytes; the pieces of one `id` joined in `index` order are that text.
   */
  | { readonly t: 'part'; readonly id: string; readonly index: number; readonly count: number; readonly data: string }
  /** The water, lava and acid that move on the map of scene `scene`, in drawing order. Added later: an older page shows the still map. */
  | { readonly t: 'liquids'; readonly scene: string; readonly liquids: readonly SharedLiquid[] }
  /** The grid as the players' picture draws it in scene `scene`; null when it shows none. */
  | { readonly t: 'grid'; readonly scene: string; readonly grid: SharedGrid | null }
  /** The badges of the doors the players see now (a lit scene only). */
  | { readonly t: 'doors'; readonly scene: string; readonly doors: readonly SharedDoor[] }
  /** The tokens the players only sense now, as outlines (a lit scene only). */
  | { readonly t: 'sensed'; readonly scene: string; readonly tokens: readonly SensedMark[] }
  /** The readable pins where the players see the map now. */
  | { readonly t: 'pins'; readonly scene: string; readonly pins: readonly SharedPin[] }
  /** The drawings and texts on the map, but those committed fog covers whole. */
  | ({ readonly t: 'annotations'; readonly scene: string } & SharedAnnotations)
  /** The players' initiative list; null while it is not shown. */
  | { readonly t: 'initiative'; readonly scene: string; readonly list: SharedInitiative | null }
  /** The widgets players see, as Atlas's player window shows them; null while it shows none. */
  | { readonly t: 'widgets'; readonly scene: string; readonly bar: SharedWidgetBar | null }
  | MoveRefused
  /** What the player's own tools (measure, laser) work by in scene `scene`. */
  | RulesMessage
  | RollMessage
  | RollRefused
  | MarksMessage
  /** The table's log: chat, rolls, who came and went. It belongs to the table, not to a scene. */
  | LogMessage
  | ImageMessage
  /** A player's own pages besides the table: character, items, notes, pins. It belongs to the table, not to a scene. */
  | BookMessage;

/** A player whose `tokens`, `sight` or `fog` messages no longer follow on (a delta it cannot apply) asks for the whole message. */
export interface PlayerResync {
  readonly t: 'resync';
  readonly scene: string;
  readonly of: DeltaOf;
}

export type PlayerMessage = PlayerResync | PlayerMove | PlayerDrag | PlayerDragCancel | PlayerRoll | PlayerLaser | PlayerMeasure | PlayerCursor | PlayerLogMessage | PlayerBookMessage | PlayerBookParts | PlayerBookCover | BookTokenMessage | BookRestMessage | PlayerPinFound;

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_SCENE_ID;
const isInlinePng = (value: unknown): value is string => typeof value === 'string' && value.length <= EXPLORED_INLINE_BASE64 && value.length % 4 === 0 && BASE64.test(value);
const isBase64Part = (value: unknown): value is string => typeof value === 'string' && value.length <= (PART_BYTES / 3) * 4 && BASE64.test(value);

/** A scene's floor where it is given and well formed; a malformed one is left out, so the scene still shows. */
function sceneExtras(value: Record<string, unknown>): Pick<SharedScene, 'floor'> {
  const floor = parseFloor(value.floor);
  return floor !== undefined ? { floor } : {};
}

/** An animated map's video where it is given and well formed; a malformed one is left out, so the poster still shows. */
function sceneVideo(value: Record<string, unknown>): Pick<SharedScene, 'video'> {
  const video = parseVideoAsset(value.video);
  return video !== null ? { video } : {};
}

function parseScene(value: unknown): SharedScene | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isSceneId(value.id) || typeof value.lit !== 'boolean') return undefined;
  if (value.map === null) return { id: value.id, map: null, lit: value.lit, ...sceneExtras(value) };
  const map = parseAsset(value.map);
  return map === null ? undefined : { id: value.id, map, lit: value.lit, ...sceneExtras(value), ...parseMapPlacement(value), ...sceneVideo(value) };
}

/** A message about the scene's fog or lighting, or null for anything malformed. */
function parseSceneInput(value: Record<string, unknown>, scene: string): GmMessage | null {
  switch (value.t) {
    case 'fog': {
      const fog = parseFog(value.fog);
      const seq = parseSeq(value.seq);
      return fog === undefined || seq === null ? null : { t: 'fog', scene, ...(seq !== undefined && { seq }), fog };
    }
    case 'lighting': {
      const lighting = parseLightingScene(value);
      return lighting === null ? null : { t: 'lighting', scene, ...lighting };
    }
    case 'sight': {
      const sight = parseSight(value);
      const seq = parseSeq(value.seq);
      return sight === null || seq === null ? null : { t: 'sight', scene, ...(seq !== undefined && { seq }), ...sight };
    }
    case 'live':
      return parseLive(value, scene);
    case 'explored': {
      if (value.png !== undefined && !isInlinePng(value.png)) return null;
      if (value.serial !== undefined && !isCount(value.serial, MAX_EXPLORED_SERIAL)) return null;
      const serial = value.serial === undefined ? {} : { serial: value.serial };
      if (value.mask === undefined) return { t: 'explored', scene, ...(value.png === undefined ? {} : { png: value.png }), ...serial };
      const mask = parseAsset(value.mask);
      return mask === null || mask.mime !== 'image/png' || value.png !== undefined ? null : { t: 'explored', scene, mask, ...serial };
    }
    case 'liquids': {
      const liquids = parseLiquids(value.liquids);
      return liquids === null ? null : { t: 'liquids', scene, liquids };
    }
    case 'grid': {
      const grid = parseGrid(value.grid);
      return grid === undefined ? null : { t: 'grid', scene, grid };
    }
    case 'doors': {
      const doors = parseDoors(value.doors);
      return doors === null ? null : { t: 'doors', scene, doors };
    }
    case 'sensed': {
      const tokens = parseSensed(value.tokens);
      return tokens === null ? null : { t: 'sensed', scene, tokens };
    }
    case 'pins': {
      const pins = parsePins(value.pins);
      return pins === null ? null : { t: 'pins', scene, pins };
    }
    case 'annotations': {
      const annotations = parseAnnotations(value);
      return annotations === null ? null : { t: 'annotations', scene, ...annotations };
    }
    case 'initiative': {
      const list = parseInitiative(value.list);
      return list === undefined ? null : { t: 'initiative', scene, list };
    }
    case 'widgets': {
      const bar = parseWidgetBar(value.bar);
      return bar === undefined ? null : { t: 'widgets', scene, bar };
    }
    default:
      return null;
  }
}

/** The dice of a player's tokens by id, only for tokens of `tokens`; entries that do not parse are left out, and so is a malformed whole. */
function parseTokenDice(value: unknown, tokens: readonly string[]): Readonly<Record<string, SharedRollDice>> | undefined {
  if (!isRecord(value) || Object.keys(value).length > MAX_TOKENS) return undefined;
  const entries = tokens.flatMap((id) => {
    const dice = Object.hasOwn(value, id) ? parseRollDice(value[id]) : undefined;
    return dice === undefined ? [] : [[id, dice] as const];
  });
  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** A GM message as the client reads it, or null for anything malformed. */
export function parseGmMessage(value: unknown): GmMessage | null {
  if (!isRecord(value)) return null;
  switch (value.t) {
    case 'scene': {
      const scene = parseScene(value.scene);
      return scene === undefined ? null : { t: 'scene', scene };
    }
    case 'tokens': {
      if (!isSceneId(value.scene)) return null;
      const tokens = parseTokens(value.tokens);
      const snap = parseSnapGrid(value.snap);
      const seq = parseSeq(value.seq);
      const { cell } = value;
      if (tokens === null || snap === undefined || seq === null || typeof cell !== 'number' || !Number.isFinite(cell) || !(cell > 0) || cell > MAX_TOKEN_SIZE) return null;
      return { t: 'tokens', scene: value.scene, ...(seq !== undefined && { seq }), tokens, cell, snap };
    }
    case 'mine': {
      if (typeof value.scene !== 'string' || value.scene.length > MAX_SCENE_ID || !Array.isArray(value.tokens) || value.tokens.length > MAX_TOKENS) return null;
      const tokens = value.tokens.filter((id): id is string => typeof id === 'string' && TOKEN_ID_PATTERN.test(id));
      if (tokens.length !== value.tokens.length) return null;
      const dice = parseTokenDice(value.dice, tokens);
      return { t: 'mine', scene: value.scene, tokens, ...(dice !== undefined && { dice }) };
    }
    case 'asset-progress':
      return parseAssetProgress(value);
    case 'part':
      if (!isSceneId(value.id) || !isCount(value.count, MAX_PARTS) || value.count < 1 || !isCount(value.index, value.count - 1) || !isBase64Part(value.data)) return null;
      return { t: 'part', id: value.id, index: value.index, count: value.count, data: value.data };
    case 'move-refused':
      return parseMoveRefused(value);
    case 'rules':
      return parseRules(value);
    case 'roll':
      return parseRoll(value);
    case 'roll-refused':
      return parseRollRefused(value);
    case 'marks':
      return parseMarks(value);
    case 'delta':
      return parseDelta(value);
    case 'log':
    case 'log-entry':
    case 'log-remove':
    case 'chat-refused':
    case 'people':
      return parseLogMessage(value);
    case 'shown-image':
      return parseImageMessage(value);
    default:
      if (isBookType(value.t)) return parseBookMessage(value);
      return isSceneId(value.scene) ? parseSceneInput(value, value.scene) : null;
  }
}

/** A player message as the GM reads it, or null for anything malformed. */
export function parsePlayerMessage(value: unknown): PlayerMessage | null {
  if (!isRecord(value)) return null;
  if (value.t === 'move' || value.t === 'drag') return parsePlayerMove(value, value.t);
  if (value.t === 'drag-cancel') return parseDragCancel(value);
  if (value.t === 'pin-found') return parsePinFound(value, isSceneId);
  if (value.t === 'roll') return parsePlayerRoll(value);
  if (value.t === 'laser' || value.t === 'measure' || value.t === 'cursor') return parsePlayerMark(value);
  if (isPlayerLogType(value.t)) return parsePlayerLog(value);
  if (isPlayerBookType(value.t)) return parsePlayerBookMessage(value);
  if (value.t === 'book-token') return parseBookTokenMessage(value);
  if (value.t === 'book-rest') return parseBookRestMessage(value);
  if (value.t === 'book-parts') return { t: 'book-parts' };
  if (value.t === 'book-cover') return parseBookCover(value);
  if (value.t === 'resync') return isSceneId(value.scene) && isDeltaOf(value.of) ? { t: 'resync', scene: value.scene, of: value.of } : null;
  return null;
}
