import type { Point } from '../../types/visionTypes';

export type PopoverSide = 'right' | 'left' | 'below' | 'above';

/** Where the popover sits relative to its light. */
export interface PopoverChoice {
  side: PopoverSide;
  /** Beyond the light's bright ring instead of right beside its marker. */
  outside: boolean;
}

export interface LightPopoverPlacementInput {
  /** The light, in the pixels of the area the popover is placed in. */
  anchor: Point;
  /** From the light to the popover's near edge beside the marker: the marker's radius and a gap. */
  markerClearance: number;
  /** The same beyond the bright ring: its radius and a gap. */
  ringClearance: number;
  /** Radius of the bright ring: its disc is what the GM is tuning and wants to see. */
  bright: number;
  /** The ring handles on the map. */
  handles: readonly Point[];
  size: { width: number; height: number };
  /** The height by which it stands level with the light when beside it; unset, its own: one that grew since it took its place keeps its top edge. */
  level?: number;
  area: { width: number; height: number };
  /** Bars along the top and bottom of the area (scene tabs, toolbars) the popover keeps clear of. */
  inset?: { top: number; bottom: number };
  /** The choice the popover is on; it stays while it holds, so the popover does not jump as the map pans or the light is tuned. */
  current: PopoverChoice | null;
  margin?: number;
}

export interface LightPopoverPlacement {
  x: number;
  y: number;
  choice: PopoverChoice;
  /** `current` held: the popover stays on its side. */
  kept: boolean;
  /** The light, relative to the popover's box: its transform origin. */
  origin: Point;
}

interface Candidate {
  choice: PopoverChoice;
  x: number;
  y: number;
  /** It sits at its clearance from the light, not pushed over it by an edge. */
  fits: boolean;
  /** How far an edge pushed it towards the light, in steps of 8 px. */
  pushed: number;
  coversHandle: boolean;
  /** Tenths of the popover that lie over the bright disc. */
  overlap: number;
}

const HANDLE_REACH = 12;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(Math.max(min, max), value));
const sameChoice = (a: PopoverChoice, b: PopoverChoice): boolean => a.side === b.side && a.outside === b.outside;

/** How much of the box lies over the disc, in tenths of the box, from a grid of sample points. */
function discOverlap(x: number, y: number, size: { width: number; height: number }, center: Point, radius: number): number {
  const steps = 10;
  let inside = 0;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const px = x + ((i + 0.5) / steps) * size.width;
      const py = y + ((j + 0.5) / steps) * size.height;
      if (Math.hypot(px - center.x, py - center.y) <= radius) inside++;
    }
  }
  return Math.round(inside / 10);
}

/**
 * Where the popover of a light goes. It is tried on each side of the light, beyond the bright
 * ring and right beside the marker, and takes the first of: a place it fits without being
 * pushed over the light, one that covers no ring handle, the one an edge pushes least towards
 * the light, the one that covers least of the bright disc, the roomier side, beside before
 * below or above. It keeps the place it has while
 * that still fits and covers no handle. It stays inside the area and clear of the bars along
 * its top and bottom.
 */
export function placeLightPopover(input: LightPopoverPlacementInput): LightPopoverPlacement {
  const { anchor, size, area, handles, current, margin = 8 } = input;
  const inset = input.inset ?? { top: 0, bottom: 0 };
  const minX = margin;
  const maxX = area.width - margin - size.width;
  const minY = inset.top + margin;
  const maxY = area.height - inset.bottom - margin - size.height;

  const evaluate = (choice: PopoverChoice): Candidate => {
    const clearance = choice.outside ? input.ringClearance : input.markerClearance;
    const beside = choice.side === 'right' || choice.side === 'left';
    const idealX = choice.side === 'right' ? anchor.x + clearance : choice.side === 'left' ? anchor.x - clearance - size.width : anchor.x - size.width / 2;
    const idealY = choice.side === 'below' ? anchor.y + clearance : choice.side === 'above' ? anchor.y - clearance - size.height : anchor.y - (input.level ?? size.height) / 2;
    const x = Math.round(clamp(idealX, minX, maxX));
    const y = Math.round(clamp(idealY, minY, maxY));
    const push = beside ? Math.abs(x - idealX) : Math.abs(y - idealY);
    const fits = push < 1;
    const coversHandle = handles.some((handle) =>
      handle.x > x - HANDLE_REACH && handle.x < x + size.width + HANDLE_REACH && handle.y > y - HANDLE_REACH && handle.y < y + size.height + HANDLE_REACH);
    return { choice, x, y, fits, pushed: Math.round(push / 8), coversHandle, overlap: discOverlap(x, y, size, anchor, input.bright) };
  };

  const placed = (candidate: Candidate, kept: boolean): LightPopoverPlacement =>
    ({ x: candidate.x, y: candidate.y, choice: candidate.choice, kept, origin: { x: anchor.x - candidate.x, y: anchor.y - candidate.y } });

  if (current) {
    const held = evaluate(current);
    if (held.fits && !held.coversHandle) return placed(held, true);
  }

  const roomier: PopoverSide = area.width - anchor.x >= anchor.x ? 'right' : 'left';
  const other: PopoverSide = roomier === 'right' ? 'left' : 'right';
  const lower: PopoverSide = maxY - anchor.y >= anchor.y - minY ? 'below' : 'above';
  const upper: PopoverSide = lower === 'below' ? 'above' : 'below';
  const sides = [roomier, other, lower, upper];
  // A ring no wider than the marker has no "outside" of its own.
  const distances = input.ringClearance > input.markerClearance ? [true, false] : [false];
  const order = distances.flatMap((outside) => sides.map((side) => ({ side, outside })));
  const rank = (candidate: Candidate, index: number): number[] =>
    [candidate.fits ? 0 : 1, candidate.coversHandle ? 1 : 0, candidate.pushed, candidate.overlap, index];

  const ranked = order.map((choice, index) => {
    const candidate = evaluate(choice);
    return { candidate, rank: rank(candidate, index) };
  });
  const chosen = ranked.reduce((best, next) => (isLower(next.rank, best.rank) ? next : best)).candidate;
  return placed(chosen, !!current && sameChoice(chosen.choice, current));
}

/** Whether rank `a` comes before `b`, value by value. */
function isLower(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! < b[i]!;
  }
  return false;
}
