import {
  MAX_COORDINATE, MAX_PLAYER_DRAWING_POINTS, MAX_PLAYER_DRAWINGS, MAX_PLAYER_FILL_CORNERS, MAX_PLAYER_SEE_THROUGH_POINTS, MAX_PLAYER_STROKE_POINTS, MAX_PLAYER_TEXTS,
  type DrawLook, type DrawMap, type DrawShapeMode, type DrawStylePick, type DrawTextLook,
} from '../protocol/index.ts';
import { readDrawing } from '../../annotations/annotationList';
import type { Transform } from '../../annotations/annotationTransform';
import { DEFAULT_DRAW_TOOL, type Annotation, type DrawingAnnotation, type DrawToolChoices } from '../../annotations/annotationTypes';
import { liveDrawing, type LiveDrawing, type MadeShape } from '../../annotations/madeDrawing';
import { thinned } from '../../annotations/penStroke';
import type { DrawStyle, StyleField } from '../../packages/components/toolbar/drawStyle';
import { cornersOf, crossesItself, dashCount, seeThroughWeight } from './drawCost.ts';
import { MoveRate, type MapSize } from './moveCheck.ts';

type Point = MadeShape['points'][number];

/** How far off the map a player's drawing may reach, in cells: a line that begins at the edge, a label beside it. */
export const DRAW_MARGIN_CELLS = 2;
/** The tallest a player's text is, in cells, however its handles scaled it; and the least, so none is too small to find again. */
const MAX_TEXT_CELLS = 4;
const MIN_TEXT_CELLS = 0.05;
/** The widest a player's text wraps at, in cells, on a map whose size is not known. */
const MAX_WRAP_CELLS = 100;

/** Drawings a player makes (a gesture's end): a burst of `DRAW_BURST`, then `DRAWS_PER_SECOND` (quick strokes, one after the other). */
export const DRAW_BURST = 30;
export const DRAWS_PER_SECOND = 8;
/**
 * Every other request but an erasing (a text, a change, a removal): a burst of `WRITE_BURST`,
 * then `WRITES_PER_SECOND`. Each is a write of the GM's scene, told to everyone.
 */
export const WRITE_BURST = 10;
export const WRITES_PER_SECOND = 2;
/** Erasings: a burst of `ERASE_BURST`, then `ERASES_PER_SECOND`, whether they cut anything or not. A cut is the dearest thing a page can ask for. */
export const ERASE_BURST = 3;
export const ERASES_PER_SECOND = 1;
/** The messages that carry a long drawing's points ahead of its request: nine make one drawing of the most points. */
export const DRAW_POINTS_BURST = 40;
export const DRAW_POINTS_PER_SECOND = 20;

export const drawRate = (): MoveRate => new MoveRate(DRAW_BURST, DRAWS_PER_SECOND);
export const writeRate = (): MoveRate => new MoveRate(WRITE_BURST, WRITES_PER_SECOND);
export const eraseRate = (): MoveRate => new MoveRate(ERASE_BURST, ERASES_PER_SECOND);
export const drawPointsRate = (): MoveRate => new MoveRate(DRAW_POINTS_BURST, DRAW_POINTS_PER_SECOND);

/**
 * The most a sweep may cost (`sweepCost`: the points of the sender's drawings it may reach times
 * its own stretches) for the cut to be tried at all. Measured at about 23 ns for each of them,
 * that is some 12 ms of the GM's Atlas at the very most, once a second: a whole sweep over two
 * of the longest strokes a player may have fits, over three it does not.
 */
export const ERASE_COST_BUDGET = 500_000;
/** A cut that took longer than this, in ms, pauses its sender's erasing for `ERASE_PAUSE_MS`: the last line, should the budget have misjudged one. */
export const ERASE_SLOW_MS = 50;
export const ERASE_PAUSE_MS = 10_000;

/** How far the GM thins a player's pen from the points it was told, world pixels: under what any zoom shows, and never the page's word for it. */
export const PEN_TOLERANCE = 0.1;
/** The most dashes or dots one of a player's lines is drawn as. */
export const MAX_PLAYER_DASHES = 500;
/** The most see-through ink one player has on a level (`seeThroughWeight` of all their drawings together). */
export const MAX_PLAYER_SEE_THROUGH = 1_024;

/** Flat x, y pairs as points. */
export function pointsOf(flat: readonly number[]): Point[] {
  const points: Point[] = [];
  for (let index = 0; index + 1 < flat.length; index += 2) points.push({ x: flat[index]!, y: flat[index + 1]! });
  return points;
}

/**
 * The Draw tool as a player's look sets it: the GM's own tool with the player's colour, size and
 * switches. Players see what it makes, above the tokens: neither is a player's to choose.
 */
function drawChoices(look: DrawLook): DrawToolChoices {
  return {
    ...DEFAULT_DRAW_TOOL, color: look.colour, size: look.size, players: true, layer: 'above',
    seeThrough: look.seeThrough === true, dash: look.dash ?? null, ends: look.ends ?? null, curved: look.curved === true, fill: look.fill ?? null,
  };
}

/** The Draw tool as a player's text look sets it. */
export function textChoices(look: DrawTextLook): DrawToolChoices {
  return {
    ...DEFAULT_DRAW_TOOL, color: look.colour, size: look.size, players: true, layer: 'above',
    font: look.font, look: look.look,
  };
}

/** A drawing that is being made, read as a finished one is. */
const readLive = (drawing: LiveDrawing): DrawingAnnotation | null => readDrawing('made', { id: 'made', kind: 'drawing', timestamp: 0, ...drawing });

/**
 * Whether a drawing costs no more than one of a player's may, whatever was done to it: at most
 * `MAX_PLAYER_STROKE_POINTS` points, `MAX_PLAYER_DASHES` dashes or dots, and see-through ink of
 * at most `MAX_PLAYER_SEE_THROUGH_POINTS` (`seeThroughWeight`). Cheap to ask.
 */
export function costAllowed(drawing: DrawingAnnotation): boolean {
  return drawing.points.length <= MAX_PLAYER_STROKE_POINTS && dashCount(drawing) <= MAX_PLAYER_DASHES && seeThroughWeight(drawing) <= MAX_PLAYER_SEE_THROUGH_POINTS;
}

/**
 * Whether a drawing's fill is one a player may make: none at all, a rectangle's or an ellipse's,
 * or that of a line with at most `MAX_PLAYER_FILL_CORNERS` corners that does not cross itself.
 * A fill is cleaned and cut by clipping, which costs by the places an outline crosses itself: a
 * scribble of two thousand corners took the best part of a second. Asked of a drawing as it is
 * made and whenever its points or its fill are set anew; what the eraser leaves of such a fill,
 * and such a fill moved or scaled, crosses itself no more than it did.
 */
export function fillAllowed(drawing: DrawingAnnotation): boolean {
  if (drawing.fill === null || ((drawing.shape === 'rectangle' || drawing.shape === 'ellipse') && drawing.holes.length === 0)) return true;
  return cornersOf(drawing) <= MAX_PLAYER_FILL_CORNERS && !crossesItself(drawing.points, drawing.closed);
}

/**
 * The drawing a player's gesture made, as the GM's own tool makes one of it (`liveDrawing`). A
 * pen's points are thinned here, by the GM's own tolerance, whatever the page did to them. Null
 * for what has no size and for what a player's drawing may not be (`costAllowed`, `fillAllowed`):
 * every drawing a player makes is cheap to build, to draw and to cut by what it is, not by what
 * the code that does so guards against.
 */
export function playerDrawing(mode: DrawShapeMode, points: readonly Point[], closed: boolean, look: DrawLook, cell: number): LiveDrawing | null {
  const line = mode === 'pen' ? thinned(points, PEN_TOLERANCE) : points;
  const drawing = liveDrawing({ mode, points: line, closed }, drawChoices(look), cell);
  const read = drawing === null ? null : readLive(drawing);
  return drawing !== null && read !== null && costAllowed(read) && fillAllowed(read) ? drawing : null;
}

/**
 * The drawing a player is making, as it is shown to the others while it grows. A pen's stroke is
 * its points as they came (whoever shows it draws it solid and fades it as one picture, so
 * see-through ink costs nothing there); every other shape is held to what the finished drawing
 * may be, and a line shows no fill before it is made. Null for what is not shown.
 */
export function strokeUnderWay(mode: DrawShapeMode, points: readonly Point[], closed: boolean, look: DrawLook, cell: number): LiveDrawing | null {
  if (mode === 'line') return playerDrawing(mode, points, closed, withoutFill(look), cell);
  if (mode !== 'pen') return playerDrawing(mode, points, closed, look, cell);
  return points.length <= MAX_PLAYER_STROKE_POINTS ? liveDrawing({ mode, points, closed }, drawChoices(look), cell) : null;
}

function withoutFill(look: DrawLook): DrawLook {
  const { colour, size, seeThrough, dash, ends, curved } = look;
  return { colour, size, ...(seeThrough && { seeThrough }), ...(dash && { dash }), ...(ends && { ends }), ...(curved && { curved }) };
}

/** Whether a point lies on the map or within `DRAW_MARGIN_CELLS` cells of it; without a known size, within the places the protocol reaches. */
export function nearEdge({ x, y }: Point, map: MapSize | null, cell: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (map === null) return Math.abs(x) <= MAX_COORDINATE && Math.abs(y) <= MAX_COORDINATE;
  const margin = DRAW_MARGIN_CELLS * cell;
  return x >= -margin && x <= map.width + margin && y >= -margin && y <= map.height + margin;
}

export const allNearEdge = (points: readonly Point[], map: MapSize | null, cell: number): boolean => points.every((point) => nearEdge(point, map, cell));

/** The widest a player's text may wrap at: as wide as the map with its margins. */
export function maxWrap(map: MapSize | null, cell: number): number {
  return map === null ? MAX_WRAP_CELLS * cell : map.width + 2 * DRAW_MARGIN_CELLS * cell;
}

/** Whether a text's letters, as high as `height` world pixels, are a size a player's text may have. */
export function textHeightAllowed(height: number, cell: number): boolean {
  return Number.isFinite(height) && height >= MIN_TEXT_CELLS * cell && height <= MAX_TEXT_CELLS * cell;
}

/** What one player has on a level: their drawings, the points of those, their see-through ink (`seeThroughWeight`), and their texts. */
export interface PlayerUse {
  drawings: number;
  points: number;
  seeThrough: number;
  texts: number;
}

/** The points a drawing counts for: its line's and its holes'. */
export const drawingPoints = (drawing: { readonly points: readonly unknown[]; readonly holes?: readonly (readonly unknown[])[] | undefined }): number =>
  drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0);

/** What `player` has among `list`, the annotations of one level. */
export function playerUse(list: readonly Annotation[], player: string): PlayerUse {
  const use: PlayerUse = { drawings: 0, points: 0, seeThrough: 0, texts: 0 };
  for (const annotation of list) {
    if (annotation.by !== player) continue;
    if (annotation.kind === 'text') use.texts += 1;
    else {
      use.drawings += 1;
      use.points += drawingPoints(annotation);
      use.seeThrough += seeThroughWeight(annotation);
    }
  }
  return use;
}

/** Whether a player with `use` is within what one player may have. */
export function withinUse(use: PlayerUse): boolean {
  return use.drawings <= MAX_PLAYER_DRAWINGS && use.points <= MAX_PLAYER_DRAWING_POINTS && use.seeThrough <= MAX_PLAYER_SEE_THROUGH && use.texts <= MAX_PLAYER_TEXTS;
}

/** A map of the plane as the handles' rules take it. */
export function transformOf([a, b, c, d, tx, ty, turn]: DrawMap): Transform {
  return { a, b, c, d, tx, ty, turn };
}

/** A pick of the bars as the tool's own style names it: the field and its value. */
export type StyleChoice = { [Field in StyleField]: { readonly field: Field; readonly value: DrawStyle[Field] } }[StyleField];

/** What a player's pick is in the tool's own words. Who sees a drawing, where it lies and a stamp's symbol are no picks a player has. */
export function styleChoice(pick: DrawStylePick): StyleChoice {
  if ('colour' in pick) return { field: 'color', value: pick.colour };
  if ('size' in pick) return { field: 'size', value: pick.size };
  if ('seeThrough' in pick) return { field: 'seeThrough', value: pick.seeThrough };
  if ('dash' in pick) return { field: 'dash', value: pick.dash };
  if ('ends' in pick) return { field: 'ends', value: pick.ends };
  if ('curved' in pick) return { field: 'curved', value: pick.curved };
  if ('fill' in pick) return { field: 'fill', value: pick.fill };
  if ('font' in pick) return { field: 'font', value: pick.font };
  return { field: 'look', value: pick.look };
}
