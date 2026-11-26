// @vitest-environment jsdom
import type { Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEASURE_FADE_MS } from '../../../src/app/pixi/measure/MeasureRenderer';
import { LIVE_DISSOLVE_MS, MEASURE_MOTION } from '../../../src/app/pixi/measure/measurePresence';
import { ShownPlaces } from '../../../src/app/lighting/shownPlaces';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { TokenEntity } from '../../../src/app/types';
import { finishMeasureExits, GRID, measureFrom, measureScene, type MeasureScene } from '../../helpers/measureScene';

let current: MeasureScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
  vi.useRealTimers();
});

function scene(): MeasureScene {
  vi.useFakeTimers();
  current = measureScene();
  current.store.getState().setActiveTool('measure');
  return current;
}

/** The labels of the first kept measurement, which fade with all of it. */
const keptLabels = (s: MeasureScene): Container => s.parts()[3] as Container;
const liveLabels = (s: MeasureScene): Container => s.parts()[1] as Container;

describe('how measurements come and go', () => {
  it('keeps a measurement in the place of the live one, at full strength and size: keeping it never flickers', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    vi.advanceTimersByTime(MEASURE_MOTION.live.ms + 50);
    s.pointer('pointerup', 175, 35);
    expect(s.parts()).toHaveLength(4);
    expect(keptLabels(s).alpha).toBe(1);
    expect(keptLabels(s).scale.x).toBe(1);
  });

  it('keeps a measurement released before its first drawing had faded in from where that had got to', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    vi.advanceTimersByTime(MEASURE_MOTION.live.ms / 3);
    const live = liveLabels(s).alpha;
    s.pointer('pointerup', 175, 35);
    expect(keptLabels(s).alpha).toBe(live);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms + 50);
    expect(keptLabels(s).alpha).toBe(1);
  });

  it('grows a measurement that comes back by undo out of where it starts, and fades one that goes before it leaves', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 35, 175, 35);
    const history = getHistoryStore(s.store)!;
    history.getState().undo();
    vi.advanceTimersByTime(MEASURE_MOTION.exit.ms / 2);
    // On its way out: still drawn, fainter and a little smaller.
    expect(s.parts()).toHaveLength(4);
    expect(keptLabels(s).alpha).toBeLessThan(1);
    expect(keptLabels(s).scale.x).toBeLessThan(1);
    finishMeasureExits();
    expect(s.parts()).toHaveLength(2);
    history.getState().redo();
    expect(keptLabels(s).alpha).toBe(0);
    expect(keptLabels(s).scale.x).toBe(MEASURE_MOTION.enter.from.grow);
    // It grows about its start, which stays where it is.
    expect(keptLabels(s).toGlobal({ x: 35, y: 35 })).toEqual({ x: 35, y: 35 });
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms + 50);
    expect(keptLabels(s).alpha).toBe(1);
    expect(keptLabels(s).scale.x).toBe(1);
  });

  it('turns a measurement deleted while it grows in, from where it had got to', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 35, 175, 35);
    const history = getHistoryStore(s.store)!;
    history.getState().undo();
    finishMeasureExits();
    history.getState().redo();
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms / 3);
    const halfway = keptLabels(s).alpha;
    expect(halfway).toBeGreaterThan(0);
    history.getState().undo();
    vi.advanceTimersByTime(20);
    expect(keptLabels(s).alpha).toBeLessThan(halfway);
    finishMeasureExits();
    expect(s.parts()).toHaveLength(2);
  });

  it('dissolves a released measurement nobody keeps over the end of its time, and its pin still keeps it there', () => {
    const s = scene();
    measureFrom(s, 35, 35, 175, 35);
    vi.advanceTimersByTime(MEASURE_MOTION.live.ms + 50);
    expect(liveLabels(s).alpha).toBe(1);
    vi.advanceTimersByTime(MEASURE_FADE_MS - LIVE_DISSOLVE_MS / 2 - MEASURE_MOTION.live.ms - 50);
    const fading = liveLabels(s).alpha;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    expect(s.measure.measurements.get().live).not.toBeNull();
    vi.advanceTimersByTime(LIVE_DISSOLVE_MS);
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('shows a load\'s measurements and takes them away at once', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 35, 175, 35);
    s.store.setState({ isMapLoading: true });
    s.store.getState().clearMeasures();
    expect(s.parts()).toHaveLength(2);
  });

  it('carries a measurement an undo moves back along its way there, and the redo forth again', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 35, 175, 35);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms + 50);
    const [kept] = Object.values(s.store.getState().objects.measures ?? {});
    /** Where the distance of the kept ruler stands. */
    const distance = (): number => keptLabels(s).children[0]!.position.x;
    const start = distance();
    s.store.getState().updateMeasure(kept!.id, { points: kept!.points.map(({ x, y }) => ({ x: x + 2 * GRID, y })) });
    // Its own edit is drawn where it is at once.
    const moved = distance();
    expect(moved).toBeCloseTo(start + 2 * GRID);
    const history = getHistoryStore(s.store)!;
    history.getState().undo();
    expect(distance()).toBe(moved);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms / 3);
    const between = distance();
    expect(between).toBeLessThan(moved);
    expect(between).toBeGreaterThan(start);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms);
    expect(distance()).toBeCloseTo(start);
    history.getState().redo();
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms / 3);
    expect(distance()).toBeGreaterThan(start);
    expect(distance()).toBeLessThan(moved);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms);
    expect(distance()).toBeCloseTo(moved);
  });

  it('draws an aura where its token is drawn on its way to its place, and where the store has it once it is there', () => {
    const s = scene();
    const hero = { id: 'hero', kind: 'character', name: 'hero', imagePath: '', x: 4 * GRID + GRID / 2, y: 4 * GRID + GRID / 2 } as TokenEntity;
    s.store.setState({ objects: { ...s.store.getState().objects, tokens: { hero } } });
    s.store.getState().setTokenAuras([{ tokenId: 'hero', aura: 10, points: [{ x: hero.x, y: hero.y }, { x: hero.x + 3 * GRID, y: hero.y }] }]);
    vi.advanceTimersByTime(MEASURE_MOTION.enter.ms + 50);
    const places = new ShownPlaces();
    s.measure.followShown(places);
    const shift = (): number => keptLabels(s).position.x - keptLabels(s).pivot.x;
    expect(shift()).toBe(0);
    // The token glides to where the store has it: it is drawn a cell short of there.
    places.set('hero', hero.x - GRID, hero.y);
    places.flush();
    expect(shift()).toBe(-GRID);
    places.delete('hero');
    places.flush();
    expect(shift()).toBe(0);
  });

  it('lifts the pin under the pointer with a pointer cursor, and lets it settle once the pointer leaves', () => {
    const s = scene();
    measureFrom(s, 35, 35, 175, 35);
    vi.advanceTimersByTime(400);
    const pin = (liveLabels(s).children.find((child) => child.label === 'measure-pin') as Container);
    const rest = pin.scale.x;
    expect(s.measure.pointer.cursorAt(pin.position.x, pin.position.y)).toBe('pointer');
    vi.advanceTimersByTime(300);
    expect(pin.scale.x).toBeGreaterThan(rest);
    s.measure.pointer.leave();
    vi.advanceTimersByTime(300);
    expect(pin.scale.x).toBeCloseTo(rest);
    // Away from it, it is no pin's to answer.
    expect(s.measure.pointer.cursorAt(700, 700)).toBeNull();
  });

  it('glows once along a measurement kept by its pin, and not along one kept by Keep', () => {
    const s = scene();
    measureFrom(s, 35, 35, 175, 35);
    vi.advanceTimersByTime(400);
    const pin = (liveLabels(s).children.find((child) => child.label === 'measure-pin') as Container);
    s.click(pin.position.x, pin.position.y);
    const glow = (): Container | undefined => keptLabels(s).children.find((child) => child.label === 'measure-glow') as Container | undefined;
    vi.advanceTimersByTime(150);
    expect(glow()?.visible).toBe(true);
    expect(glow()!.alpha).toBeGreaterThan(0.3);
    vi.advanceTimersByTime(1200);
    expect(glow()?.visible).toBe(false);
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 175, 175, 175);
    const second = s.parts()[5] as Container;
    expect(second.children.some((child) => child.label === 'measure-glow')).toBe(false);
  });
});
