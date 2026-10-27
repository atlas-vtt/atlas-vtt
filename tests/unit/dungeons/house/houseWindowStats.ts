import { levelOf, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import type { DungeonModel } from '../../../../src/app/dungeons/model';
import { area, floorMirrors, isStore, mainFront, windowsOf } from './houseWindowRules';

/** The numbers of a house's windows, for the report 2026-10-25-mansion-windows-research (`VITE_WINDOW_STATS=print`). */

/** The windows of every floor above ground on the main front's line, and how many have their mirror about the front door. */
function frontSymmetry(model: DungeonModel): { windows: number; mirrored: number } {
  const stack = stackOf(model);
  const { y, dir, axis2 } = mainFront(model);
  let windows = 0;
  let mirrored = 0;
  model.floors.forEach((floor, i) => {
    if (levelOf(stack, i) < 0 || !floorMirrors(floor, axis2)) return;
    const front = windowsOf(floor).filter((w) => w.dir.x === dir.x && w.dir.y === dir.y && Math.abs(w.y - y) <= 1);
    const at = new Set(front.map((w) => `${w.x},${w.y}`));
    windows += front.length;
    mirrored += front.filter((w) => at.has(`${axis2 - 1 - w.x},${w.y}`)).length;
  });
  return { windows, mirrored };
}

/** Windows per room by the room's size, for the report: area buckets of ≤ 8, 9–15, 16–30 and over 30 cells. */
export function windowStats(models: readonly DungeonModel[], isMirrored: (m: DungeonModel) => boolean): Record<string, number | string> {
  const buckets = [8, 15, 30, Infinity];
  const sums = buckets.map(() => ({ rooms: 0, windows: 0 }));
  let stores = 0;
  let storeWindows = 0;
  let corridorWindows = 0;
  let total = 0;
  let mirrored = 0;
  let front = 0;
  for (const model of models) {
    const stack = stackOf(model);
    model.floors.forEach((floor, i) => {
      if (levelOf(stack, i) < 0) return;
      total += windowsOf(floor).length;
      for (const room of floor.rooms) {
        const n = windowsOf(floor).filter((w) => w.room === room.id).length;
        if (room.kind === 'corridor') {
          corridorWindows += n;
          continue;
        }
        if (isStore(room)) {
          stores++;
          storeWindows += n;
        }
        const b = buckets.findIndex((max) => area(room) <= max);
        sums[b]!.rooms++;
        sums[b]!.windows += n;
      }
    });
    if (isMirrored(model)) {
      const s = frontSymmetry(model);
      front += s.windows;
      mirrored += s.mirrored;
    }
  }
  const per = (k: number): string => (sums[k]!.windows / Math.max(1, sums[k]!.rooms)).toFixed(2);
  return { '≤8 cells': per(0), '9–15': per(1), '16–30': per(2), '>30': per(3), 'windows in stores per store': (storeWindows / Math.max(1, stores)).toFixed(2), 'corridor windows': corridorWindows, windows: total, 'front mirrored share': (mirrored / Math.max(1, front)).toFixed(3) };
}
