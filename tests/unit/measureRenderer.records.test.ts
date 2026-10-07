import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Measurements } from '../../src/app/pixi/MeasureRenderer';
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
    expect(s.measure.measurements.get().live).toEqual({ shape: 'line', start: { x: 105, y: 105 }, end: { x: 105, y: 105 } });
    s.pointer('pointermove', 300, 180);
    s.pointer('pointerup', 300, 180);
    expect(s.measure.measurements.get().live).toEqual({ shape: 'line', start: { x: 105, y: 105 }, end: { x: 315, y: 175 } });
    vi.advanceTimersByTime(2000);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [] });
  });

  it('records the shape the tool measures with', () => {
    const s = scene();
    s.bus.emit('measure-shape-changed', 'cone');
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live?.shape).toBe('cone');
    s.store.getState().setActiveTool('measure-circle');
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live?.shape).toBe('circle');
  });

  it('keeps released measurements in order while persistence is on, and forgets them when it goes off', () => {
    const s = scene();
    s.bus.emit('measure-persistence-changed', true);
    measureFrom(s, 100, 100);
    s.bus.emit('measure-shape-changed', 'circle');
    measureFrom(s, 400, 400, 400, 600);
    expect(s.measure.measurements.get()).toEqual({
      live: null,
      kept: [
        { shape: 'line', start: { x: 105, y: 105 }, end: { x: 315, y: 105 } },
        { shape: 'circle', start: { x: 385, y: 385 }, end: { x: 385, y: 595 } },
      ],
    });
    s.bus.emit('measure-persistence-changed', false);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [] });
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
    stop();
    s.pointer('pointermove', 400, 100);
    expect(changes).toHaveLength(2);
  });

  it('tells nothing for store changes that leave the measurements as they are', () => {
    const s = scene();
    const listener = vi.fn();
    s.measure.measurements.subscribe(listener);
    s.store.getState().setActiveTool('select');
    s.store.getState().setActiveTool('pan');
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
    expect(s.measure.getPlayerViewLayers(() => false).map((entry) => entry.visible)).toEqual([false, false, false]);
    expect(s.measure.measurements.get().live).toEqual({ shape: 'line', start: { x: 105, y: 105 }, end: { x: 315, y: 105 } });
  });
});
