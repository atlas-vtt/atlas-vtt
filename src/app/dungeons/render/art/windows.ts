/**
 * A house's windows (`DungeonFloor.windows`), drawn once through a hand: the outer wall stops over
 * the window's span (`clipOutsideMouths`), and in its thickness stands a manor window as the plan
 * cuts it. Its reveals close the wall at both ends; a stone sill runs out past the outer face, a
 * timber window board lies on the inner one, and in the middle of the wall stands the frame, its
 * lights of glass divided by stone mullions and each light by glazing bars. A window of any length
 * along its wall takes as many lights as fit: a stair hall's tall window three or more, each crossed
 * by two bars, a closet's or cellar's small one a single pane.
 */

import type { DungeonWindow, WindowSize } from '../../model';
import { OUTER_WALL, windowSpan } from '../houseShapes';
import type { Vec } from '../geometry';
import type { VisibleFloor } from '../visibleDungeon';
import type { Hand } from './hand';
import { axisFrame, polysPath } from './paths';

/** The windows of the rooms a view shows. */
export function shownWindows(dungeon: Pick<VisibleFloor, 'floor' | 'rooms'>): DungeonWindow[] {
  const windows = dungeon.floor.windows ?? [];
  if (windows.length === 0) return windows;
  const shown = new Set(dungeon.rooms.map((room) => room.id));
  return windows.filter((window) => shown.has(window.room));
}

/** Across the wall from its middle (+ outwards), in cells. */
const SILL = { inner: OUTER_WALL / 2 - 0.08, outer: OUTER_WALL / 2 + 0.05, overhang: 0.05 };
const BOARD = 0.045;
const FRAME = 0.05;
const MULLION = 0.022;
/** A light is about this wide. */
const LIGHT = 0.32;
/** By a window's size, the fewest lights it takes and the glazing bars across each. */
const GLAZING: Readonly<Record<WindowSize | 'facade', { fewest: number; bars: number }>> = {
  facade: { fewest: 2, bars: 1 },
  tall: { fewest: 3, bars: 2 },
  small: { fewest: 1, bars: 0 },
};

/** Every shown window. */
export function drawWindows(hand: Hand): void {
  drawWindowsOf(hand, shownWindows(hand.scene.env.dungeon));
}

/** Windows part by part across all of them, so each part is one call to the hand. */
export function drawWindowsOf(hand: Hand, windows: readonly DungeonWindow[]): void {
  const parts = windows.map(windowParts);
  if (parts.length === 0) return;
  const all = <K extends keyof WindowParts>(key: K): WindowParts[K][] => parts.map((part) => part[key]);
  // The embrasure's floor of stone, then the board inside and the sill outside, standing on it.
  hand.surface(polysPath(all('embrasure')), 'stone');
  hand.surface(polysPath(all('board')), 'wood');
  hand.surface(polysPath(all('sill')), 'dressed');
  for (const sill of all('sill')) hand.edges(sill, true);
  // The frame: glass between two rails, its lights divided by mullions and glazing bars.
  hand.surface(polysPath(all('frame')), 'glass');
  const mullions = all('mullions').flat();
  hand.surface(polysPath(mullions), 'dressed');
  for (const mullion of mullions) hand.edges(mullion, true);
  hand.line([...all('board'), ...all('fine').flat()], 'fine', true);
  // The reveals: the wall's cut faces at both ends.
  hand.line(all('reveals').flat(), 'outline');
}

interface WindowParts {
  embrasure: Vec[];
  board: Vec[];
  sill: Vec[];
  frame: Vec[];
  mullions: Vec[][];
  /** The sill's line on the outer face, the frame's rails and its glazing bars. */
  fine: Vec[][];
  reveals: Vec[][];
}

/** One window's parts in its own frame: `u` along its span from one reveal, `v` across the wall, outwards. */
function windowParts(window: DungeonWindow): WindowParts {
  const [a, b] = windowSpan(window);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const { at, quad } = axisFrame(a, { x: (b.x - a.x) / len, y: (b.y - a.y) / len }, window.dir);
  const half = OUTER_WALL / 2;
  const glazing = GLAZING[window.size ?? 'facade'];
  const lights = Math.max(glazing.fewest, Math.round(len / LIGHT));
  const width = len / lights;
  const bars = Array.from({ length: lights * glazing.bars }, (_, k) => (Math.floor(k / glazing.bars) + ((k % glazing.bars) + 1) / (glazing.bars + 1)) * width);
  return {
    embrasure: quad(0, -half, len, half),
    board: quad(0, -half, len, -half + BOARD),
    sill: quad(-SILL.overhang, SILL.inner, len + SILL.overhang, SILL.outer),
    frame: quad(0, -FRAME, len, FRAME),
    mullions: Array.from({ length: lights - 1 }, (_, k) => quad((k + 1) * width - MULLION, -FRAME, (k + 1) * width + MULLION, FRAME)),
    fine: [
      [at(-SILL.overhang, half), at(len + SILL.overhang, half)],
      [at(0, -FRAME), at(len, -FRAME)],
      [at(0, FRAME), at(len, FRAME)],
      ...bars.map((u) => [at(u, -FRAME), at(u, FRAME)]),
    ],
    reveals: [[at(0, -half), at(0, half)], [at(len, -half), at(len, half)]],
  };
}
