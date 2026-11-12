// @vitest-environment jsdom
import { Graphics, type Container } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PATHFINDER_2E } from '../../../src/app/gameSystems/presets/pathfinder2e';
import { resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { MAX_MEASURES, type KeptMeasure } from '../../../src/app/measure/measureTypes';
import { MEASURE_FADE_MS } from '../../../src/app/pixi/measure/MeasureRenderer';
import { getHistoryStore } from '../../../src/app/stores/history';
import { measureFrom, measureScene, type MeasureScene } from '../../helpers/measureScene';

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

const kept = (s: MeasureScene): KeptMeasure[] => Object.values(s.store.getState().objects.measures ?? {});
const livePoints = (s: MeasureScene): unknown => s.measure.measurements.get().live?.points;
/** Cell centres of the 70 px grid, by column and row. */
const cell = (col: number, row: number): { x: number; y: number } => ({ x: col * 70 + 35, y: row * 70 + 35 });
/** The pin beside the live label, where a press takes it. */
function pin(s: MeasureScene): Container {
  const found = (s.parts()[1] as Container).children.find((child) => child.label === 'measure-pin');
  if (!found) throw new Error('Expected the pin');
  return found;
}

describe('the measure tool, dragged', () => {
  it('adds a corner with Space before the map\'s hotkeys hear it, and takes it back with Backspace', () => {
    const s = scene();
    const hotkeys = vi.fn();
    document.addEventListener('keydown', hotkeys);
    try {
      s.pointer('pointerdown', 35, 35);
      s.pointer('pointermove', 175, 35);
      const space = s.key(' ');
      expect(space.defaultPrevented).toBe(true);
      s.pointer('pointermove', 175, 175);
      expect(livePoints(s)).toEqual([cell(0, 0), cell(2, 0), cell(2, 2)]);
      expect(s.key('Backspace').defaultPrevented).toBe(true);
      expect(livePoints(s)).toEqual([cell(0, 0), cell(2, 2)]);
      expect(hotkeys).not.toHaveBeenCalled();
      // With nothing being measured the keys are the map's again.
      s.pointer('pointerup', 175, 175);
      expect(s.key(' ').defaultPrevented).toBe(false);
      expect(hotkeys).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener('keydown', hotkeys);
    }
  });

  it('leaves a key typed into a text field alone', () => {
    const s = scene();
    const field = document.body.appendChild(document.createElement('input'));
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    const typed = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    field.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
    expect(livePoints(s)).toEqual([cell(0, 0), cell(2, 0)]);
    field.remove();
  });

  it('drops the measurement on Escape', () => {
    const s = scene();
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    s.key('Escape');
    expect(s.measure.measurements.get().live).toBeNull();
    s.pointer('pointerup', 175, 35);
    expect(s.measure.measurements.get().live).toBeNull();
    expect(kept(s)).toEqual([]);
  });

  it('places freely while Alt is held, also when Alt goes down with the pointer at rest', () => {
    const s = scene();
    s.pointer('pointerdown', 40, 50, { alt: true });
    s.pointer('pointermove', 180, 90, { alt: true });
    expect(livePoints(s)).toEqual([{ x: 40, y: 50 }, { x: 180, y: 90 }]);
    s.pointer('pointermove', 180, 90);
    expect(livePoints(s)).toEqual([{ x: 40, y: 50 }, cell(2, 1)]);
    s.key('Alt');
    expect(livePoints(s)).toEqual([{ x: 40, y: 50 }, { x: 180, y: 90 }]);
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt', bubbles: true }));
    expect(livePoints(s)).toEqual([{ x: 40, y: 50 }, cell(2, 1)]);
  });

  it('draws nothing for store writes that are none of its business', () => {
    const s = scene();
    s.store.getState().setActiveTool('select');
    const cleared = vi.spyOn(Graphics.prototype, 'clear');
    s.store.getState().setGMView(false);
    s.store.getState().setActiveTool('move');
    s.store.getState().setMeasureTool({ keep: true });
    expect(cleared).not.toHaveBeenCalled();
    cleared.mockRestore();
  });

  it('measures with the primary button only, and leaves the others to the viewport', () => {
    const s = scene();
    s.pointer('pointerdown', 35, 35, { button: 2 });
    s.pointer('pointermove', 175, 35, { button: 2 });
    s.pointer('pointerup', 175, 35, { button: 2 });
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('labels a ruler with corners with its total and each leg, the legs adding up to it', () => {
    const s = scene();
    s.measure.measurementSettingsProvider = () => resolveMeasurementSettings(PATHFINDER_2E.rules.gridDefaults, null);
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 105, 105);
    expect(s.liveLabels().map((label) => label.text)).toEqual(['5ft']);
    s.key(' ');
    s.pointer('pointermove', 175, 175);
    // The second diagonal of a path costs two squares, whichever leg it lies on.
    expect(s.liveLabels().map((label) => label.text)).toEqual(['15ft', '5ft', '10ft']);
    const [total, , lastLeg] = s.liveLabels();
    expect(lastLeg!.view.scale.x).toBeLessThan(total!.view.scale.x);
    s.key('Backspace');
    expect(s.liveLabels().map((label) => label.text)).toEqual(['15ft']);
  });
});

describe('the measure tool, placed click by click', () => {
  it('places a corner with every click and finishes with a double click', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    s.click(35, 35);
    s.pointer('pointermove', 175, 35);
    expect(livePoints(s)).toEqual([cell(0, 0), cell(2, 0)]);
    s.click(175, 35);
    s.pointer('pointermove', 175, 175);
    s.click(175, 175);
    expect(kept(s)).toEqual([]);
    s.click(175, 175);
    expect(kept(s).map((measure) => measure.points)).toEqual([[cell(0, 0), cell(2, 0), cell(2, 2)]]);
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('finishes with Enter, and a right button that comes up meanwhile places nothing', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    s.click(35, 35);
    s.pointer('pointermove', 175, 35);
    s.pointer('pointerdown', 175, 35, { button: 2 });
    s.pointer('pointerup', 245, 35, { button: 2 });
    expect(livePoints(s)).toEqual([cell(0, 0), cell(2, 0)]);
    expect(s.key('Enter').defaultPrevented).toBe(true);
    expect(kept(s).map((measure) => measure.points)).toEqual([[cell(0, 0), cell(2, 0)]]);
  });

  it('finishes an area with its second click, and the click after it in the same place starts none', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true, mode: 'circle' });
    s.click(35, 35);
    s.click(175, 35);
    expect(kept(s).map(({ shape, points }) => ({ shape, points }))).toEqual([{ shape: 'circle', points: [cell(0, 0), cell(2, 0)] }]);
    s.click(175, 35);
    expect(s.measure.measurements.get().live).toBeNull();
    // Elsewhere it is a new measurement.
    s.click(315, 35);
    expect(livePoints(s)).toEqual([cell(4, 0), cell(4, 0)]);
  });
});

describe('keeping a measurement', () => {
  it('keeps it once per release as one undo step, with the tool\'s colour, and undo takes it off the map at once', () => {
    const s = scene();
    const history = getHistoryStore(s.store)!;
    history.getState().clear();
    s.store.getState().setMeasureTool({ keep: true, color: '#ff8800' });
    measureFrom(s, 35, 35, 175, 35);
    expect(kept(s)).toEqual([{ id: expect.any(String), kind: 'measure', shape: 'ruler', points: [cell(0, 0), cell(2, 0)], color: '#ff8800' }]);
    expect(history.getState().pastStates).toHaveLength(1);
    expect(s.parts()).toHaveLength(4);
    history.getState().undo();
    expect(s.measure.measurements.get().kept).toEqual([]);
    expect(s.parts()).toHaveLength(2);
    history.getState().redo();
    expect(s.measure.measurements.get().kept).toHaveLength(1);
    expect(s.parts()).toHaveLength(4);
  });

  it('draws again only the kept measurement that changed', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 35, 175, 35);
    measureFrom(s, 35, 175, 175, 175);
    const [first, second] = kept(s);
    const before = s.parts().slice(2);
    s.store.getState().updateMeasure(second!.id, { color: '#00ff00' });
    // The same drawings: nothing was built anew, and the untouched record is the same object.
    expect(s.parts().slice(2)).toEqual(before);
    expect(s.measure.measurements.get().kept[0]).toBe(first);
    s.store.getState().deleteMeasure(first!.id);
    expect(s.parts().slice(2)).toEqual(before.slice(2));
  });

  it('does the other thing than Keep when Shift is held at the release', () => {
    vi.useFakeTimers();
    const s = scene();
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    s.pointer('pointerup', 175, 35, { shift: true });
    expect(kept(s)).toHaveLength(1);
    s.store.getState().setMeasureTool({ keep: true });
    s.pointer('pointerdown', 35, 175);
    s.pointer('pointermove', 175, 175);
    s.pointer('pointerup', 175, 175, { shift: true });
    expect(kept(s)).toHaveLength(1);
    expect(livePoints(s)).toEqual([cell(0, 2), cell(2, 2)]);
    vi.advanceTimersByTime(MEASURE_FADE_MS);
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('reads Keep at the release, so switching it in the middle of a measurement counts', () => {
    const s = scene();
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    s.store.getState().setMeasureTool({ keep: true });
    s.pointer('pointerup', 175, 35);
    expect(kept(s)).toHaveLength(1);
  });

  it('shows a pin beside the label while a released measurement fades, and a click on it keeps the measurement and starts no other', () => {
    vi.useFakeTimers();
    const s = scene();
    expect(pin(s).visible).toBe(false);
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    expect(pin(s).visible).toBe(false);
    s.pointer('pointerup', 175, 35);
    expect(pin(s).visible).toBe(true);
    // The pin is the GM's, as the kept measurements' handles are: a players' frame leaves them out, and only them.
    expect(s.measure.getPlayerViewLayers(() => true)).toEqual([
      { layer: s.parts()[0], visible: true }, { layer: s.parts()[1], visible: true }, { layer: pin(s), visible: false },
      { layer: s.measure.handles.layer, visible: false },
    ]);
    const { x, y } = pin(s).position;
    s.click(x, y);
    expect(kept(s).map((measure) => measure.points)).toEqual([[cell(0, 0), cell(2, 0)]]);
    expect(s.measure.measurements.get().live).toBeNull();
    expect(pin(s).visible).toBe(false);
    // The timer of the measurement that was kept clears nothing later.
    s.pointer('pointerdown', 35, 175);
    vi.advanceTimersByTime(MEASURE_FADE_MS);
    expect(livePoints(s)).toEqual([cell(0, 2), cell(0, 2)]);
    expect(kept(s)).toHaveLength(1);
  });

  it('replaces a fading measurement with the next press, whose own fade starts at its release', () => {
    vi.useFakeTimers();
    const s = scene();
    measureFrom(s, 35, 35, 175, 35);
    vi.advanceTimersByTime(MEASURE_FADE_MS - 100);
    s.pointer('pointerdown', 35, 175);
    s.pointer('pointermove', 175, 175);
    expect(pin(s).visible).toBe(false);
    vi.advanceTimersByTime(MEASURE_FADE_MS);
    expect(livePoints(s)).toEqual([cell(0, 2), cell(2, 2)]);
    s.pointer('pointerup', 175, 175);
    vi.advanceTimersByTime(MEASURE_FADE_MS - 1);
    expect(s.measure.measurements.get().live).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(s.measure.measurements.get().live).toBeNull();
  });

  it('keeps a measurement only the GM sees while players are not to see what is measured', () => {
    const s = scene();
    s.store.getState().setMeasureTool({ keep: true, players: false });
    measureFrom(s, 35, 35, 175, 35);
    expect(kept(s)[0]?.hidden).toBe(true);
    // The GM's canvas shows it; a players' frame does not.
    expect(s.visible().slice(2)).toEqual([true, true]);
    expect(s.measure.getPlayerViewLayers(() => true).slice(2, 4).map((entry) => entry.visible)).toEqual([false, false]);
  });

  it('tells the GM when the level keeps no more, and lets the measurement fade instead', () => {
    const s = scene();
    const full: Record<string, KeptMeasure> = {};
    for (let index = 0; index < MAX_MEASURES; index++) full[`m${index}`] = { id: `m${index}`, kind: 'measure', shape: 'ruler', points: [cell(0, 0), cell(1, 0)] };
    s.store.setState((state) => ({ objects: { ...state.objects, measures: full } }));
    s.store.getState().setMeasureTool({ keep: true });
    measureFrom(s, 35, 175, 175, 175);
    expect(s.full).toHaveBeenCalledTimes(1);
    expect(kept(s)).toHaveLength(MAX_MEASURES);
    expect(livePoints(s)).toEqual([cell(0, 2), cell(2, 2)]);
    expect(pin(s).visible).toBe(true);
  });

  it('drops what is being measured when another scene loads', () => {
    const s = scene();
    s.pointer('pointerdown', 35, 35);
    s.pointer('pointermove', 175, 35);
    s.store.getState().setMapPath('maps/other.atlasmap');
    expect(s.measure.measurements.get().live).toBeNull();
    expect(s.key(' ').defaultPrevented).toBe(false);
  });
});
