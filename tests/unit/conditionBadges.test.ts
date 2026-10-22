// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sprite } from 'pixi.js';
import { createConditionBadge } from '../../src/app/pixi/token-renderer/ConditionBadge';
import { ConditionBadgeRing, type ActiveCondition } from '../../src/app/pixi/token-renderer/ConditionBadgeRing';
import { resolveActiveConditions } from '../../src/app/utils/activeConditions';
import { getTokenRingCenterRadius } from '../../src/app/pixi/token-renderer/tokenRingMetrics';
import { computeTokenPixelSize, computeTokenStrokeWidth } from '../../src/app/pixi/token-renderer/tokenSizing';
import { conditionGlyph, isLightBadgeColor } from '../../src/app/utils/conditionGlyph';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import { stubJsdomGraphics } from '../mocks/jsdomGraphics';

let restoreGraphics: (() => void) | undefined;

afterEach(() => {
  restoreGraphics?.();
  restoreGraphics = undefined;
  vi.restoreAllMocks();
});

const definitions: ConditionDefinition[] = [
  { id: 'restrained', name: 'Restrained', color: '#c0392b' },
  { id: 'poisoned', name: 'Poisoned', color: '#27ae60', icon: 'poison' },
  { id: 'blessed', name: '  ', color: 'not-a-colour' },
];

function conditions(count: number): ActiveCondition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${index}`, name: `Condition ${index}`, color: 0x3366cc, glyph: { kind: 'icon', icon: 'star' },
  }));
}

/** Ring radius of a token `sizeInCells` wide on a 70px grid, as the token UI computes it. */
function ringRadius(sizeInCells: number): number {
  return getTokenRingCenterRadius(computeTokenPixelSize(70, sizeInCells), computeTokenStrokeWidth(70));
}

describe('condition glyphs', () => {
  it('uses the icon when it is part of the set and the initial otherwise', () => {
    expect(conditionGlyph({ name: 'Poisoned', icon: 'poison' })).toEqual({ kind: 'icon', icon: 'poison' });
    expect(conditionGlyph({ name: ' restrained' })).toEqual({ kind: 'text', text: 'R' });
    expect(conditionGlyph({ name: 'Old', icon: 'removed-icon' as 'poison' })).toEqual({ kind: 'text', text: 'O' });
    expect(conditionGlyph({ name: '' })).toEqual({ kind: 'text', text: '?' });
  });

  it('asks for a dark glyph only on light badge colours', () => {
    expect(isLightBadgeColor(0xffe066)).toBe(true);
    expect(isLightBadgeColor(0xffffff)).toBe(true);
    expect(isLightBadgeColor(0xc0392b)).toBe(false);
    expect(isLightBadgeColor(0x2c3e50)).toBe(false);
  });
});

describe('resolveActiveConditions', () => {
  it('keeps the token order and skips conditions the collection no longer defines', () => {
    const active = resolveActiveConditions({ conditions: ['poisoned', 'deleted', 'restrained', 'blessed'] }, definitions);
    expect(active.map((condition) => condition.id)).toEqual(['poisoned', 'restrained', 'blessed']);
    expect(active[0]).toMatchObject({ color: 0x27ae60, glyph: { kind: 'icon', icon: 'poison' } });
    expect(active[0]).not.toHaveProperty('value');
    expect(active[2]).toMatchObject({ name: 'Unnamed condition', color: 0x808080 });
  });

  it('gives valued conditions their number, 1 when none was set', () => {
    const frightened: ConditionDefinition = { id: 'frightened', name: 'Frightened', color: '#6d28d9', valued: true };
    const sickened: ConditionDefinition = { id: 'sickened', name: 'Sickened', color: '#65a30d', valued: true };
    const active = resolveActiveConditions(
      { conditions: ['frightened', 'sickened'], conditionValues: { frightened: 2 } },
      [frightened, sickened],
    );
    expect(active.map(({ name, value }) => ({ name, value }))).toEqual([
      { name: 'Frightened 2', value: 2 },
      { name: 'Sickened 1', value: 1 },
    ]);
  });
});

describe('ConditionBadgeRing', () => {
  it('fits three badges between the handles of a medium token', () => {
    restoreGraphics = stubJsdomGraphics();
    const ring = new ConditionBadgeRing();
    try {
      ring.update(conditions(3), ringRadius(1), 1, false);
      expect(ring.container.children).toHaveLength(3);
      for (const badge of ring.container.children) {
        const angle = Math.atan2(badge.position.y, badge.position.x);
        expect(angle).toBeLessThan(-Math.PI / 2);
        expect(angle).toBeGreaterThan(-Math.PI);
        expect(Math.hypot(badge.position.x, badge.position.y)).toBeCloseTo(ringRadius(1));
      }
    } finally {
      ring.destroy();
    }
  });

  it('counts the conditions that do not fit in the last slot', () => {
    restoreGraphics = stubJsdomGraphics();
    const ring = new ConditionBadgeRing();
    try {
      ring.update(conditions(5), ringRadius(1), 1, false);
      expect(ring.container.children).toHaveLength(3);
      ring.update(conditions(5), ringRadius(2), 1, false);
      expect(ring.container.children).toHaveLength(5);
    } finally {
      ring.destroy();
    }
  });

  it('keeps existing badges when a condition is added and hides the ring without conditions', () => {
    restoreGraphics = stubJsdomGraphics();
    const ring = new ConditionBadgeRing();
    try {
      ring.update(conditions(1), ringRadius(1), 1, false);
      const first = ring.container.children[0];
      ring.update(conditions(2), ringRadius(1), 1, false);
      expect(ring.container.children[0]).toBe(first);
      expect(first?.children.some((child) => child instanceof Sprite)).toBe(true);
      ring.update([], ringRadius(1), 1, false);
      expect(ring.container.visible).toBe(false);
      expect(ring.container.children).toHaveLength(0);
    } finally {
      ring.destroy();
    }
  });
});

describe('valued condition badges', () => {
  it('adds a number pip only to valued badges', () => {
    restoreGraphics = stubJsdomGraphics();
    const glyph = { kind: 'text', text: 'F' } as const;
    const plain = createConditionBadge({ color: 0x6d28d9, glyph });
    const valued = createConditionBadge({ color: 0x6d28d9, glyph, value: 2 });
    expect(valued.children.length).toBe(plain.children.length + 1);
  });
});
