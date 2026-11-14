// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Bounds, Container, Graphics, Text } from 'pixi.js';
import { RemoteMeasures, type MeasureRules, type RemoteMeasure } from '../../../../src/app/online/marks/RemoteMeasures.ts';
import { formatDistance, resolveMeasurementSettings, type MeasurementSettings } from '../../../../src/app/grid/measurementFormat';
import { areaMapOf } from '../../../../src/app/measure/areaOnMap';
import type { FullMeasure, SharedMeasure } from '../../../../src/app/online/protocol/index.ts';
import type { WallSegment } from '../../../../src/app/types/wallTypes';

const INTERVAL = 33;
const FRAME = 25 / 3;
const ANA = 'a'.repeat(20);
const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0 } as const;
const RULES: MeasureRules = { grid: GRID, measurement: resolveMeasurementSettings(undefined, null) };
const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, rangeBands: [], coneAngle: 90, diagonalRule: 'equidistant' };
const line = (bx: number, ax = 0): SharedMeasure => ({ shape: 'line', a: [ax, 0], b: [bx, 0] });
const measure = (live: SharedMeasure | null, kept: readonly SharedMeasure[] = []): RemoteMeasure => ({ who: ANA, color: '#66ffa9', live, kept });
/** A sender that tells its measurements in full, and nothing in the older words. */
const full = (live: FullMeasure | null, kept: readonly FullMeasure[] = [], span?: number): RemoteMeasure => ({ who: ANA, color: '#66ffa9', live: null, kept: [], full: { live, kept }, ...(span !== undefined && { span }) });
/** A wall from top to bottom of the map at `x`. */
const wallAt = (x: number): WallSegment => ({ id: `w${x}`, kind: 'wall', type: 'solid', p1: { x, y: -5000 }, p2: { x, y: 5000 } });

function textsIn(container: Container): { x: number; y: number; text: string }[] {
  return container.children.flatMap((child) => {
    const text = child.children.find((part): part is Text => part instanceof Text);
    return text ? [{ x: child.position.x, y: child.position.y, text: text.text }] : textsIn(child);
  });
}

describe('RemoteMeasures', () => {
  let measures: RemoteMeasures;
  let rules: MeasureRules | null;
  /** The map's own layer that the bodies of areas are laid into. */
  let map: Container;
  /** The labels drawn: where each stands and what it says. */
  const labels = (): { x: number; y: number; text: string }[] => textsIn(measures.container);
  const bodies = (): Container | undefined => map.children[0];
  /** How far the bodies drawn reach, in world pixels. */
  const reach = (): { left: number; right: number } => {
    const bounds = bodies()?.getLocalBounds();
    return { left: Math.round(bounds?.minX ?? 0), right: Math.round(bounds?.maxX ?? 0) };
  };
  /** Draws a frame every `FRAME` ms from `from` to `to`; returns where the last label stood in each. */
  const run = (from: number, to: number): { x: number; text: string }[] => {
    const seen: { x: number; text: string }[] = [];
    for (let now = from; now <= to; now += FRAME) {
      measures.tick(now);
      const last = labels().at(-1);
      if (last !== undefined) seen.push(last);
    }
    return seen;
  };
  const make = (gmOutlines = false): void => {
    measures = new RemoteMeasures({ zoom: () => 1, rules: () => rules, interval: INTERVAL, gmOutlines });
    measures.layBodies((layer) => map.addChild(layer));
  };

  beforeEach(() => {
    // jsdom cannot measure text; a label's size plays no part in where it stands.
    vi.spyOn(Text.prototype, 'getLocalBounds').mockReturnValue(new Bounds(0, 0, 40, 18));
    rules = RULES;
    map = new Container();
    make();
  });

  afterEach(() => {
    measures.destroy();
    vi.restoreAllMocks();
  });

  it('moves the end being dragged between two messages, and its label with it', () => {
    measures.update([measure(line(0))], 0);
    expect(labels()).toHaveLength(1);
    run(0, 33);
    measures.update([measure(line(700))], 33);
    const seen = run(33, 200);
    const places = seen.map((label) => label.x);
    expect(places.every((x, index) => index === 0 || x >= (places[index - 1] ?? 0))).toBe(true);
    expect(new Set(places.filter((x) => x > 0 && x < 350)).size).toBeGreaterThan(2);
    expect(places.at(-1)).toBe(350);
    // The distance is the drawn end's, not the last message's.
    expect(new Set(seen.map((label) => label.text)).size).toBeGreaterThan(2);
    expect(seen.at(-1)?.text).toBe(formatDistance(10, RULES.measurement));
    expect(measures.busy).toBe(false);
  });

  it('moves an end on every frame, however its messages arrive, when they tell their time', () => {
    // An end dragged a pixel a millisecond, told 30 times a second; two messages arrive together after a late one, one comes early.
    const delays = [20, 20, 62, 20, 20, 4, 20, 20, 45, 20, 20, 20];
    let covered = 0;
    let arrived = 0;
    const messages = Array.from({ length: 120 }, (_, index) => {
      const sent = ((index + 1) * 100) / 3;
      const span = Math.round(sent) - covered;
      covered += span;
      arrived = Math.max(arrived, sent + (delays[index % delays.length] ?? 20));
      return { end: sent, span, arrived };
    });
    measures.update([measure(line(0))], 0);
    const places: number[] = [];
    let next = 0;
    let newest = 0;
    for (let now = 0; now < 4000; now += FRAME) {
      for (; next < messages.length && (messages[next]?.arrived ?? Infinity) <= now; next += 1) {
        const message = messages[next];
        if (message === undefined) break;
        measures.update([{ ...measure(line(message.end)), span: message.span }], message.arrived);
        newest = message.end;
      }
      measures.tick(now);
      const place = (labels().at(-1)?.x ?? 0) * 2;
      expect(place).toBeLessThanOrEqual(newest + 1e-6);
      if (now > 1500) places.push(place);
    }
    const steps = places.slice(1).map((place, index) => place - (places[index] ?? 0));
    expect(Math.min(...steps)).toBeGreaterThan(0.5 * FRAME);
    expect(Math.max(...steps)).toBeLessThan(1.5 * FRAME);
  });

  it('says it is busy while an end still moves', () => {
    measures.update([measure(line(0))], 0);
    run(0, 66);
    expect(measures.busy).toBe(false);
    measures.update([measure(line(700))], 66);
    expect(measures.busy).toBe(true);
    measures.tick(75);
    expect(measures.busy).toBe(true);
  });

  it('starts a new measurement where it begins, without gliding from the last one', () => {
    measures.update([measure(line(700))], 0);
    run(0, 100);
    measures.update([measure(line(1400, 1400))], 100);
    const places = new Set(run(100, 200).map((label) => label.x));
    expect(places).toEqual(new Set([1400]));
  });

  it('shows kept measurements at once, and a kept one in place of the one it was drawn as', () => {
    measures.update([measure(null, [line(140)])], 0);
    expect(labels()).toEqual([{ x: 70, y: expect.any(Number) as number, text: formatDistance(2, RULES.measurement) }]);
    measures.update([measure(line(0, 0), [line(140)])], 10);
    run(10, 60);
    measures.update([measure(line(700, 0), [line(140)])], 60);
    measures.update([measure(null, [line(140), line(700)])], 70);
    expect(labels().map((label) => label.x)).toEqual([70, 350]);
    expect(measures.busy).toBe(false);
  });

  it('draws nothing anew for a sender whose measurements did not change', () => {
    measures.update([measure(line(700), [line(140)])], 0);
    run(0, 100);
    const cleared = vi.spyOn(Graphics.prototype, 'clear');
    measures.update([measure(line(700), [line(140)])], 100);
    measures.update([full({ shape: 'ruler', pts: [0, 0, 700, 0] }, [{ shape: 'ruler', pts: [0, 0, 140, 0] }])], 105);
    expect(cleared).not.toHaveBeenCalled();
    measures.update([measure(line(700), [line(140), line(280)])], 110);
    expect(cleared).toHaveBeenCalled();
    expect(labels().map((label) => label.x).sort((a, b) => a - b)).toEqual([70, 140, 350]);
  });

  it('forgets a sender who has no measurements left or is not named', () => {
    measures.update([measure(line(700))], 0);
    measures.update([measure(null)], 10);
    const empty = (): boolean => labels().length === 0 && measures.container.getLocalBounds().width === 0;
    expect(empty()).toBe(true);
    measures.update([measure(line(700))], 20);
    measures.update([], 30);
    expect(empty()).toBe(true);
    measures.update([full({ shape: 'circle', pts: [0, 0, 140, 0] })], 40);
    expect(bodies()?.getLocalBounds().width).toBeGreaterThan(0);
    measures.update([full(null)], 50);
    expect(empty()).toBe(true);
    expect(bodies()?.getLocalBounds().width).toBe(0);
  });

  describe('measurements told in full', () => {
    beforeEach(() => {
      rules = { grid: GRID, measurement: FEET };
    });

    it('are drawn in place of what the older words say', () => {
      measures.update([{ ...measure(line(700), [line(140)]), full: { live: null, kept: [{ shape: 'ruler', pts: [0, 0, 280, 0] }] } }], 0);
      expect(labels().map(({ x, text }) => ({ x, text }))).toEqual([{ x: 140, text: '20ft' }]);
    });

    it('draw a ruler with its corners: the whole length beyond its end, and each leg\'s beside the leg', () => {
      measures.update([full(null, [{ shape: 'ruler', pts: [0, 0, 140, 0, 140, 210] }])], 0);
      expect(labels().map((label) => label.text)).toEqual(['25ft', '10ft', '15ft']);
      const [total, first, second] = labels();
      expect(total?.y).toBeGreaterThan(210);
      expect(first?.x).toBe(70);
      expect(second?.y).toBe(105);
    });

    it('move only the end of a ruler being drawn: its corners stand as told', () => {
      measures.update([full({ shape: 'ruler', pts: [0, 0, 140, 0, 140, 0] })], 0);
      run(0, 33);
      measures.update([full({ shape: 'ruler', pts: [0, 0, 140, 0, 140, 700] }, [], 33)], 33);
      const totals: (string | undefined)[] = [];
      for (let now = 33; now <= 300; now += FRAME) {
        measures.tick(now);
        totals.push(labels()[0]?.text);
      }
      expect(new Set(totals).size).toBeGreaterThan(3);
      expect(totals.at(-1)).toBe('60ft');
      // The first leg kept its length all the way.
      expect(labels().map((label) => label.text)).toEqual(['60ft', '10ft', '50ft']);
      // A corner put down where the end stands starts no new measurement: the end goes on from there.
      measures.update([full({ shape: 'ruler', pts: [0, 0, 140, 0, 140, 700, 140, 700] }, [], 33)], 300);
      measures.update([full({ shape: 'ruler', pts: [0, 0, 140, 0, 140, 700, 840, 700] }, [], 33)], 333);
      expect(measures.busy).toBe(true);
      run(333, 600);
      expect(labels()[0]?.text).toBe('110ft');
    });

    it('name a square and a line by length and width, a line that tells no width as one cell wide', () => {
      measures.update([full(null, [{ shape: 'square', pts: [0, 0, 140, 0] }, { shape: 'line', pts: [0, 0, 280, 0], width: 140 }, { shape: 'line', pts: [0, 0, 280, 0] }])], 0);
      expect(labels().map((label) => label.text)).toEqual(['10 × 10ft', '20 × 10ft', '20 × 5ft']);
    });

    it('draw an area by its body, in the layer laid into the map, and nothing of it above the lighting but its size', () => {
      measures.update([full({ shape: 'circle', pts: [350, 350, 490, 350] }, [{ shape: 'line', pts: [0, 0, 280, 0], width: 70 }])], 0);
      expect(reach()).toEqual({ left: 0, right: 490 });
      // No ink of an area stands in the top layer: neither its outline nor the dot where it starts.
      expect(measures.container.getChildByLabel('remote-measure-shapes')?.getLocalBounds().width).toBe(0);
      expect(measures.container.children.map((child) => child.label)).toEqual(['remote-measure-shapes', 'remote-measure-labels']);
      expect(labels().map((label) => label.text).sort()).toEqual(['10ft', '20 × 5ft']);
    });

    it('stop an area at the walls the rules name, unless its sender said that walls do not stop it; without walls it is whole', () => {
      const circle: FullMeasure = { shape: 'circle', pts: [350, 350, 630, 350] };
      measures.update([full(null, [circle])], 0);
      expect(reach()).toEqual({ left: 70, right: 630 });
      rules = { grid: GRID, measurement: FEET, areas: areaMapOf(GRID, FEET, true, [wallAt(490)]) };
      measures.rescale();
      expect(reach()).toEqual({ left: 70, right: 490 });
      measures.update([full(null, [{ ...circle, free: true }])], 10);
      expect(reach()).toEqual({ left: 70, right: 630 });
      // One being drawn stops at them too, wherever its end is drawn.
      measures.update([full(circle)], 20);
      expect(reach()).toEqual({ left: 70, right: 490 });
    });

    it('draw a circle or a cone told in the older words whole, as its sender drew it', () => {
      rules = { grid: GRID, measurement: FEET, areas: areaMapOf(GRID, FEET, true, [wallAt(490)]) };
      measures.update([measure(null, [{ shape: 'circle', a: [350, 350], b: [630, 350] }])], 0);
      expect(reach()).toEqual({ left: 70, right: 630 });
    });

    it('draw the outline of an area above the lighting for a GM alone', () => {
      measures.destroy();
      make(true);
      measures.update([full(null, [{ shape: 'circle', pts: [350, 350, 490, 350] }])], 0);
      expect(measures.container.children.map((child) => child.label)).toEqual(['remote-measure-shapes', 'remote-measure-outlines', 'remote-measure-labels']);
      expect(measures.container.getChildByLabel('remote-measure-outlines')?.getLocalBounds().width).toBeGreaterThan(270);
      expect(reach()).toEqual({ left: 210, right: 490 });
    });

    it('lets go of what it drew when the map its bodies lay in is destroyed, and draws again once laid into another', () => {
      const circle: FullMeasure = { shape: 'circle', pts: [350, 350, 490, 350] };
      measures.update([full(circle, [circle])], 0);
      map.destroy({ children: true });
      expect(() => {
        measures.tick(10);
        measures.rescale();
        measures.update([full({ shape: 'circle', pts: [350, 350, 630, 350] }, [circle])], 20);
      }).not.toThrow();
      expect(labels()).toHaveLength(2);
      map = new Container();
      measures.layBodies((layer) => map.addChild(layer));
      expect(labels()).toHaveLength(0);
      measures.update([full(null, [circle])], 30);
      expect(reach()).toEqual({ left: 210, right: 490 });
      // Taken out of the map, its layer leaves it.
      measures.layBodies(null);
      expect(map.children).toHaveLength(0);
    });

    it('writes every distance again when the rules change', () => {
      measures.update([full(null, [{ shape: 'ruler', pts: [0, 0, 280, 0] }, { shape: 'square', pts: [0, 0, 140, 0] }])], 0);
      rules = { grid: GRID, measurement: { ...FEET, unitType: 'custom', unitName: 'ly', unitDistance: 1 } };
      measures.rescale();
      expect(labels().map((label) => label.text)).toEqual(['4 ly', '2 × 2 ly']);
    });
  });
});
