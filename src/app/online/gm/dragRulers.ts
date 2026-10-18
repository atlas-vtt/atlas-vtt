import type { RemoteDrag } from '../marks/index.ts';
import type { Point } from '../movement/index.ts';
import { cellToWorld, formationGridFromOptions, worldToCell, type FormationGrid } from '../../encounters/encounterFormation';
import { snapTokenCenter } from '../../grid/gridPlacement';
import { call, type SceneState } from './atlasView.ts';

/** The rulers of the drags under way, by GM token id: the points each runs through. */
export type RulerPaths = ReadonlyMap<string, readonly Point[]>;

/** What the GM's own drag ruler measures (`DragRuler.path`): the token and its start, waypoints and landing. */
export interface GmRuler {
  readonly tokenId: string;
  readonly points: readonly Point[];
}

type RulerState = Pick<SceneState, 'objects' | 'grid'>;

/** Points closer than half a pixel are one, as Atlas's ruler takes them. */
const samePoint = (a: Point, b: Point): boolean => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;

/** The grid tokens snap to, as Atlas's drag snaps them (on unless switched off), or null. */
function snapGrid(grid: RulerState['grid']): FormationGrid | null {
  if (grid === null || !(grid.snapToGrid ?? true)) return null;
  return formationGridFromOptions({ ...(grid.type !== undefined && { type: grid.type }), size: grid.size, offsetX: grid.offsetX, offsetY: grid.offsetY });
}

/**
 * The rulers of the drags under way on a scene: the GM's own (Atlas's drag ruler, which measures the
 * token taken alone) and each player's drag the GM follows (`starts`, where each token was taken
 * from), from its start to the place the token would land on now, both snapped as Atlas's ruler
 * snaps them. A ruler whose points all lie on its landing measures nothing and is left out.
 */
export function dragRulerPaths(state: RulerState, gm: GmRuler | null, starts: ReadonlyMap<string, Point>): Map<string, readonly Point[]> {
  const paths = new Map<string, readonly Point[]>();
  if (gm !== null && state.objects.tokens[gm.tokenId] !== undefined) paths.set(gm.tokenId, gm.points);
  const grid = snapGrid(state.grid);
  for (const [tokenId, start] of starts) {
    const token = state.objects.tokens[tokenId];
    if (token === undefined || paths.has(tokenId)) continue;
    const snap = (point: Point): Point => (grid === null ? { x: point.x, y: point.y } : snapTokenCenter(point, token.size || 1, grid.type, grid.size, (at) => cellToWorld(grid, worldToCell(grid, at))));
    const from = snap(start);
    const landing = snap(token);
    if (!samePoint(from, landing)) paths.set(tokenId, [from, landing]);
  }
  return paths;
}

/** The rulers as the GM's overlay draws them: with each token's size and whether it snaps, by which it is measured. */
export function rulersToDraw(state: RulerState, paths: RulerPaths): RemoteDrag[] {
  const snaps = state.grid?.snapToGrid ?? true;
  return [...paths].flatMap(([tokenId, path]) => {
    const token = state.objects.tokens[tokenId];
    return token === undefined ? [] : [{ key: tokenId, path, cells: token.size || 1, snaps }];
  });
}

const isPoint = (value: unknown): value is Point => typeof value === 'object' && value !== null && 'x' in value && 'y' in value && typeof value.x === 'number' && typeof value.y === 'number';

/** What the drag ruler of an Atlas tab's renderer measures now (`TokenRenderer.dragRulerPath`), or null. */
export function dragRulerOf(renderer: unknown): GmRuler | null {
  const path = call(call(renderer, 'getTokenRenderer'), 'dragRulerPath');
  if (typeof path !== 'object' || path === null || !('tokenId' in path) || !('points' in path)) return null;
  const { tokenId, points } = path;
  return typeof tokenId === 'string' && Array.isArray(points) && points.every(isPoint) ? { tokenId, points } : null;
}

/** The rulers of the players' drags as the GM's overlay was last given them, given again only when they change. */
export class PlayerDragRulers {
  private readonly show: (drags: readonly RemoteDrag[]) => void;
  private shown = '[]';

  constructor(show: (drags: readonly RemoteDrag[]) => void) {
    this.show = show;
  }

  /** The players' drags under way (`starts`, where each token was taken from) on the scene as it is now. */
  update(state: RulerState, starts: ReadonlyMap<string, Point>): void {
    this.give(starts.size === 0 ? [] : rulersToDraw(state, dragRulerPaths(state, null, starts)));
  }

  /** No drag shows: another scene, or none. */
  clear(): void {
    this.give([]);
  }

  private give(drags: readonly RemoteDrag[]): void {
    const key = JSON.stringify(drags);
    if (key === this.shown) return;
    this.shown = key;
    this.show(drags);
  }
}
