// @vitest-environment jsdom
import { Container, EventBoundary, FederatedPointerEvent, Text, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { areaMapOf } from '../../../src/app/measure/areaOnMap';
import { DEFAULT_MEASURE_TOOL, type KeptMeasure, type MeasureInput as KeptInput, type MeasureToolOptions } from '../../../src/app/measure/measureTypes';
import type { MeasureLook } from '../../../src/app/pixi/measure/DrawnMeasure';
import { LiveMeasuring, type LiveMeasuringState } from '../../../src/app/pixi/measure/LiveMeasuring';
import { MeasureInput } from '../../../src/app/pixi/measure/MeasureInput';
import { MeasureLayer } from '../../../src/app/pixi/measure/MeasureLayer';
import { MeasurePartsVisibility } from '../../../src/app/pixi/measurePartsVisibility';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import { stubJsdomGraphics } from '../../mocks/jsdomGraphics';

const CELL = 70;
const GRID = { type: 'square', size: CELL, offsetX: 0, offsetY: 0 } as const;
const SETTINGS: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, rangeBands: [], coneAngle: 90, diagonalRule: 'equidistant' };
const WALL: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 490, y: -5000 }, p2: { x: 490, y: 5000 } };

/**
 * The measure tool's own parts with no view behind them: the gesture's input, the measurement
 * being made, the layer and what shows its parts, over a plain object that holds the tool's
 * choices and a list of kept measurements. What a players' page builds its tool from.
 */
function standalone(): {
  tool: MeasureToolOptions;
  kept: KeptMeasure[];
  map: Container;
  viewport: Viewport;
  pointer(type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number): void;
  key(key: string): void;
  destroy(): void;
} {
  const restoreGraphics = stubJsdomGraphics();
  const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, worldWidth: 2000, worldHeight: 2000, events: { domElement: createEl('canvas') } as unknown as EventSystem });
  // The map's own layer under its tokens, where the page lays the bodies of areas.
  const map = new Container({ label: 'under-tokens' });
  viewport.addChild(map);
  const tool: MeasureToolOptions = { ...DEFAULT_MEASURE_TOOL };
  const kept: KeptMeasure[] = [];
  const state: LiveMeasuringState = {
    grid: { snapToGrid: true, size: CELL },
    get measureTool() { return tool; },
    lighting: { enabled: true },
    addMeasure: (measure: KeptInput) => {
      const id = `own${kept.length}`;
      kept.push({ id, kind: 'measure', ...measure });
      layer.setKept([...kept]);
      return id;
    },
  };
  const look = (): MeasureLook => ({ zoom: 1, grid: GRID, settings: SETTINGS, accent: 0x66ffa9, map: areaMapOf(GRID, SETTINGS, true, [WALL]), tokens: () => ({}), ringScale: 1 });
  // What shows the parts is made with the layer's live parts, and the layer tells it of the kept ones.
  const shown: { parts: MeasurePartsVisibility | null } = { parts: null };
  const layer: MeasureLayer = new MeasureLayer(viewport, look, {
    kept: (parts, audience) => shown.parts?.keep(parts, audience),
    forgotten: (parts) => shown.parts?.forget(parts),
    marked: (parts) => shown.parts?.marked(parts),
  }, { layBodies: (bodies) => map.addChild(bodies), gmOutlines: false });
  const parts = new MeasurePartsVisibility(layer.liveParts, () => null, []);
  shown.parts = parts;
  const live = new LiveMeasuring({
    store: { getState: () => state },
    grid: { getOptions: () => GRID, snapToCellCenter: (x, y) => ({ x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }) },
    layer,
    parts,
    measuring: () => input.measuring,
    changed: () => undefined,
    full: () => undefined,
  });
  const input: MeasureInput = new MeasureInput(viewport, live, { typed: () => false, areMaps: () => true });
  input.setEnabled(true);
  const boundary = new EventBoundary(viewport);
  return {
    tool, kept, map, viewport,
    pointer(type, x, y): void {
      const event = new FederatedPointerEvent(boundary);
      event.button = 0;
      event.global.set(x, y);
      viewport.emit(type, event);
    },
    key(key): void {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    },
    destroy(): void {
      input.destroy();
      live.destroy();
      layer.destroy();
      viewport.destroy();
      restoreGraphics();
    },
  };
}

const texts = (container: Container): string[] => container.children.flatMap((child) => (child instanceof Text ? [child.text] : texts(child)));

describe('the measure tool without a view\'s store', () => {
  let tool: ReturnType<typeof standalone> | undefined;
  afterEach(() => {
    tool?.destroy();
    tool = undefined;
  });

  it('measures and keeps by the tool\'s choices, into whatever keeps for it: a ruler with a corner, a line with the width it was given', () => {
    const s = (tool = standalone());
    s.tool.keep = true;
    s.pointer('pointerdown', 105, 105);
    s.pointer('pointermove', 315, 105);
    s.key(' ');
    s.pointer('pointermove', 315, 245);
    s.pointer('pointerup', 315, 245);
    expect(s.kept).toEqual([{ id: 'own0', kind: 'measure', shape: 'ruler', points: [{ x: 105, y: 105 }, { x: 315, y: 105 }, { x: 315, y: 245 }] }]);
    s.tool.mode = 'line';
    s.tool.lineWidth = 2;
    s.tool.color = '#66ffa9';
    s.pointer('pointerdown', 140, 140);
    s.pointer('pointermove', 350, 140);
    s.pointer('pointerup', 350, 140);
    expect(s.kept[1]).toEqual({ id: 'own1', kind: 'measure', shape: 'line', points: [{ x: 140, y: 140 }, { x: 350, y: 140 }], width: 2 * CELL, color: '#66ffa9' });
    expect(texts(s.viewport)).toContain('15 × 10ft');
  });

  it('draws an area\'s body where it is laid, cut by the map\'s walls, and nothing of the area above the lighting but its size', () => {
    const s = (tool = standalone());
    s.tool.mode = 'circle';
    s.pointer('pointerdown', 350, 350);
    s.pointer('pointermove', 630, 350);
    const bodies = s.map.getChildByLabel('measure-bodies');
    expect(bodies).not.toBeNull();
    expect(Math.round(bodies?.getLocalBounds().maxX ?? 0)).toBe(490);
    expect(Math.round(bodies?.getLocalBounds().minX ?? 0)).toBe(70);
    // The top of the map holds the rulers' ink and the labels, and no layer of outlines.
    expect(s.viewport.children.map((child) => child.label)).toEqual(['under-tokens', 'measures', 'measure-labels']);
    expect(s.viewport.getChildByLabel('measures')?.getLocalBounds().width).toBe(0);
  });
});
