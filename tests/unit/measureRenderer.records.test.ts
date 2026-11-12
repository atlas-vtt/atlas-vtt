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
    expect(scene().measure.measurements.get()).toEqual({ live: null, kept: [], walled: false });
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
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [], walled: false });
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

  it('measures nothing in the ranges mode, which shows rings and no measurement', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'ranges' });
    measureFrom(s, 100, 100);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [], walled: false });
  });

  it('starts an area on the nearest cell centre, corner or edge middle, and ends it a whole number of cells away, whichever way the pointer lies', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'circle' });
    // Of the points half a cell apart, (100, 100) lies nearest the cell's centre.
    s.pointer('pointerdown', 100, 100);
    expect(s.measure.measurements.get().live?.points[0]).toEqual({ x: 105, y: 105 });
    // 100 px down and 100 right is 141 px away: two cells, along the same way.
    s.pointer('pointermove', 205, 205);
    const [origin, end] = s.measure.measurements.get().live!.points;
    expect(Math.hypot(end!.x - origin!.x, end!.y - origin!.y)).toBeCloseTo(140);
    expect(end!.x - origin!.x).toBeCloseTo(end!.y - origin!.y);
    // A corner of cells, where four meet, takes an area's start; a ruler's lies on a centre.
    s.pointer('pointerup', 205, 205);
    s.pointer('pointerdown', 138, 142);
    expect(s.measure.measurements.get().live?.points[0]).toEqual({ x: 140, y: 140 });
    // Never less than one cell, and freely with Alt.
    s.pointer('pointermove', 150, 140);
    expect(s.measure.measurements.get().live?.points[1]).toEqual({ x: 210, y: 140 });
    s.pointer('pointermove', 150, 143, { alt: true });
    expect(s.measure.measurements.get().live?.points[1]).toEqual({ x: 150, y: 143 });
  });

  it('measures a square, and a line as wide as the tool holds, in cells of the map', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ mode: 'square', keep: true });
    measureFrom(s, 105, 105, 315, 105);
    s.store.getState().setMeasureTool({ mode: 'line' });
    measureFrom(s, 105, 315, 315, 315);
    s.store.getState().setMeasureTool({ lineWidth: 2 });
    measureFrom(s, 105, 525, 315, 525);
    expect(Object.values(s.store.getState().objects.measures ?? {}).map(({ shape, points, width }) => ({ shape, points, width }))).toEqual([
      { shape: 'square', points: [{ x: 105, y: 105 }, { x: 315, y: 105 }], width: undefined },
      { shape: 'line', points: [{ x: 105, y: 315 }, { x: 315, y: 315 }], width: 70 },
      { shape: 'line', points: [{ x: 105, y: 525 }, { x: 315, y: 525 }], width: 140 },
    ]);
  });

  it('keeps released measurements as scene objects while Keep is on, in the order they were kept', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 100, 100);
    s.store.getState().setMeasureTool({ mode: 'circle' });
    measureFrom(s, 385, 385, 385, 600);
    const kept = Object.values(s.store.getState().objects.measures ?? {});
    expect(kept).toEqual([
      { id: expect.any(String), kind: 'measure', shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 315, y: 105 }] },
      { id: expect.any(String), kind: 'measure', shape: 'circle', points: [{ x: 385, y: 385 }, { x: 385, y: 595 }] },
    ]);
    expect(s.measure.measurements.get()).toEqual({ live: null, kept, walled: false });
    // Switching Keep off keeps what was kept: it is the scene's now.
    s.store.getState().setMeasureTool({ keep: false });
    expect(s.measure.measurements.get().kept).toHaveLength(2);
    s.store.getState().clearMeasures();
    expect(s.measure.measurements.get()).toEqual({ live: null, kept: [], walled: false });
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

  it('tells the colour the live measurement is drawn in, where the tool names one', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ color: '#ec7500' });
    s.pointer('pointerdown', 100, 100);
    s.pointer('pointermove', 300, 100);
    expect(s.measure.measurements.get().live?.color).toBe('#ec7500');
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
