import { ASSET_CHUNK_BYTES, isCount, isHash, isMaxSide, MAX_ASSET_BYTES, parseAsset, parseAssetVariant, type AssetRef, type AssetVariant } from './asset.ts';
import { isBookType, isPlayerBookType, parseBookMessage, parsePlayerBookMessage, type BookMessage, type PlayerBookMessage, type PlayerBookParts } from './book.ts';
import { isDeltaOf, parseDelta, parseSeq, type DeltaMessage, type DeltaOf } from './delta.ts';
import { parseFog, type SharedFog } from './fog.ts';
import { parseImageMessage, type ImageMessage } from './image.ts';
import { parseInitiative, type SharedInitiative } from './initiative.ts';
import { parseLightingScene, parseSight, type SharedLightingScene, type SharedSight } from './lighting.ts';
import { parseLive, type LiveMessage } from './live.ts';
import type { LogMessage, PlayerLogMessage } from './log.ts';
import { isPlayerLogType, parseLogMessage, parsePlayerLog } from './logParse.ts';
import { parsePlayerRoll, parseRoll, parseRollRefused, type PlayerRoll, type RollMessage, type RollRefused } from './dice.ts';
import { parseAnnotations, parseDoors, parseGrid, parsePinFound, parsePins, parseSensed, type PlayerPinFound, type SensedMark, type SharedAnnotations, type SharedDoor, type SharedGrid, type SharedPin } from './mapLayers.ts';
import { parseMarks, parsePlayerMark, type MarksMessage, type PlayerCursor, type PlayerLaser, type PlayerMeasure } from './marks.ts';
import { isRecord } from './shape.ts';
import { MAX_SCENE_ID, parseDragCancel, parseMoveRefused, parsePlayerMove, parseSnapGrid, type MoveRefused, type PlayerDrag, type PlayerDragCancel, type PlayerMove, type SnapGrid } from './moves.ts';
import { parseRules, type RulesMessage } from './rules.ts';
import { MAX_TOKEN_SIZE, MAX_TOKENS, parseTokens, TOKEN_ID_PATTERN, type SharedToken } from './tokens.ts';
import { parseWidgetBar, type SharedWidgetBar } from './widgets.ts';

/** What the players see of the shared scene; null while nothing is shared. */
export interface SharedScene {
  /** Random per shared scene, so a client can tell a new scene from a resend. */
  readonly id: string;
  /** The map image, drawn at its natural size at (0, 0); null for a scene without one. */
  readonly map: AssetRef | null;
  /**
   * The scene is lit: players see only what the lighting shows them, worked out from the `lighting`
   * and `sight` messages, and nothing until it can be (never the map unlit).
   */
  readonly lit: boolean;
}

/** Parts of one message a client puts together: at most this many, each as large as an asset chunk. */
export const MAX_PARTS = 64;

export type GmMessage =
  | { readonly t: 'scene'; readonly scene: SharedScene | null }
  /**
   * Every token the players see in the scene `scene`, in drawing order (the last lies on top), the
   * grid's cell size the tokens are sized by (`cell`, world pixels), and the grid a player's own token
   * snaps to when dropped (null: it does not snap). `seq` numbers it for the deltas that follow (`DeltaMessage`).
   */
  | { readonly t: 'tokens'; readonly scene: string; readonly seq?: number; readonly tokens: readonly SharedToken[]; readonly cell: number; readonly snap: SnapGrid | null }
  /** Sent to one player: the ids of the tokens in scene `scene`'s list that are theirs. */
  | { readonly t: 'mine'; readonly scene: string; readonly tokens: readonly string[] }
  | { readonly t: 'asset-chunk'; readonly hash: string; readonly index: number; readonly count: number; readonly data: string }
  | { readonly t: 'asset-refused'; readonly hash: string }
  | AssetVariant
  /** The committed fog of the scene `scene`; `seq` numbers it for the deltas that follow. */
  | { readonly t: 'fog'; readonly scene: string; readonly seq?: number; readonly fog: SharedFog }
  | ({ readonly t: 'lighting'; readonly scene: string } & SharedLightingScene)
  | ({ readonly t: 'sight'; readonly scene: string; readonly seq?: number } & SharedSight)
  /** The change from the last `tokens`, `sight` or `fog` message to the next. */
  | DeltaMessage
  /** Where the tokens being dragged are now: the fast lane beside the token list, the latest wins. */
  | LiveMessage
  /** The explored memory the GM last saved, a PNG fetched by hash like the map; null for none. */
  | { readonly t: 'explored'; readonly scene: string; readonly mask: AssetRef | null }
  /**
   * One piece of a message too large for one frame: `data` is base64 of its JSON text's UTF-8
   * bytes; the pieces of one `id` joined in `index` order are that text.
   */
  | { readonly t: 'part'; readonly id: string; readonly index: number; readonly count: number; readonly data: string }
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

/**
 * A player asks for an asset by hash, from chunk `from` on (a download cut short continues where it
 * stopped; 0 when absent). With `maxSide` an image larger than that comes as a scaled copy (`AssetVariant`).
 */
export interface PlayerAssetRequest {
  readonly t: 'asset-request';
  readonly hash: string;
  readonly from?: number;
  readonly maxSide?: number;
}

export type PlayerMessage = PlayerAssetRequest | PlayerResync | PlayerMove | PlayerDrag | PlayerDragCancel | PlayerRoll | PlayerLaser | PlayerMeasure | PlayerCursor | PlayerLogMessage | PlayerBookMessage | PlayerBookParts | PlayerPinFound;

const MAX_CHUNKS = Math.ceil(MAX_ASSET_BYTES / ASSET_CHUNK_BYTES);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_SCENE_ID;
const isBase64Chunk = (value: unknown): value is string => typeof value === 'string' && value.length <= (ASSET_CHUNK_BYTES / 3) * 4 && BASE64.test(value);

function parseScene(value: unknown): SharedScene | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !isSceneId(value.id) || typeof value.lit !== 'boolean') return undefined;
  if (value.map === null) return { id: value.id, map: null, lit: value.lit };
  const map = parseAsset(value.map);
  return map === null ? undefined : { id: value.id, map, lit: value.lit };
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
      if (value.mask === null) return { t: 'explored', scene, mask: null };
      const mask = parseAsset(value.mask);
      return mask === null || mask.mime !== 'image/png' ? null : { t: 'explored', scene, mask };
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
      return tokens.length === value.tokens.length ? { t: 'mine', scene: value.scene, tokens } : null;
    }
    case 'asset-chunk':
      if (!isHash(value.hash) || !isCount(value.count, MAX_CHUNKS) || !isCount(value.index, value.count - 1) || !isBase64Chunk(value.data)) return null;
      return { t: 'asset-chunk', hash: value.hash, index: value.index, count: value.count, data: value.data };
    case 'asset-refused':
      return isHash(value.hash) ? { t: 'asset-refused', hash: value.hash } : null;
    case 'asset-variant':
      return parseAssetVariant(value);
    case 'part':
      if (!isSceneId(value.id) || !isCount(value.count, MAX_PARTS) || value.count < 1 || !isCount(value.index, value.count - 1) || !isBase64Chunk(value.data)) return null;
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
  if (value.t === 'book-parts') return { t: 'book-parts' };
  if (value.t === 'resync') return isSceneId(value.scene) && isDeltaOf(value.of) ? { t: 'resync', scene: value.scene, of: value.of } : null;
  return value.t === 'asset-request' ? parseAssetRequest(value) : null;
}

function parseAssetRequest(value: Record<string, unknown>): PlayerAssetRequest | null {
  if (!isHash(value.hash)) return null;
  if (value.maxSide !== undefined && !isMaxSide(value.maxSide)) return null;
  const maxSide = value.maxSide === undefined ? {} : { maxSide: value.maxSide };
  if (value.from === undefined || value.from === 0) return { t: 'asset-request', hash: value.hash, ...maxSide };
  return isCount(value.from, MAX_CHUNKS - 1) ? { t: 'asset-request', hash: value.hash, from: value.from, ...maxSide } : null;
}
