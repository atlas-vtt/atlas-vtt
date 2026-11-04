/** Finding the gap under the pointer in the drawn card, for the `+` line (§7.6). */

import { gapAt, type Box, type GapLine, type Point } from './gapGeometry';

/** The lists the card lays blocks out in: the top level's columns, a Section's stack, a Row. */
const LISTS = '.atlas-sb-columns, .atlas-sb-stack, .atlas-sb-row';

export interface CanvasGap {
  /** The container the gap is in; null at the top level. */
  parentId: string | null;
  /** The block after the gap: an insert lands right before it. */
  nextId: string;
  /** The line to draw, in the stage's coordinates. */
  line: GapLine;
}

export function boxIn(stage: Element, element: Element): Box {
  const outer = stage.getBoundingClientRect();
  const inner = element.getBoundingClientRect();
  return { left: inner.left - outer.left, top: inner.top - outer.top, right: inner.right - outer.left, bottom: inner.bottom - outer.top };
}

function framesOf(list: Element): HTMLElement[] {
  return [...list.children].filter((child): child is HTMLElement =>
    child.instanceOf(HTMLElement) && child.hasAttribute('data-block-id') && child.getClientRects().length > 0);
}

function containerIdOf(list: Element): string | null {
  if (list.classList.contains('atlas-sb-columns')) return null;
  return list.closest('[data-block-id]')?.getAttribute('data-block-id') ?? null;
}

/**
 * The gap the point (in the stage's coordinates) lies in, looking from the
 * innermost list around `target` outwards; null where it lies in none.
 */
export function gapUnder(stage: HTMLElement, target: Element, point: Point): CanvasGap | null {
  for (let list = target.closest(LISTS); list && stage.contains(list); list = list.parentElement?.closest(LISTS) ?? null) {
    const frames = framesOf(list);
    const line = gapAt(frames.map((frame) => boxIn(stage, frame)), point, list.classList.contains('atlas-sb-row') ? 'row' : 'stack');
    const next = line ? frames[line.index]?.getAttribute('data-block-id') : null;
    if (line && next) return { parentId: containerIdOf(list), nextId: next, line };
  }
  return null;
}

export function sameGap(a: CanvasGap | null, b: CanvasGap | null): boolean {
  return a?.parentId === b?.parentId && a?.nextId === b?.nextId;
}
