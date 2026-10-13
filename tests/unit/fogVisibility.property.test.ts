import { Container } from 'pixi.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { playerDoorSight } from '../../src/app/pixi/lighting/playerLightingLayers';
import { tokenPerception } from '../../src/app/vision/tokenPerception';
import { PlayerSightTokens } from '../../src/app/pixi/token-renderer/PlayerSightTokens';
import type { TokenGroupContainer } from '../../src/app/pixi/token-renderer/types';
import { rng } from '../../src/app/pixi/lighting/engine/__tests__/fuzzRooms';
import type { TokenEntity } from '../../src/app/types';
import type { FogRectangleFill } from '../../src/app/types/fogTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { computeSight } from '../../src/app/vision/sight';
import { tremorsense } from '../../src/app/vision/__tests__/senseSources';
import { fogRectangle } from '../helpers/fogOperations';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

/** Independent rectangle replay. Samples avoid integer edges; exact boundaries have named unit cases. */
function rectangleCoverage(operations: readonly FogRectangleFill[], point: Point): boolean {
  let covered = false;
  for (const op of [...operations].sort((a, b) => a.timestamp - b.timestamp)) {
    const left = op.x + (op.offsetX ?? 0);
    const top = op.y + (op.offsetY ?? 0);
    if (point.x > left && point.x < left + op.width && point.y > top && point.y < top + op.height) covered = !op.isErasing;
  }
  return covered;
}

function sprite(token: TokenEntity, point: Point): TokenGroupContainer {
  const group = Object.assign(new Container(), { tokenId: token.id, tokenData: token, tokenSize: 20, artPath: token.imagePath, strokeWidth: 0 });
  group.position.set(point.x, point.y);
  return group;
}

const conditions = [{ id: 'invisible', name: 'Invisible', color: '#000000', effect: 'invisible' as const }];
const sight = computeSight([{ tokenId: 'source', origin: { x: 0, y: 0 }, range: 160, senses: [tremorsense(240)] }], []);

let restoreGraphics: () => void;
beforeEach(() => { restoreGraphics = stubJsdomGraphics(); });
afterEach(() => { restoreGraphics(); });

describe('fog eligibility against the existing lighting rules', () => {
  it('adds only centre and midpoint exclusion on seeded paint/erase histories', () => {
    const random = rng(0x6f09);
    const integer = (max: number): number => Math.floor(random() * max);
    const point = (): Point => ({ x: integer(440) - 120 + 1 / 32, y: integer(440) - 120 + 1 / 32 });
    const exercised = { seen: 0, sensed: 0, unseen: 0, covered: 0, heldOutside: 0, doorRemoved: 0 };
    for (let trial = 0; trial < 80; trial++) {
      const operations = Array.from({ length: 2 + integer(10) }, (_, i) => fogRectangle({
        id: String(i), timestamp: integer(5), isErasing: random() < 0.35,
        x: integer(360) - 120, y: integer(360) - 120, width: 20 + integer(220), height: 20 + integer(220),
        offsetX: integer(40) - 20, offsetY: integer(40) - 20,
      }));
      const coverage = fogCoverage(Object.fromEntries(operations.map((op) => [op.id, op])));
      const tokens: Record<string, TokenEntity> = {};
      const sprites: Record<string, TokenGroupContainer> = {};
      const held: Record<string, Point> = {};
      const walls: Record<string, WallSegment> = {};
      for (let i = 0; i < 12; i++) {
        const id = String(i);
        const token: TokenEntity = { id, kind: 'token', imagePath: 'token.png', ...point(),
          ...(i % 4 === 0 && { vision: { enabled: true } }),
          ...(i % 4 === 1 && { conditions: ['invisible'] }),
          ...(i === 11 && { isHidden: true }),
        };
        tokens[id] = token;
        sprites[id] = sprite(token, point());
        if (i % 3 === 0) held[id] = { x: token.x - 1, y: token.y };
        const middle = point();
        walls[id] = { id, kind: 'wall', type: i % 4 === 0 ? 'secret-door' : 'door',
          p1: { x: middle.x - 10, y: middle.y }, p2: { x: middle.x + 10, y: middle.y }, closed: true };
      }
      const enabled = trial % 3 !== 0;
      const ambient = { ambient: trial % 2 };
      const legacy = enabled ? tokenPerception(sight, ambient, [], tokens, { conditions, held }) : undefined;
      const presentation = new PlayerSightTokens({ tokens: () => tokens, sprites: () => sprites, held: () => new Set(Object.keys(held)) });
      presentation.setFogProvider(() => coverage, () => true);
      presentation.setProvider(() => legacy);
      try {
        const composed = presentation.framePerception(legacy);
        const layers = presentation.frameLayers(composed);
        for (const token of Object.values(tokens)) {
          const id = token.id;
          const blocked = rectangleCoverage(operations, sprites[id]!);
          const before = legacy?.(id) ?? 'seen';
          exercised[before]++;
          if (blocked) exercised.covered++;
          const hidden = token.isHidden || blocked || before !== 'seen';
          expect(layers.some((layer) => layer.layer === sprites[id] && !layer.visible), `token ${trial}/${id}`).toBe(!!hidden);
          if (!token.isHidden) {
            expect(composed?.(id) ?? 'seen').toBe(blocked ? 'unseen' : before);
            expect(presentation.hides(id, composed)).toBe(blocked || (before !== 'seen' && !held[id]));
            if (!blocked && held[id] && before !== 'seen') exercised.heldOutside++;
          }
        }
        const view: Parameters<typeof playerDoorSight>[0] = {
          isEnabled: () => enabled, currentSight: () => sight, ambientLight: () => ambient, lightReaches: () => [],
        };
        const previousDoors = playerDoorSight(view, walls);
        const expectedDoors = [...previousDoors].filter((id) => {
          const wall = walls[id]!;
          return !rectangleCoverage(operations, { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 });
        });
        exercised.doorRemoved += previousDoors.size - expectedDoors.length;
        expect([...playerDoorSight(view, walls, coverage)], `doors ${trial}`).toEqual(expectedDoors);
      } finally {
        presentation.destroy();
        Object.values(sprites).forEach((group) => group.destroy());
      }
    }
    for (const count of Object.values(exercised)) expect(count).toBeGreaterThan(0);
  });

  it('reuses centre checks until the displayed point or committed coverage changes', () => {
    const token: TokenEntity = { id: 't', kind: 'token', imagePath: '', x: 10, y: 10 };
    const group = sprite(token, token);
    let coverage = fogCoverage({ paint: fogRectangle() });
    const first = vi.spyOn(coverage, 'covers');
    const presentation = new PlayerSightTokens({ tokens: () => ({ t: token }), sprites: () => ({ t: group }), held: () => new Set() });
    presentation.setFogProvider(() => coverage, () => true);
    try {
      for (let frame = 0; frame < 3; frame++) {
        const perception = presentation.perception();
        expect(presentation.hides('t', perception)).toBe(true);
        expect(perception?.('t')).toBe('unseen');
        presentation.syncOutlines(perception);
      }
      expect(first).toHaveBeenCalledTimes(1);
      group.x = 30;
      expect(presentation.hides('t')).toBe(false);
      expect(presentation.framePerception()?.('t')).toBe('seen');
      expect(first).toHaveBeenCalledTimes(2);
      coverage = fogCoverage({ paint: fogRectangle({ x: 25 }) });
      const next = vi.spyOn(coverage, 'covers');
      expect(presentation.hides('t')).toBe(true);
      expect(presentation.framePerception()?.('t')).toBe('unseen');
      expect(next).toHaveBeenCalledTimes(1);
      group.y = 30;
      expect(presentation.hides('t')).toBe(false);
      expect(presentation.framePerception()?.('t')).toBe('seen');
      expect(next).toHaveBeenCalledTimes(2);
    } finally {
      presentation.destroy();
      group.destroy();
      vi.restoreAllMocks();
    }
  });

  it('preserves the lighting predicate identity with empty fog and fails closed for invalid fog, even while held', () => {
    const token: TokenEntity = { id: 'held', kind: 'token', imagePath: 'token.png', x: 30, y: 30, vision: { enabled: true } };
    const group = sprite(token, token);
    const tokens = { held: token };
    const presentation = new PlayerSightTokens({ tokens: () => tokens, sprites: () => ({ held: group }), held: () => new Set(['held']) });
    let coverage: FogCoverage | null = fogCoverage({});
    presentation.setFogProvider(() => coverage, () => true);
    const legacy = tokenPerception(sight, { ambient: 1 }, [], tokens);
    try {
      expect(presentation.framePerception(legacy)).toBe(legacy);
      expect(presentation.framePerception()).toBeUndefined();
      coverage = null;
      const closed = presentation.framePerception(legacy);
      expect(closed?.('held')).toBe('unseen');
      expect(presentation.hides('held', closed)).toBe(true);
      expect(presentation.frameLayers(closed)).toContainEqual({ layer: group, visible: false });
    } finally {
      presentation.destroy();
      group.destroy();
    }
  });
});
