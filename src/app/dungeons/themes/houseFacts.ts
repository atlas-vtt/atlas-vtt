/**
 * What a Haunted Mansion built as a house knows of its rooms beyond their types (`ThemeFacts`): a
 * fireplace stands only on a wall a chimney stack stands behind, back to back with the room across
 * (research §5.7), so every hearth has its reason.
 */

import { cellKey, cellsOf, floorRect } from '../geometry';
import type { ThemeFacts, ThemeFactsInput } from './themeTypes';

export function houseFacts({ floors }: ThemeFactsInput): ThemeFacts {
  const stacks = floors.map((floor) => new Set((floor.house?.stacks ?? []).flatMap((s) => cellsOf(floorRect(s)).map((c) => cellKey(c.x, c.y)))));
  return {
    allows: () => true,
    score: () => 0,
    richness: () => 1,
    placeAllowed: (kind, at, room) => {
      if (kind !== 'hearth') return true;
      const own = stacks[room.floor];
      return !!own && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => own.has(cellKey(Math.floor(at.x) + dx!, Math.floor(at.y) + dy!)));
    },
  };
}
