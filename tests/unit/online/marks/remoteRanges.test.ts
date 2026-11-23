// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Text } from 'pixi.js';
import { resolveMeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import type { RangeMarksState } from '../../../../src/app/online/protocol/index.ts';
import { preferReducedMotion } from '../../../helpers/reducedMotion';

const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const RULES: MeasureRules = { grid: GRID, measurement: resolveMeasurementSettings(undefined, null) };
const HERO = { x: 105, y: 105, size: 1 };
const RINGS: RangeMarksState['rings'] = { at: HERO, rings: [{ reach: 3.5, label: 'Close' }, { reach: 6.000001, label: 'Move · 30ft', color: '#22c55e' }] };
const CHECK: RangeMarksState['check'] = { from: HERO, to: { x: 385, y: 105, size: 1 }, text: '20ft' };
const gm = (ranges?: RangeMarksState): RemoteMeasure => ({ who: 'gm', color: '#66ffa9', live: null, kept: [], ...(ranges && { ranges }) });

function textsIn(container: Container): string[] {
  return container.children.flatMap((child) => {
    if (!child.visible) return [];
    const text = child.children.find((part): part is Text => part instanceof Text);
    return text ? [text.text] : textsIn(child);
  });
}

function labelsIn(container: Container): { x: number; y: number; text: string }[] {
  return container.children.flatMap((child) => {
    const text = child.children.find((part): part is Text => part instanceof Text);
    return text ? [{ x: child.position.x, y: child.position.y, text: text.text }] : labelsIn(child);
  });
}

describe('the GM\'s range marks on a player\'s page', () => {
  let measures: RemoteMeasures;
  let rules: MeasureRules | null;

  beforeEach(() => {
    preferReducedMotion();
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    rules = RULES;
    measures = new RemoteMeasures({ zoom: () => 1, rules: () => rules, interval: 100 });
  });

  afterEach(() => {
    measures.destroy();
    vi.restoreAllMocks();
  });

  it('draws the rings with their names and the check with the distance it was told, without any measurement', () => {
    measures.update([gm({ rings: RINGS, check: CHECK })], 0);
    expect(textsIn(measures.container).sort()).toEqual(['20ft', 'Close', 'Move · 30ft']);
    measures.update([gm({ check: CHECK })], 100);
    expect(textsIn(measures.container)).toEqual(['20ft']);
    measures.update([gm()], 200);
    expect(textsIn(measures.container)).toEqual([]);
  });

  it('takes them away with their sender, and draws nothing while the rules are not known', () => {
    measures.update([gm({ rings: RINGS })], 0);
    measures.update([], 100);
    expect(textsIn(measures.container)).toEqual([]);
    rules = null;
    measures.update([gm({ rings: RINGS })], 200);
    expect(textsIn(measures.container)).toEqual([]);
    rules = RULES;
    measures.update([gm({ rings: RINGS })], 300);
    expect(textsIn(measures.container).sort()).toEqual(['Close', 'Move · 30ft']);
    measures.rescale();
    expect(textsIn(measures.container).sort()).toEqual(['Close', 'Move · 30ft']);
  });

  it('shapes the rings anew by other rules, told the same', () => {
    // How far the ring's name stands from its place, on the ring.
    const reach = (): number => {
      const label = labelsIn(measures.container).find((entry) => entry.text === 'Close')!;
      return Math.hypot(label.x - HERO.x, label.y - HERO.y);
    };
    measures.update([gm({ rings: { at: HERO, rings: [{ reach: 3.5, label: 'Close' }] } })], 0);
    const small = reach();
    rules = { ...RULES, grid: { ...GRID, size: 140 } };
    measures.update([gm({ rings: { at: HERO, rings: [{ reach: 3.5, label: 'Close' }] } })], 100);
    expect(reach()).toBeGreaterThan(small * 1.5);
  });
});
