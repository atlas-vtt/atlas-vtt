import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { cellsInArea } from '../measureCells';
import { shapedArea, type ShapedArea } from '../measureGeometry';
import { cellCentreAt } from '../measureGrid';
import type { Measurement } from '../measureTypes';
import { tokensInArea, type AreaToken } from '../measureTokens';
import { POINTY, RULES } from './areaTestKit';

const GRID: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };

function area(measurement: Measurement): ShapedArea {
  const made = shapedArea(measurement, RULES);
  if (!made) throw new Error('no area');
  return made;
}

const token = (id: string, x: number, y: number, more: Partial<AreaToken> = {}): AreaToken => ({ id, x, y, ...more });

/** Two cells around the corner (140, 140): it covers the twelve cells around that corner under the half rule. */
const CIRCLE = area({ shape: 'circle', points: [{ x: 140, y: 140 }, { x: 280, y: 140 }] });

function inCircle(tokens: AreaToken[], grid: GridGeometry | null = GRID, hidden?: boolean): string[] {
  return tokensInArea(tokens, CIRCLE, grid, cellsInArea(grid, CIRCLE, 'half'), hidden);
}

describe('tokensInArea', () => {
  it('takes a token whose cell the area covers, wherever in the cell the area ends', () => {
    // The corner cell (0, 0) is not half covered; the cell (1, 0) is, though its centre lies outside the circle.
    expect(CIRCLE.contains({ x: 105, y: 35 })).toBe(true);
    expect(CIRCLE.contains({ x: 35, y: 35 })).toBe(false);
    expect(inCircle([token('in', 105, 105), token('edge', 105, 35), token('corner', 35, 35), token('far', 525, 105)])).toEqual(['in', 'edge']);
  });

  it('takes a large token when one of the cells it stands on is covered', () => {
    // Two cells across, standing where four cells meet.
    const large = { size: 1.5 };
    expect(inCircle([token('touching', 0, 140, large), token('beside', -70, 140, large)])).toEqual(['touching']);
    // Three cells across, around its own cell.
    expect(inCircle([token('huge', 315, 105, { size: 2 }), token('medium', 315, 105)])).toEqual(['huge']);
  });

  it('takes a token on a hex grid by the hexes it stands on', () => {
    const origin = cellCentreAt(POINTY, { x: 300, y: 300 });
    const made = area({ shape: 'circle', points: [origin, { x: origin.x + 1.2 * POINTY.size, y: origin.y }] });
    const cells = cellsInArea(POINTY, made, 'centre');
    expect(cells).toHaveLength(7);
    const beyond = { x: origin.x + 2 * POINTY.size, y: origin.y };
    expect(tokensInArea([token('next', origin.x + POINTY.size, origin.y), token('beyond', beyond.x, beyond.y), token('large', beyond.x, beyond.y, { size: 2 })], made, POINTY, cells))
      .toEqual(['next', 'large']);
  });

  it('counts a token placed freely where cells meet for the cell its centre is in', () => {
    expect(inCircle([token('on a corner', 140, 140), token('outside', 420, 420)])).toEqual(['on a corner']);
  });

  it('asks only where the token\'s centre is without cells', () => {
    const tokens = [token('in', 105, 105), token('edge', 105, 35), token('at the rim', 279, 140, { size: 2 }), token('past the rim', 285, 140, { size: 2 })];
    expect(inCircle(tokens, null)).toEqual(['in', 'edge', 'at the rim']);
    // An area too large to count cells in.
    expect(tokensInArea(tokens, CIRCLE, GRID, null)).toEqual(['in', 'edge', 'at the rim']);
  });

  it('leaves hidden tokens out when asked to, and tokens at no place always', () => {
    const tokens = [token('shown', 105, 105), token('hidden', 175, 105, { isHidden: true }), token('nowhere', Number.NaN, 105)];
    expect(inCircle(tokens)).toEqual(['shown', 'hidden']);
    expect(inCircle(tokens, GRID, false)).toEqual(['shown']);
    expect(inCircle(tokens, null, false)).toEqual(['shown']);
  });
});
