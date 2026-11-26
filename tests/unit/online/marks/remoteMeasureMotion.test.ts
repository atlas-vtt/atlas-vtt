// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Text } from 'pixi.js';
import { resolveMeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import type { FullMeasure } from '../../../../src/app/online/protocol/index.ts';
import { MEASURE_MOTION } from '../../../../src/app/pixi/measure/measurePresence';

const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const RULES: MeasureRules = { grid: GRID, measurement: resolveMeasurementSettings(undefined, null) };
const told = (live: FullMeasure | null, kept: readonly FullMeasure[] = []): RemoteMeasure => ({ who: 'ana', color: '#66ffa9', live: null, kept: [], full: { live, kept } });
const circle = (x: number): FullMeasure => ({ shape: 'circle', pts: [x, 350, x + 140, 350] });

describe('how other people\'s measurements come and go', () => {
  let measures: RemoteMeasures;
  /** The labels of each drawing on the map, fading ones too, in the order they were made: each fades and grows with its drawing. */
  const drawings = (): Container[] => (measures.container.children.at(-1) as Container).children as Container[];
  const settle = (): void => { vi.advanceTimersByTime(MEASURE_MOTION.enter.ms + 50); };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    measures = new RemoteMeasures({ zoom: () => 1, rules: () => RULES, interval: 33 });
    measures.layBodies((layer) => new Container().addChild(layer));
  });

  afterEach(() => {
    measures.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('grows a kept measurement in from where it starts', () => {
    measures.update([told(null, [circle(350)])], 0);
    const [drawing] = drawings();
    expect(drawing!.alpha).toBe(0);
    expect(drawing!.scale.x).toBe(MEASURE_MOTION.enter.from.grow);
    settle();
    expect(drawing!.alpha).toBe(1);
    expect(drawing!.scale.x).toBe(1);
  });

  it('fades out the one deleted and leaves the others as they stand', () => {
    measures.update([told(null, [circle(70), circle(490)])], 0);
    settle();
    const [first, second] = drawings();
    measures.update([told(null, [circle(490)])], 10);
    vi.advanceTimersByTime(MEASURE_MOTION.exit.ms / 2);
    expect(first!.alpha).toBeLessThan(1);
    expect(second!.alpha).toBe(1);
    vi.advanceTimersByTime(MEASURE_MOTION.exit.ms);
    expect(drawings()).toEqual([second]);
  });

  it('fades in a measurement being drawn and fades it out when it ends', () => {
    measures.update([told(circle(350))], 0);
    const [drawing] = drawings();
    expect(drawing!.alpha).toBe(0);
    settle();
    expect(drawing!.alpha).toBe(1);
    measures.update([told(null)], 10);
    vi.advanceTimersByTime(MEASURE_MOTION.exit.ms / 2);
    expect(drawing!.alpha).toBeLessThan(1);
    vi.advanceTimersByTime(MEASURE_MOTION.exit.ms);
    expect(drawings()).toEqual([]);
  });

  it('puts a measurement kept from the one being drawn in its place as it stands, without a fade', () => {
    measures.update([told(circle(350))], 0);
    settle();
    const [live] = drawings();
    measures.update([told(null, [circle(350)])], 10);
    const [kept] = drawings();
    expect(kept).not.toBe(live);
    expect(drawings()).toHaveLength(1);
    expect(kept!.alpha).toBe(1);
  });

  it('carries a kept measurement its sender moved along its way there', () => {
    measures.update([told(null, [circle(70)])], 0);
    settle();
    const label = (): number => drawings()[0]!.children[0]!.position.x;
    const from = label();
    measures.update([told(null, [circle(350)])], 10);
    expect(label()).toBe(from);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms / 3);
    expect(label()).toBeGreaterThan(from);
    expect(label()).toBeLessThan(from + 280);
    settle();
    expect(label()).toBeCloseTo(from + 280);
  });
});
