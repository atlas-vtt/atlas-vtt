import {
  MAX_COORDINATE, MAX_PLAYER_DRAWING_POINTS, MAX_PLAYER_DRAWINGS, MAX_PLAYER_STROKE_POINTS, MAX_PLAYER_TEXTS,
  type DrawLook, type DrawMap, type DrawShapeMode, type DrawStylePick, type DrawTextLook,
} from '../protocol/index.ts';
import type { Transform } from '../../annotations/annotationTransform';
import { DEFAULT_DRAW_TOOL, type Annotation, type DrawToolChoices } from '../../annotations/annotationTypes';
import { liveDrawing, type LiveDrawing, type MadeShape } from '../../annotations/madeDrawing';
import type { DrawStyle, StyleField } from '../../packages/components/toolbar/drawStyle';
import { MoveRate, type MapSize } from './moveCheck.ts';

type Point = MadeShape['points'][number];

/** How far off the map a player's drawing may reach, in cells: a line that begins at the edge, a label beside it. */
export const DRAW_MARGIN_CELLS = 2;
/** The tallest a player's text is, in cells, however its handles scaled it; and the least, so none is too small to find again. */
export const MAX_TEXT_CELLS = 4;
export const MIN_TEXT_CELLS = 0.05;
/** The widest a player's text wraps at, in cells, on a map whose size is not known. */
const MAX_WRAP_CELLS = 100;

/** Requests of a player's Draw tool: a burst of `DRAW_BURST`, then `DRAWS_PER_SECOND` (quick strokes, one after the other). */
export const DRAW_BURST = 30;
export const DRAWS_PER_SECOND = 8;
/** The messages that carry a long drawing's points ahead of its request: nine make one drawing of the most points. */
export const DRAW_POINTS_BURST = 40;
export const DRAW_POINTS_PER_SECOND = 20;

export const drawRate = (): MoveRate => new MoveRate(DRAW_BURST, DRAWS_PER_SECOND);
export const drawPointsRate = (): MoveRate => new MoveRate(DRAW_POINTS_BURST, DRAW_POINTS_PER_SECOND);

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
export function drawChoices(look: DrawLook): DrawToolChoices {
  return {
    ...DEFAULT_DRAW_TOOL, color: look.colour, size: look.size, players: true, layer: 'above',
    seeThrough: look.seeThrough === true, dash: look.dash ?? null, ends: look.ends ?? null, curved: look.curved === true, fill: look.fill ?? null,
  };
}

/** The Draw tool as a player's text look sets it. */
export function textChoices(look: DrawTextLook): DrawToolChoices {
  return {
    ...DEFAULT_DRAW_TOOL, color: look.colour, size: look.size, players: true, layer: 'above',
    font: look.font, look: look.look, align: look.align, bold: look.bold === true, italic: look.italic === true,
  };
}

/**
 * The drawing a player's gesture made, as the GM's own tool makes one of it (`liveDrawing`, so a
 * pen's points stay the ones the player's page thinned them to); null for what has no size, and
 * for one with more points than a player's drawing may have (a long curve is sampled).
 */
export function playerDrawing(mode: DrawShapeMode, points: readonly Point[], closed: boolean, look: DrawLook, cell: number): LiveDrawing | null {
  const drawing = liveDrawing({ mode, points, closed }, drawChoices(look), cell);
  return drawing !== null && drawing.points.length <= MAX_PLAYER_STROKE_POINTS ? drawing : null;
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

/** What one player has on a level: their drawings, the points of those, and their texts. */
export interface PlayerUse {
  drawings: number;
  points: number;
  texts: number;
}

/** The points a drawing counts for: its line's and its holes'. */
export const drawingPoints = (drawing: { readonly points: readonly unknown[]; readonly holes?: readonly (readonly unknown[])[] | undefined }): number =>
  drawing.points.length + (drawing.holes ?? []).reduce((sum, ring) => sum + ring.length, 0);

/** What `player` has among `list`, the annotations of one level. */
export function playerUse(list: readonly Annotation[], player: string): PlayerUse {
  const use: PlayerUse = { drawings: 0, points: 0, texts: 0 };
  for (const annotation of list) {
    if (annotation.by !== player) continue;
    if (annotation.kind === 'text') use.texts += 1;
    else {
      use.drawings += 1;
      use.points += drawingPoints(annotation);
    }
  }
  return use;
}

/** Whether a player with `use` is within what one player may have. */
export function withinUse(use: PlayerUse): boolean {
  return use.drawings <= MAX_PLAYER_DRAWINGS && use.points <= MAX_PLAYER_DRAWING_POINTS && use.texts <= MAX_PLAYER_TEXTS;
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
  if ('look' in pick) return { field: 'look', value: pick.look };
  if ('align' in pick) return { field: 'align', value: pick.align };
  if ('bold' in pick) return { field: 'bold', value: pick.bold };
  return { field: 'italic', value: pick.italic };
}
