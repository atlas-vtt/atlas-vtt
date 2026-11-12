// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Measurements } from '../../src/app/pixi/measure/measurements';
import { measureFrom, measureScene, type MeasureScene } from '../helpers/measureScene';

let current: MeasureScene | undefined;
afterEach(() => {
  current?.destroy();
  current = undefined;
  vi.useRealTimers();
});

function scene(): MeasureScene {
  current = measureScene();
  current.store.getState().setActiveTool('measure');
  return current;
}

describe('MeasureRenderer records', () => {
  it('starts with no measurements', () => {
    expect(scene().measure.measurements.get()).toEqual({ live: null, kept: [] });
  });

  it('records the live measurement at snapped cell centres as it is drawn, and drops it two seconds after release', () => {
    vi.useFakeTimers();
    const s = scene();
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live).toEqual({ shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 105, y: 105 }], pressed: { x: 100, y: 100 } });
    s.pointer('pointermove', 300, 180);
    s.pointer('pointerup', 300, 180);
    expect(s.measure.measurements.get().live).toEqual({ shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 315, y: 175 }], pressed: { x: 100, y: 100 } });
    vi.advanceTimersByTime(2000);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [] });
  });

  it('records the shape of the mode the tool is in, and drops what was measured in another', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'cone' });
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live?.shape).toBe('cone');
    s.store.getState().setMeasureTool({ mode: 'circle' });
    expect(s.measure.measurements.get().live).toBeNull();
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live?.shape).toBe('circle');
  });

  it.each(['square', 'line', 'ranges'] as const)('measures nothing in the %s mode, which is not built', (mode) => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode });
    measureFrom(s, 100, 100);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [] });
  });

  it('keeps released measurements as scene objects while Keep is on, in the order they were kept', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 100, 100);
    s.store.getState().setMeasureTool({ mode: 'circle' });
    measureFrom(s, 400, 400, 400, 600);
    const kept = Object.values(s.store.getState().objects.measures ?? {});
    expect(kept).toEqual([
      { id: expect.any(String), kind: 'measure', shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 315, y: 105 }] },
      { id: expect.any(String), kind: 'measure', shape: 'circle', points: [{ x: 385, y: 385 }, { x: 385, y: 595 }] },
    ]);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept });
    // Switching Keep off keeps what was kept: it is the scene's now.
    s.store.getState().setMeasureTool({ keep: false });
    expect(s.measure.measurements.get().kept).toHaveLength(2);
    s.store.getState().clearMeasures();
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [] });
  });

  it('never tells of a kept measurement only the GM sees', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true, players: false });
    measureFrom(s, 100, 100);
    const [id] = Object.keys(s.store.getState().objects.measures ?? {});
    expect(s.store.getState().objects.measures?.[id!]?.hidden).toBe(true);
    expect(s.measure.measurements.get().kept).toEqual([]);
    s.store.getState().updateMeasure(id!, { hidden: undefined });
    expect(s.measure.measurements.get().kept.map((measure) => measure.id)).toEqual([id]);
  });

  it('marks the live measurement as the GM\'s own while players are not to see what is measured', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ players: false });
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(s.measure.measurements.get().live?.hidden).toBe(true);
    expect(s.measure.getPlayerViewLayers(() => true).slice(0, 2).map((entry) => entry.visible)).toEqual([false, false]);
    s.store.getState().setMeasureTool({ players: true });
    expect(s.measure.measurements.get().live?.hidden).toBeUndefined();
    expect(s.measure.getPlayerViewLayers(() => true).slice(0, 2).map((entry) => entry.visible)).toEqual([true, true]);
  });

  it('tells subscribers each change with the measurements before it, and nothing after they unsubscribe', () => {
    const s = scene();
    const changes: [Measurements, Measurements][] = [];
    const stop = s.measure.measurements.subscribe((next, previous) => changes.push([next, previous]));
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(changes).toHaveLength(2);
    expect(changes[1]![1]).toBe(changes[0]![0]);
    expect(changes[1]![0]).toBe(s.measure.measurements.get());
    // The same measurement keeps the object that says where it was begun.
    expect(changes[1]![0].live?.pressed).toBe(changes[0]![0].live?.pressed);
    stop();
    s.pointer('pointermove', 400, 100);
    expect(changes).toHaveLength(2);
  });

  it('tells nothing for store changes that leave the measurements as they are', () => {
    const s = scene();
    const listener = vi.fn();
    s.measure.measurements.subscribe(listener);
    s.store.getState().setActiveTool('select');
    s.store.getState().setActiveTool('move');
    s.store.getState().setMeasureTool({ keep: true, color: '#ff0000' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('clears the live measurement when the tool is put away', () => {
    const s = scene();
    s.pointer('pointerdown', 100, 100);
    s.store.getState().setActiveTool('select');
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('records every measurement, also one the players\' picture leaves out', () => {
    const s = scene();
    s.measure.playersView = {
      footprints: () => [{ id: 'goblin', x: 100, y: 100, radius: 30 }],
      seenAtStart: () => () => false,
      seenOnCanvas: () => null,
    };
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(s.measure.getPlayerViewLayers(() => false).slice(0, 2).map((entry) => entry.visible)).toEqual([false, false]);
    expect(s.measure.measurements.get().live).toMatchObject({ shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 315, y: 105 }] });
  });
});
