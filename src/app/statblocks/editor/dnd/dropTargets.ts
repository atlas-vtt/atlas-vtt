/**
 * Where a dragged block would land (spec §7.3), from the pointer and the
 * boxes the card draws its blocks in: between rows of the grid or tiles of a
 * row, or beside a tile, over the outer band of its left or right edge, which
 * sets the two side by side. Nothing lands in the header or inside a Section
 * (`templateGrid`): a drop there walks out to the nearest gap of the grid. Every
 * target is checked with the catalogue's `canContain` and never lies inside
 * the block being moved; a closed tab draws nothing, so it takes no drop.
 * Pure: the boxes are measured elsewhere.
 */

import { canContain, type ParentType } from '../../model/blockCatalogue';
import { gridAcceptsBeside, gridAcceptsList, isGridTile } from '../../model/templateGrid';
import { childrenOf, parentTypeOf } from '../../model/treeEdit';
import { findBlock, isWithin } from '../../model/treeQueries';
import { isContainerBlock, type BlockType, type TemplateBlock, type TemplateLayout } from '../../model/templateTypes';
import { LINE_OFFSET, contains, distanceTo, gapLine, rowSpan, type Box, type DropLine, type ListFlow, type Point } from './dropGeometry';

export type DropTarget =
  /** Before the block at `index` of a list (its length: at the end), counted as the list stands now. */
  | { kind: 'between'; parentId: string | null; index: number; line: DropLine }
  /** Into an empty Section or Row, or the empty card (`parentId` null). */
  | { kind: 'into'; parentId: string | null; outline: Box }
  /** Beside a block of a stack: the two go side by side, the dropped one on the block's `side`. */
  | { kind: 'beside'; targetId: string; side: 'start' | 'end'; line: DropLine }
  /** Over the card where the block may not go. */
  | { kind: 'refused' };

export interface DropScene {
  layout: TemplateLayout;
  /** The box of every drawn block, by id. Blocks the card does not draw are missing. */
  boxes: ReadonlyMap<string, Box>;
  /** The card's own box, which an empty template takes its first block into. */
  card: Box | null;
}

export interface DragSubject {
  /** The block types the drop puts in, top to bottom. */
  types: readonly BlockType[];
  /** The block moved; null for a new one. */
  movingId: string | null;
}

/** An empty container takes a drop over at least this height, however little it draws (a Section without a heading draws nothing). */
export const EMPTY_HEIGHT = 28;

/** The band along a block's left and right edges that drops beside it: a share of its width, within these bounds in px. */
export const BESIDE_SHARE = 0.25;
export const BESIDE_MIN = 24;
export const BESIDE_MAX = 96;

interface Drawn {
  block: TemplateBlock;
  index: number;
  box: Box;
}

function flowOf(parentType: ParentType | null): ListFlow {
  return parentType === 'row' ? 'row' : 'stack';
}

function drawnOf(scene: DropScene, list: readonly TemplateBlock[]): Drawn[] {
  return list.flatMap((block, index) => {
    const box = scene.boxes.get(block.id);
    return box ? [{ block, index, box }] : [];
  });
}

/** The line of the gap at drawn position `at` (0 before the first drawn block, `drawn.length` after the last). */
function lineAt(scene: DropScene, parentId: string | null, drawn: readonly Drawn[], at: number, near: Point | null): DropLine | null {
  const flow = flowOf(parentTypeOf(scene.layout, parentId));
  const span = flow === 'row' && parentId ? rowSpan(scene.boxes.get(parentId), drawn.map((entry) => entry.box)) : null;
  return gapLine(drawn[at - 1]?.box ?? null, drawn[at]?.box ?? null, flow, span, near);
}

/** The gap of a list at drawn position `at`, as a target. */
function gapTarget(scene: DropScene, parentId: string | null, drawn: readonly Drawn[], at: number, near: Point | null): DropTarget | null {
  const line = lineAt(scene, parentId, drawn, at, near);
  const index = at < drawn.length ? drawn[at]?.index : (drawn.at(-1)?.index ?? -1) + 1;
  return line && index !== undefined ? { kind: 'between', parentId, index, line } : null;
}

/** The gap of a list nearest the point. */
function nearestGap(scene: DropScene, parentId: string | null, near: Point): DropTarget | null {
  const drawn = drawnOf(scene, childrenOf(scene.layout, parentId) ?? []);
  let best: DropTarget | null = null;
  let distance = Infinity;
  for (let at = 0; at <= drawn.length; at++) {
    const target = gapTarget(scene, parentId, drawn, at, near);
    const away = target?.kind === 'between' ? distanceTo(target.line, near) : Infinity;
    if (away < distance) [best, distance] = [target, away];
  }
  return best;
}

/** Where a block takes a drop: its box, an empty container's at least `EMPTY_HEIGHT` tall. */
export function dropBox(block: TemplateBlock, box: Box): Box {
  if (!isContainerBlock(block) || block.blocks.length > 0 || box.bottom - box.top >= EMPTY_HEIGHT) return box;
  return { ...box, bottom: box.top + EMPTY_HEIGHT };
}

/** The deepest drawn block under the point, never the moved block or anything inside it. */
function blockAt(scene: DropScene, point: Point, movingId: string | null): TemplateBlock | null {
  let hit: TemplateBlock | null = null;
  const visit = (list: readonly TemplateBlock[]): void => {
    for (const block of list) {
      if (block.id === movingId) continue;
      const box = scene.boxes.get(block.id);
      if (!box || !contains(dropBox(block, box), point)) continue;
      hit = block;
      // A tile of the grid is what a drop goes beside or around: never into what it holds.
      if (isContainerBlock(block) && !isGridTile(scene.layout, block.id)) visit(block.blocks);
      return;
    }
  };
  visit(scene.layout.blocks);
  return hit;
}

/** The side of a block whose edge band the point is in, or null in its middle. */
export function besideSide(box: Box, point: Point): 'start' | 'end' | null {
  const band = Math.min(Math.max((box.right - box.left) * BESIDE_SHARE, BESIDE_MIN), BESIDE_MAX);
  if (point.x <= box.left + band) return 'start';
  if (point.x >= box.right - band) return 'end';
  return null;
}

function besideTarget(block: TemplateBlock, box: Box, side: 'start' | 'end'): DropTarget {
  const x = side === 'start' ? box.left - LINE_OFFSET : box.right + LINE_OFFSET;
  return { kind: 'beside', targetId: block.id, side, line: { orientation: 'vertical', x, y: box.top, length: box.bottom - box.top } };
}

/** The targets a point over a block suggests, best first; `settle` takes the first one allowed. */
function candidatesIn(scene: DropScene, subject: DragSubject, block: TemplateBlock, point: Point): DropTarget[] {
  const box = scene.boxes.get(block.id);
  const found = findBlock(scene.layout.blocks, block.id);
  if (!box || !found) return [];
  // A tile of the grid that holds blocks (a Section with a heading, Abilities with tabs) takes drops beside and around it, never into it.
  if (isContainerBlock(block) && !isGridTile(scene.layout, block.id)) {
    const inside = drawnOf(scene, block.blocks).filter((entry) => entry.block.id !== subject.movingId);
    if (inside.length === 0 && block.blocks.every((child) => child.id === subject.movingId)) {
      return [{ kind: 'into', parentId: block.id, outline: dropBox(block, box) }];
    }
    return [nearestGap(scene, block.id, point)].filter((target) => target !== null);
  }
  const drawn = drawnOf(scene, childrenOf(scene.layout, found.parentId) ?? []);
  const at = drawn.findIndex((entry) => entry.block.id === block.id);
  const flow = flowOf(parentTypeOf(scene.layout, found.parentId));
  const firstHalf = flow === 'row' ? point.x < (box.left + box.right) / 2 : point.y < (box.top + box.bottom) / 2;
  const between = gapTarget(scene, found.parentId, drawn, firstHalf ? at : at + 1, point);
  const side = flow === 'stack' ? besideSide(box, point) : null;
  const beside = side ? besideCandidate(scene, block.id, box, side, point) : null;
  return [...(beside ? [beside] : []), ...(between ? [between] : [])];
}

/** How far a block's edge may stand from its Section's and still count as the same edge. */
const SAME_EDGE = 4;

/**
 * What a drop over a block's edge band goes beside: the block, or the
 * Section without a heading it stands in with that edge (a group the eye does
 * not see, like a name with the line under it), and so on outwards. Where that
 * stands in a Row already, the drop takes the Row's gap on that side.
 */
function besideCandidate(scene: DropScene, id: string, box: Box, side: 'start' | 'end', point: Point): DropTarget | null {
  let anchor = { id, box };
  for (let depth = 0; depth < 64; depth++) {
    const found = findBlock(scene.layout.blocks, anchor.id);
    const parent = found?.parentId ? findBlock(scene.layout.blocks, found.parentId) : null;
    const parentBox = parent ? scene.boxes.get(parent.block.id) : undefined;
    if (!parent || !parentBox || parent.block.type !== 'section' || parent.block.heading?.trim() || parent.block.headingField) break;
    const edge = side === 'start' ? Math.abs(parentBox.left - anchor.box.left) : Math.abs(parentBox.right - anchor.box.right);
    if (edge > SAME_EDGE) break;
    anchor = { id: parent.block.id, box: parentBox };
  }
  const found = findBlock(scene.layout.blocks, anchor.id);
  if (!found) return null;
  if (parentTypeOf(scene.layout, found.parentId) === 'row') {
    const drawn = drawnOf(scene, childrenOf(scene.layout, found.parentId) ?? []);
    const at = drawn.findIndex((entry) => entry.block.id === anchor.id);
    return at === -1 ? null : gapTarget(scene, found.parentId, drawn, side === 'start' ? at : at + 1, point);
  }
  return besideTarget(found.block, anchor.box, side);
}

/** Whether every block the drag brings may stand in the list `parentId`, and the moved block does not go into itself. */
export function mayHold(layout: TemplateLayout, parentId: string | null, subject: DragSubject): boolean {
  const type = parentTypeOf(layout, parentId);
  if (type === null || !subject.types.every((child) => canContain(type, child))) return false;
  return subject.movingId === null || parentId === null || !isWithin(layout.blocks, subject.movingId, parentId);
}

/** Whether the block a drag would land beside and the one block it brings may stand in a new Side by side there. */
function mayStandBeside(layout: TemplateLayout, targetId: string, subject: DragSubject): boolean {
  const found = findBlock(layout.blocks, targetId);
  if (!found || targetId === subject.movingId || subject.types.length !== 1) return false;
  const parentType = parentTypeOf(layout, found.parentId);
  if (parentType === null || parentType === 'row' || !canContain(parentType, 'row')) return false;
  return [found.block.type, ...subject.types].every((type) => canContain('row', type));
}

/** Whether the target is a place of the grid (`templateGrid`): a gap between rows or tiles of a row, or beside a tile; never inside the header or a Section. */
function inGrid(layout: TemplateLayout, target: Exclude<DropTarget, { kind: 'refused' }>): boolean {
  if (target.kind === 'beside') return gridAcceptsBeside(layout, target.targetId);
  return gridAcceptsList(layout, target.parentId);
}

function allowed(scene: DropScene, subject: DragSubject, target: DropTarget): boolean {
  if (target.kind === 'refused' || !inGrid(scene.layout, target)) return false;
  if (target.kind === 'beside') return mayStandBeside(scene.layout, target.targetId, subject);
  return mayHold(scene.layout, target.parentId, subject);
}

/** Whether the target leaves the moved block where it is. */
export function isNoMove(layout: TemplateLayout, subject: DragSubject, target: DropTarget): boolean {
  const found = subject.movingId === null ? null : findBlock(layout.blocks, subject.movingId);
  if (!found || target.kind === 'beside') return false;
  if (target.kind === 'into') return found.parentId === target.parentId;
  return target.kind === 'between' && found.parentId === target.parentId && (target.index === found.index || target.index === found.index + 1);
}

/** A gap the walk takes when a list may not hold the block: right before or after that list's container. */
function outOf(scene: DropScene, target: DropTarget, point: Point): DropTarget | null {
  // Beside a block is a place of its own: where it is refused, the next candidate (the gap) is taken.
  if (target.kind === 'beside') return null;
  const containerId = target.kind === 'refused' ? null : target.parentId;
  const container = containerId ? findBlock(scene.layout.blocks, containerId) : null;
  const box = containerId ? scene.boxes.get(containerId) : undefined;
  if (!container || !box) return null;
  const drawn = drawnOf(scene, childrenOf(scene.layout, container.parentId) ?? []);
  const at = drawn.findIndex((entry) => entry.block.id === container.block.id);
  const before = point.y < (box.top + box.bottom) / 2;
  return gapTarget(scene, container.parentId, drawn, before ? at : at + 1, point);
}

/** The first allowed target, walking out of lists that may not hold the block; null where the drop moves nothing. */
function settle(scene: DropScene, subject: DragSubject, candidates: readonly DropTarget[], point: Point): DropTarget | null {
  for (const candidate of candidates) {
    let target: DropTarget | null = candidate;
    for (let depth = 0; target && depth < 64; depth++) {
      if (allowed(scene, subject, target)) return isNoMove(scene.layout, subject, target) ? null : target;
      target = outOf(scene, target, point);
    }
  }
  return candidates.length > 0 ? { kind: 'refused' } : null;
}

/**
 * Where a drop at `point` lands, or null where it would move nothing (the
 * block's own place, or nowhere near the card).
 */
export function dropTargetAt(scene: DropScene, subject: DragSubject, point: Point): DropTarget | null {
  if (scene.layout.blocks.length === 0) {
    return scene.card && contains(scene.card, point) ? { kind: 'into', parentId: null, outline: scene.card } : null;
  }
  const block = blockAt(scene, point, subject.movingId);
  const candidates = block ? candidatesIn(scene, subject, block, point) : [nearestGap(scene, null, point)].filter((target) => target !== null);
  return settle(scene, subject, candidates, point);
}

/** Two targets that show and do the same. */
export function sameTarget(a: DropTarget | null, b: DropTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind === 'between' && b.kind === 'between') return a.parentId === b.parentId && a.index === b.index && sameLine(a.line, b.line);
  if (a.kind === 'into' && b.kind === 'into') return a.parentId === b.parentId;
  if (a.kind === 'beside' && b.kind === 'beside') return a.targetId === b.targetId && a.side === b.side && sameLine(a.line, b.line);
  return a.kind === b.kind;
}

function sameLine(a: DropLine, b: DropLine): boolean {
  return a.orientation === b.orientation && a.x === b.x && a.y === b.y && a.length === b.length;
}

/**
 * Every place a keyboard drag can stop, in reading order: each gap of each
 * list, with the gaps of a container's own list right after the gap before
 * it, and the empty containers. `start` is where the moved block stands now:
 * the next target is `targets[start]`, the previous `targets[start - 1]`.
 */
export function keyboardTargets(scene: DropScene, subject: DragSubject): { targets: DropTarget[]; start: number } {
  const targets: DropTarget[] = [];
  let start = 0;
  const push = (target: DropTarget | null): void => {
    if (target && allowed(scene, subject, target) && !isNoMove(scene.layout, subject, target)) targets.push(target);
  };
  const visit = (parentId: string | null, list: readonly TemplateBlock[]): void => {
    const drawn = drawnOf(scene, list);
    const box = parentId ? scene.boxes.get(parentId) : undefined;
    const container = parentId ? findBlock(scene.layout.blocks, parentId)?.block : undefined;
    if (container && box && drawn.every((entry) => entry.block.id === subject.movingId)) {
      if (drawn.length > 0) start = targets.length;
      push({ kind: 'into', parentId: container.id, outline: dropBox(container, box) });
      return;
    }
    drawn.forEach((entry, at) => {
      push(gapTarget(scene, parentId, drawn, at, null));
      if (entry.block.id === subject.movingId) start = targets.length;
      else if (isContainerBlock(entry.block)) visit(entry.block.id, entry.block.blocks);
    });
    push(gapTarget(scene, parentId, drawn, drawn.length, null));
  };
  visit(null, scene.layout.blocks);
  return { targets, start };
}
