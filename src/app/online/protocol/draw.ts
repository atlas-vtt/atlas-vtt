import { DRAWING_DASHES, DRAWING_ENDS, DRAWING_FILLS } from './annotations.ts';
import { MAX_SCENE_ID } from './moves.ts';
import { isRecord } from './shape.ts';
import { COLOUR_PATTERN, MAX_COORDINATE } from './tokens.ts';

/** The level of a GM that takes drawings and texts from players while it lets them draw (`SharedRules.draw`), and tells each player which are theirs (`draw-mine`). */
export const PLAYERS_DRAW_GM_LEVEL = 14;
/** The most drawings one player has on one level of a scene. */
export const MAX_PLAYER_DRAWINGS = 200;
/** The most points all of one player's drawings on one level have together. */
export const MAX_PLAYER_DRAWING_POINTS = 20_000;
/** The most texts one player has on one level of a scene. */
export const MAX_PLAYER_TEXTS = 50;
/** The most points one drawing a player makes may have. */
export const MAX_PLAYER_STROKE_POINTS = 2_000;
/** The most numbers (x, y pairs) one of a player's drawing messages carries: about what one frame holds. */
export const MAX_DRAW_NUMBERS = 480;
/** The most corners a line a player fills may have; it must end where it began and may not cross itself. */
export const MAX_PLAYER_FILL_CORNERS = 64;
/** The most points a player's see-through line may have, a curve's clicked points counting four each: such ink is worked out as one outline, which costs by the points. */
export const MAX_PLAYER_SEE_THROUGH_POINTS = 64;
/** The most points a player's eraser tells its sweep in. */
export const MAX_SWEEP_POINTS = 120;
/** The longest text a player writes on the map. */
export const MAX_PLAYER_TEXT_LENGTH = 500;
/** The most of a player's own drawings and texts one message names. */
export const MAX_DRAW_IDS = MAX_PLAYER_DRAWINGS + MAX_PLAYER_TEXTS;
/** The highest number a player counts their requests to. */
export const MAX_DRAW_REQUEST = 1_000_000_000;
/** The longest span a drawing under way tells, in ms. */
export const MAX_STROKE_SPAN_MS = 1000;
/** The id a player's own drawing or text is told by: short, and the player's alone. */
export const DRAW_ID_PATTERN = /^[0-9a-z]{1,8}$/;

export const DRAW_SHAPE_MODES = ['pen', 'line', 'rectangle', 'ellipse'] as const;
export const DRAW_SIZE_NAMES = ['s', 'm', 'l', 'xl'] as const;
export const DRAW_FONT_NAMES = ['medieval', 'scifi', 'mono'] as const;
export const DRAW_TEXT_LOOKS = ['outline', 'plate', 'plain'] as const;

export type DrawShapeMode = (typeof DRAW_SHAPE_MODES)[number];
export type DrawSizeName = (typeof DRAW_SIZE_NAMES)[number];
type Dash = (typeof DRAWING_DASHES)[number];
type Ends = (typeof DRAWING_ENDS)[number];
type Fill = (typeof DRAWING_FILLS)[number];

/**
 * The look a player's drawing is made in, in the Draw tool's own words: a colour and a named size
 * (a share of the map's cell, which the GM works out), and what the tool's switches say. The GM
 * makes the drawing from these as its own tool would, so no width or opacity is a player's to name.
 */
export interface DrawLook {
  readonly colour: string;
  readonly size: DrawSizeName;
  readonly seeThrough?: true;
  readonly dash?: Dash;
  readonly ends?: Ends;
  readonly curved?: true;
  readonly fill?: Fill;
}

/** The look a player's text is written in, in the Draw tool's own words. */
export interface DrawTextLook {
  readonly colour: string;
  readonly size: DrawSizeName;
  readonly font: (typeof DRAW_FONT_NAMES)[number];
  readonly look: (typeof DRAW_TEXT_LOOKS)[number];
}

/** One pick of the Draw tool's bars, for drawings and texts that are there: exactly one of these. */
export type DrawStylePick =
  | { readonly colour: string }
  | { readonly size: DrawSizeName }
  | { readonly seeThrough: boolean }
  | { readonly dash: Dash | null }
  | { readonly ends: Ends | null }
  | { readonly curved: boolean }
  | { readonly fill: Fill | null }
  | { readonly font: DrawTextLook['font'] }
  | { readonly look: DrawTextLook['look'] };

/** The plane mapped as `x' = a·x + c·y + tx`, `y' = b·x + d·y + ty`, and the degrees it turns what it maps: a move, a turn, a scaling. */
export type DrawMap = readonly [a: number, b: number, c: number, d: number, tx: number, ty: number, turn: number];

/** What every request of a player's Draw tool says: the scene it is made in, and its number among the player's requests, which only grows. */
interface DrawRequest {
  readonly scene: string;
  readonly n: number;
}

/**
 * The drawing a player is making, as it stands: what the gesture has made so far (`mode`, its
 * points flat, `closed` for a line that ends where it began) in the look it will have. A pen's
 * stroke only grows, so it tells the points it has come to since an earlier message: `from` is how
 * many lie before the first of `pts`, `span` the time in whole milliseconds from the last point the
 * message before told to the last of this one. `mode` null: the player draws nothing now. `n` is
 * the number of the request that makes the drawing, if it is made.
 */
export type PlayerStroke = { readonly t: 'stroke'; readonly mode: DrawShapeMode | null; readonly pts: readonly number[]; readonly closed?: true; readonly from?: number; readonly span?: number; readonly look?: DrawLook } & DrawRequest;

/** Points of a drawing with more of them than one message holds, sent ahead of the request `n` they belong to: `from` is how many were sent before these. */
export type PlayerDrawPoints = { readonly t: 'draw-points'; readonly from: number; readonly pts: readonly number[] } & DrawRequest;

/** A player made a drawing: what the gesture made (as `PlayerStroke`), in its look. `from` counts the points sent ahead (`draw-points`). */
export type PlayerDrawAdd = { readonly t: 'draw-add'; readonly mode: DrawShapeMode; readonly pts: readonly number[]; readonly closed?: true; readonly from?: number; readonly look: DrawLook } & DrawRequest;

/** A player wrote a text, centred on (x, y): its words, the width they wrap at (`wrap`) with where its lines then break (`breaks`), and its look. */
export type PlayerDrawText = { readonly t: 'draw-text'; readonly x: number; readonly y: number; readonly text: string; readonly wrap?: number; readonly breaks?: readonly number[]; readonly look: DrawTextLook } & DrawRequest;

/** A line's points set anew (one drawing): its points flat, and of a curve the points it was clicked with. `from` counts the points sent ahead. */
export interface DrawLinePlace {
  readonly pts: readonly number[];
  readonly from?: number;
  readonly anchors?: readonly number[];
}

/** A text set anew (one text): where its centre lies now, and whichever of its words, its width and its lines' breaks are others. */
export interface DrawWordsPlace {
  readonly x: number;
  readonly y: number;
  readonly text?: string;
  readonly wrap?: number;
  readonly breaks?: readonly number[];
}

/**
 * A player changes drawings and texts of their own (`ids`, as `draw-mine` named them), in exactly
 * one way: all of them moved, turned or scaled as one (`map`), all of them given one pick of the
 * tool's bars (`style`), or one of them set anew (`line`, `words`).
 */
export type PlayerDrawChange = { readonly t: 'draw-change'; readonly ids: readonly string[] } & DrawRequest
  & ({ readonly map: DrawMap } | { readonly style: DrawStylePick } | { readonly line: DrawLinePlace } | { readonly words: DrawWordsPlace });

/** A player removes drawings and texts of their own. */
export type PlayerDrawRemove = { readonly t: 'draw-remove'; readonly ids: readonly string[] } & DrawRequest;

/**
 * A player's eraser passed along `pts` (flat; one point for a dab) at the named size: the GM cuts
 * what the sweep reaches of the sender's own drawings, by the rule its own eraser cuts by, and
 * removes the sender's texts it touches. `whole` removes each drawing it touches whole.
 */
export type PlayerDrawErase = { readonly t: 'draw-erase'; readonly pts: readonly number[]; readonly size: DrawSizeName; readonly whole?: true } & DrawRequest;

export type PlayerDrawMessage = PlayerStroke | PlayerDrawPoints | PlayerDrawAdd | PlayerDrawText | PlayerDrawChange | PlayerDrawRemove | PlayerDrawErase;

/** The most numbers (x, y pairs) of the points a curve was clicked with that its maker is told. */
export const MAX_OWN_ANCHOR_NUMBERS = 128;

/**
 * One of a player's own drawings or texts: its place in the list of the `annotations` message it
 * is told with (those above the tokens), and the id the player names it by. `anchors` are the
 * points a curve was clicked with (flat), which everyone is told only that there were: its maker
 * moves the curve by them.
 */
export interface DrawOwn {
  readonly at: number;
  readonly id: string;
  readonly anchors?: readonly number[];
}

/**
 * Sent to one player: which of the drawings and texts of the `annotations` message numbered `rev`
 * are theirs to change. `seen` is the number of the player's last request the GM has dealt with:
 * what it did is in that message.
 */
export interface DrawMine {
  readonly t: 'draw-mine';
  readonly scene: string;
  readonly rev: number;
  readonly drawings: readonly DrawOwn[];
  readonly texts: readonly DrawOwn[];
  readonly seen: number;
}

/**
 * Why the GM did not take a request: players may not draw (`off`), it names another scene than
 * the player sees (`scene`), it came too fast (`rate`), it cannot be read or is larger than a
 * drawing may be (`shape`), it lies off the map (`place`), the player has as many drawings, points
 * or texts as they may (`full`), it names something that is not theirs or is gone (`gone`), or
 * the GM's map cannot take it now (`busy`).
 */
export const DRAW_REFUSALS = ['off', 'scene', 'rate', 'shape', 'place', 'full', 'gone', 'busy'] as const;
export type DrawRefusal = (typeof DRAW_REFUSALS)[number];

/** Sent to one player: their request `n` was not taken. */
export interface DrawRefused {
  readonly t: 'draw-refused';
  readonly scene: string;
  readonly n: number;
  readonly reason: DrawRefusal;
}

const PLAYER_TYPES: readonly string[] = ['stroke', 'draw-points', 'draw-add', 'draw-text', 'draw-change', 'draw-remove', 'draw-erase'];

/** Whether a message type is one of a player's Draw tool. */
export const isPlayerDrawType = (t: unknown): boolean => typeof t === 'string' && PLAYER_TYPES.includes(t);

export const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);
export const isDrawPlace = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE;
export const isDrawCount = (value: unknown, max: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
export const isDrawColour = (value: unknown): value is string => typeof value === 'string' && COLOUR_PATTERN.test(value);
export const isDrawScene = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_SCENE_ID;
export const isDrawId = (value: unknown): value is string => typeof value === 'string' && DRAW_ID_PATTERN.test(value);

/** Flat points: x, y pairs, at most `max` numbers. */
export function isDrawNumbers(value: unknown, max: number): value is number[] {
  return Array.isArray(value) && value.length % 2 === 0 && value.length <= max && value.every(isDrawPlace);
}

export function isDrawIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= MAX_DRAW_IDS && value.every(isDrawId) && new Set(value).size === value.length;
}

/** The indexes a wrapped text's lines begin at: whole numbers within the text, each after the one before. */
export function isDrawBreaks(value: unknown, length: number): value is number[] {
  if (!Array.isArray(value) || value.length > length) return false;
  let last = -1;
  for (const index of value as unknown[]) {
    if (typeof index !== 'number' || !Number.isInteger(index) || index <= last || index > length) return false;
    last = index;
  }
  return true;
}

/** A drawing's look, or null for anything malformed. */
export function parseDrawLook(value: unknown): DrawLook | null {
  if (!isRecord(value) || !isDrawColour(value.colour) || !isOneOf(DRAW_SIZE_NAMES, value.size)) return null;
  const { seeThrough, dash, ends, curved, fill } = value;
  if ((seeThrough !== undefined && seeThrough !== true) || (curved !== undefined && curved !== true)) return null;
  if ((dash !== undefined && !isOneOf(DRAWING_DASHES, dash)) || (ends !== undefined && !isOneOf(DRAWING_ENDS, ends)) || (fill !== undefined && !isOneOf(DRAWING_FILLS, fill))) return null;
  return {
    colour: value.colour, size: value.size,
    ...(seeThrough === true && { seeThrough }), ...(dash !== undefined && { dash }), ...(ends !== undefined && { ends }),
    ...(curved === true && { curved }), ...(fill !== undefined && { fill }),
  };
}

/** A text's look, or null for anything malformed. */
export function parseDrawTextLook(value: unknown): DrawTextLook | null {
  if (!isRecord(value) || !isDrawColour(value.colour) || !isOneOf(DRAW_SIZE_NAMES, value.size)) return null;
  const { font, look } = value;
  if (!isOneOf(DRAW_FONT_NAMES, font) || !isOneOf(DRAW_TEXT_LOOKS, look)) return null;
  return { colour: value.colour, size: value.size, font, look };
}
