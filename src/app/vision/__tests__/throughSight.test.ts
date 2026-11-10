import { describe, expect, it } from 'vitest';
import { levelStack, stackGrid } from '../../levels/levelStack';
import type { TokenEntity } from '../../types';
import type { LevelSurface } from '../../types/sceneLevelTypes';
import type { WallSegment } from '../../types/wallTypes';
import { computeSight, lightReach, NO_SIGHT, SEES_ALL, sightSources } from '../sight';
import { belowTokenPerception, perceiveBelow, SightBelow, sightBelow, type BelowSight } from '../throughSight';
import { darkvision, tremorsense } from './senseSources';
import type { FogCoverage } from '../../fog/fogCoverage';

const rect = (x: number, y: number, w: number, h: number): LevelSurface['polygon'] => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, type: 'solid' });
const token = (id: string, x: number, y: number, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x, y, imagePath: '', ...extra }) as TokenEntity;

/** A 400 px map: an opening in the upper floor from x 100 to 300 (all y), a wall on the upper floor along x = 200 from y 0 to 150. */
const grid = stackGrid({ width: 400, height: 400 });
const stack = levelStack(
  { id: 'upper', surfaces: [{ id: 'hole', kind: 'level-surface', open: true, polygon: rect(100, 0, 200, 400) }] },
  [{ id: 'ground', surfaces: [] }],
  ['ground'],
  grid,
);
const upperWalls = [wall('w', 200, 0, 200, 150)];
const viewer = (senses = [darkvision(1000)]): ReturnType<typeof computeSight> =>
  computeSight([{ tokenId: 'v', origin: { x: 50, y: 50 }, range: 1000, senses }], upperWalls);
const day = { ambient: 1 };
const night = { ambient: 0 };

function below(sight: ReturnType<typeof computeSight>, ambient = day, reaches: BelowSight['reaches'] = []): BelowSight {
  return { stack, index: 1, sight, ambient, reaches };
}

describe('sight through openings', () => {
  it('looks down with the senses that walls stop, never with one that senses through them', () => {
    const own = computeSight([], []);
    const through = sightBelow(viewer([darkvision(1000), tremorsense(300)]), own);
    expect(through.regions.map((region) => region.sense.id).sort()).toEqual(['darkvision', 'sight']);
  });

  it('sees all below while the view sees all, and keeps the level\'s own tokens\' sight beside the view\'s', () => {
    expect(sightBelow(SEES_ALL, NO_SIGHT)).toBe(SEES_ALL);
    const own = computeSight([{ tokenId: 'b', origin: { x: 350, y: 350 }, range: 1000, senses: [] }], []);
    expect(sightBelow(NO_SIGHT, own).regions).toEqual(own.regions);
  });

  it('is the same sight while the sights it is made of are', () => {
    const memo = new SightBelow();
    const view = viewer();
    expect(memo.of(view, NO_SIGHT)).toBe(memo.of(view, NO_SIGHT));
    expect(memo.of(viewer(), NO_SIGHT)).not.toBe(memo.of(view, NO_SIGHT));
  });

  it('perceives a point below only where the stack shows that level, and only as far as the view\'s own walls let it', () => {
    const through = below(sightBelow(viewer(), NO_SIGHT));
    expect(perceiveBelow({ x: 150, y: 50 }, through)).toBe('seen');
    // On the viewer's own floor the level below is not shown.
    expect(perceiveBelow({ x: 50, y: 50 }, through)).toBe('unseen');
    // Behind the upper floor's wall the viewer sees nothing of the opening.
    expect(perceiveBelow({ x: 250, y: 20 }, through)).toBe('unseen');
    // Past the wall's end it does.
    expect(perceiveBelow({ x: 250, y: 300 }, through)).toBe('seen');
  });

  it('takes the light of the level below: dark there is seen only by a sense that sees in the dark', () => {
    const plain = below(sightBelow(computeSight([{ tokenId: 'v', origin: { x: 50, y: 50 }, range: 1000, senses: [] }], upperWalls), NO_SIGHT), night);
    expect(perceiveBelow({ x: 150, y: 50 }, plain)).toBe('unseen');
    const lamp = lightReach({ x: 150, y: 50 }, 40, []);
    expect(perceiveBelow({ x: 150, y: 50 }, { ...plain, reaches: [lamp] })).toBe('seen');
    expect(perceiveBelow({ x: 150, y: 50 }, below(sightBelow(viewer(), NO_SIGHT), night))).toBe('seen');
  });

  it('sees a token at the stack\'s edge by its centre: the texels the opening\'s outline touches show the floor above', () => {
    const through = below(sightBelow(viewer(), NO_SIGHT));
    expect(perceiveBelow({ x: 101.5, y: 50 }, through)).toBe('seen');
    expect(perceiveBelow({ x: 100.5, y: 50 }, through)).toBe('unseen');
    expect(perceiveBelow({ x: 99.5, y: 50 }, through)).toBe('unseen');
  });
});

describe('tokens below', () => {
  const tokens = {
    seen: token('seen', 150, 60),
    under: token('under', 50, 60),
    hidden: token('hidden', 160, 60, { isHidden: true }),
    party: token('party', 250, 350, { vision: { enabled: true } }),
    elsewhere: token('elsewhere', 60, 350, { vision: { enabled: true } }),
  };
  const fogAt = (x: number): FogCoverage => ({ shape: [], covers: (point) => point.x > x });

  it('show where the stack shows their level and the view perceives them, never hidden, the party wherever an opening shows it', () => {
    const own = computeSight(sightSources({ party: tokens.party }, { cellSize: 70, unitDistance: 5 } as never, { width: 400, height: 400 }), []);
    const perception = belowTokenPerception(below(sightBelow(viewer(), own)), tokens, { viewed: undefined, below: undefined });
    expect(['seen', 'under', 'hidden', 'party', 'elsewhere', 'gone'].map((id) => perception(id))).toEqual(['seen', 'unseen', 'unseen', 'seen', 'unseen', 'unseen']);
  });

  it('hide under the committed fog of either level, and all of them while a fog cannot be read', () => {
    const through = below(sightBelow(viewer(), NO_SIGHT));
    expect(belowTokenPerception(through, tokens, { viewed: fogAt(140), below: undefined })('seen')).toBe('unseen');
    expect(belowTokenPerception(through, tokens, { viewed: undefined, below: fogAt(140) })('seen')).toBe('unseen');
    expect(belowTokenPerception(through, tokens, { viewed: fogAt(1000), below: fogAt(1000) })('seen')).toBe('seen');
    expect(belowTokenPerception(through, tokens, { viewed: null, below: undefined })('seen')).toBe('unseen');
  });
});
