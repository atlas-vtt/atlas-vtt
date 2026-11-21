/**
 * Measurements grouped with a token (`isFollower`): any shape, kept as it was drawn, moving and
 * turning with its token as if the two were one. Unlike an aura nothing is worked out from the
 * token when it is drawn: the measurement's points are written whenever the token's place or
 * rotation differs from the `anchor` they were written at, so every reader (the layer, its lights,
 * the players' page) reads them as it reads any measurement.
 */

import type { StoreApi } from 'zustand';
import { runUntracked } from '../stores/history';
import { mapTokens } from '../tokens/offMap';
import type { ViewState } from '../types/viewState';
import type { Point } from '../types/visionTypes';
import { isFollower, readMeasure } from './keptMeasures';
import type { MeasureAnchor, MeasureChanges } from './measureTypes';
import { spaceRadius, tokenStandingAt, type PlacedToken, type TokenGrid } from './tokenDistance';

/** What a grouped measurement reads of its token. */
export interface FollowedToken {
  readonly x: number;
  readonly y: number;
  readonly rotation?: number | undefined;
}

/** A grouped measurement placed again: the points it now holds and the anchor they were written at. */
export interface FollowerMove {
  readonly id: string;
  readonly points: Point[];
  readonly anchor: MeasureAnchor;
}

/** How far past the edge of a token's space a measurement's start still lies on it, world pixels. */
const EDGE_ROOM = 0.5;

/**
 * The token a measurement starting at `point` can be grouped with: the one standing there, else the
 * topmost whose square space holds it with its edge, since a cone or line is drawn from a token's
 * edge or corner. Null where none does.
 */
export function tokenAtStart<T extends PlacedToken>(point: Point, tokens: readonly T[], grid: TokenGrid): T | null {
  const standing = tokenStandingAt(point, tokens, grid);
  if (standing) return standing;
  let top: T | null = null;
  for (const token of tokens) {
    if (top && (token.layer ?? 0) < (top.layer ?? 0)) continue;
    const reach = spaceRadius(token, grid) + EDGE_ROOM;
    if (Math.abs(point.x - token.x) <= reach && Math.abs(point.y - token.y) <= reach) top = token;
  }
  return top;
}

/** Where `token` stands and how it is turned, as an anchor. */
export function anchorOf(token: FollowedToken): MeasureAnchor {
  return { x: token.x, y: token.y, rotation: token.rotation ?? 0 };
}

/** `points`, written at `from`, turned about it and carried to `to`, so they lie to `to` as they lay to `from`. */
export function pointsCarried(points: readonly Point[], from: MeasureAnchor, to: MeasureAnchor): Point[] {
  const turn = ((to.rotation - from.rotation) * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  // y points down on the map, so this turns clockwise on screen as a token's rotation does.
  return points.map(({ x, y }) => {
    const dx = x - from.x;
    const dy = y - from.y;
    return { x: to.x + dx * cos - dy * sin, y: to.y + dx * sin + dy * cos };
  });
}

/**
 * The grouped measurements of `measures` whose token stands or is turned otherwise than their anchor
 * says, placed again around it. A measurement whose token is not on the map stays where it is.
 */
export function followerMoves(measures: Readonly<Record<string, unknown>> | undefined, tokens: Readonly<Record<string, FollowedToken>>): FollowerMove[] {
  if (!measures) return [];
  const moves: FollowerMove[] = [];
  for (const [id, value] of Object.entries(measures)) {
    const measure = readMeasure(id, value);
    if (!measure || !isFollower(measure)) continue;
    const token = tokens[measure.follows];
    if (!token || !Number.isFinite(token.x) || !Number.isFinite(token.y)) continue;
    const to = anchorOf(token);
    const from = measure.anchor;
    if (from.x === to.x && from.y === to.y && from.rotation === to.rotation) continue;
    moves.push({ id, points: pointsCarried(measure.points, from, to), anchor: to });
  }
  return moves;
}

type FollowerStoreState = Pick<ViewState, 'objects' | 'isMapLoading'> & {
  updateMeasure: (id: string, changes: MeasureChanges) => void;
};

/**
 * Keeps a view store's grouped measurements with their tokens: whenever tokens change, each one
 * whose token moved or turned is placed again. The writes are Atlas's own (`runUntracked`), so a
 * token's move and its measurements' are one undo step, and an undo that puts both back finds
 * them together and writes nothing. Returns the unsubscribe.
 */
export function followTokensWithMeasures(store: StoreApi<FollowerStoreState>): () => void {
  let writing = false;
  return store.subscribe((state, previous) => {
    if (writing || state.isMapLoading || state.objects.tokens === previous.objects.tokens) return;
    const moves = followerMoves(state.objects.measures, mapTokens(state.objects));
    if (moves.length === 0) return;
    writing = true;
    try {
      runUntracked(store, () => {
        for (const { id, points, anchor } of moves) store.getState().updateMeasure(id, { points, anchor });
      });
    } finally {
      writing = false;
    }
  });
}
