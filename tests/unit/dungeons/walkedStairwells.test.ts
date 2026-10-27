import { describe, expect, it } from 'vitest';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { bottomUp, stackOf, stairEnd } from '../../../src/app/dungeons/floors/floorStack';
import { approachCells, spotRect, type StairEnd } from '../../../src/app/dungeons/floors/stairSpots';
import { cellsOf, floorRect, inRect } from '../../../src/app/dungeons/geometry';
import type { DungeonStair } from '../../../src/app/dungeons/model';
import type { ThemeId } from '../../../src/app/dungeons/themes/themeTypes';
import { stairLinks } from '../../../src/app/dungeons/scene/toStairs';
import { flightSides, levelLinkList, linkAt } from '../../../src/app/levels/levelLinks';
import { moveWallsOf, reaches } from '../../../src/app/online/movement/index.ts';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';

const PX = 100;
const SEEDS = 100;

/**
 * Every stairwell of generated dungeons, walked as the plan says: from the free row before each
 * floor's end of it, onto its ground end, and a change of floor only in the last row at the other
 * end; the sides closed on both floors. Held by moving across cells, as a player's token moves.
 */
describe('a generated dungeon\'s stairwells are walked', () => {
  for (const theme of ['fortress', 'mansion', 'cavern'] as const satisfies readonly ThemeId[]) for (const floors of [2, 3, 4]) {
    it(`from the end at each floor's ground to the far row, over ${SEEDS} ${theme} dungeons of ${floors} floors`, () => {
      let stairwells = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const model = generateDungeon({ seed: seed * 7919 + floors, tags: ['medium'], floors, theme });
        const ids = model.floors.map((_, index) => `floor-${index}`);
        const stack = stackOf(model);
        // The scene lists its levels bottom first.
        const levels: SceneLevel[] = bottomUp(stack).map((index) => ({ id: ids[index]!, elevation: { bottom: 0, top: 10 }, background: null }));
        const placement = { originCell: { x: 0, y: 0 }, pxPerCell: PX };
        const links = levelLinkList(stairLinks(model, ids, placement));
        const centre = (cell: { x: number; y: number }): { x: number; y: number } => ({ x: (cell.x + 0.5) * PX, y: (cell.y + 0.5) * PX });
        model.floors.forEach((floor, index) => {
          for (const stair of floor.stairs) {
            stairwells += 1;
            const where = `seed ${seed}, floor ${index}, stair ${stair.link}`;
            const link = links.find((entry) => entry.id === `levellink_dungeon_${stair.link}`);
            expect(link?.flight, where).toBeDefined();
            const end: StairEnd = stairEnd(stack, index, stair.to);
            // The row it is entered from is the floor of the room that holds it.
            const room = floor.rooms.find((r) => cellsOf(spotRect(stair)).every((c) => inRect(floorRect(r), c.x, c.y)));
            expect(room, `${where}: in no room`).toBeDefined();
            for (const c of approachCells(stair, end)) expect(inRect(floorRect(room!), c.x, c.y), `${where}: entered from ${c.x},${c.y}, off the room's floor`).toBe(true);
            walk(stair, end, ids[index]!, levels, links, centre, where);
          }
        });
      }
      expect(stairwells).toBeGreaterThan(SEEDS * (floors - 1) * 2 - 1);
    });
  }
});

/** One end of a stairwell on its floor, checked cell by cell. */
function walk(stair: DungeonStair, end: StairEnd, level: string, levels: SceneLevel[], links: ReturnType<typeof levelLinkList>, centre: (cell: { x: number; y: number }) => { x: number; y: number }, where: string): void {
  const sides = moveWallsOf(flightSides(links, level, levels).map(([a, b]) => [a.x, a.y, b.x, b.y] as const), 1);
  const cells = cellsOf(spotRect(stair));
  // Upstairs the treads go down towards `down`: the far row lies that way; downstairs the far row is the high end.
  const far = (cell: { x: number; y: number }): boolean => {
    const rect = spotRect(stair);
    const toward = end === 'upper' ? stair.down : { x: -stair.down.x, y: -stair.down.y };
    if (toward.x > 0) return cell.x === rect.x1;
    if (toward.x < 0) return cell.x === rect.x0;
    if (toward.y > 0) return cell.y === rect.y1;
    return cell.y === rect.y0;
  };
  for (const cell of cells) {
    const changes = linkAt(links, centre(cell), level, levels) !== null;
    expect(changes, `${where}: cell ${cell.x},${cell.y}`).toBe(far(cell));
  }
  // Every cell of the free row it is entered from steps onto the stairs; any other neighbour does not.
  const inside = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
  const entry = new Set(approachCells(stair, end).map((cell) => `${cell.x},${cell.y}`));
  for (const cell of cells) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const outside = { x: cell.x + dx, y: cell.y + dy };
      if (inside.has(`${outside.x},${outside.y}`)) continue;
      const open = entry.has(`${outside.x},${outside.y}`);
      expect(reaches(sides, centre(outside), centre(cell)), `${where}: ${outside.x},${outside.y} → ${cell.x},${cell.y}`).toBe(open);
      expect(reaches(sides, centre(cell), centre(outside)), `${where}: ${cell.x},${cell.y} → ${outside.x},${outside.y}`).toBe(open);
    }
  }
  // Arriving from the far row of the other floor lands here on the ground end, which changes nothing.
  const other = links.find((link) => link.id === `levellink_dungeon_${stair.link}`)!;
  const otherLevel = (other.levels as string[]).find((id) => id !== level)!;
  for (const cell of cells) {
    if (linkAt(links, centre(cell), otherLevel, levels) === null) continue;
    expect(linkAt(links, centre(cell), level, levels), `${where}: arrival at ${cell.x},${cell.y}`).toBeNull();
  }
}
