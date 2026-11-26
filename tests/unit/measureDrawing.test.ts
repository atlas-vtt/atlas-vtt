// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Container, Graphics, type Circle } from 'pixi.js';
import { CANVAS_INK, INK_SHADE } from '../../src/app/pixi/utils/canvasInk';
import type { Measurement } from '../../src/app/measure/measureTypes';
import { drawMeasureCircle, drawMeasureCone, drawMeasurement, measureLabelTarget } from '../../src/app/pixi/utils/measureDrawing';
import { MEASURE_CASING, MeasureInk, MeasureInkLayer, darkBands } from '../../src/app/pixi/utils/measureInk';


/** A measurement's three drawings on its layer: the area beneath, the dark bands and the accent. */
function layers(ink: MeasureInk): { area: Graphics; dark: Graphics; accent: Graphics; line: Container } {
  const layer = surfaces.get(ink)!;
  const area = layer.areas.children[0] as Graphics;
  const line = layer.lines.children[0] as Container;
  const [dark, accent] = line.children as [Graphics, Graphics];
  return { area, dark, accent, line };
}

const surfaces = new Map<MeasureInk, MeasureInkLayer>();

/** A measurement alone on a layer of its own. */
function newInk(): MeasureInk {
  const layer = new MeasureInkLayer();
  const ink = new MeasureInk(layer);
  surfaces.set(ink, layer);
  return ink;
}

type Step = { action: string; data: unknown[] };

/** Each fill or stroke a Graphics was told to draw, with its style and the steps of its path. */
function drawn(graphics: Graphics): { action: string; style: Record<string, unknown>; path: Step[] }[] {
  return graphics.context.instructions.flatMap((instruction) =>
    instruction.action === 'texture'
      ? []
      : [{ action: instruction.action, style: instruction.data.style as unknown as Record<string, unknown>, path: instruction.data.path.instructions as unknown as Step[] }],
  );
}

function circleRadii(graphics: Graphics): number[] {
  return graphics.context.instructions.flatMap((instruction) =>
    instruction.action === 'texture'
      ? []
      : instruction.data.path.shapePath.shapePrimitives.filter(({ shape }) => shape.type === 'circle').map(({ shape }) => (shape as Circle).radius),
  );
}

const ACCENT = 0x7f6df2;
const start = { x: 105, y: 35 };

describe('darkBands', () => {
  it('lays the selection shade beyond the casing, outermost first, so max blending leaves each band its own opacity', () => {
    const bands = darkBands(CANVAS_INK.stroke);
    const cased = CANVAS_INK.stroke + 2 * MEASURE_CASING.width;
    expect(bands.at(-1)).toEqual({ width: cased, alpha: MEASURE_CASING.alpha });
    expect(bands.slice(0, -1).map((band) => band.alpha)).toEqual(INK_SHADE.map((band) => band.alpha).reverse());
    expect(bands[0]!.width).toBe(cased + 2 * INK_SHADE.reduce((sum, band) => sum + band.width, 0));
    expect(bands.every((band, i) => i === 0 || band.width < bands[i - 1]!.width)).toBe(true);
  });
});

describe('MeasureInk', () => {
  it('draws at its size on screen: a zoom of 2 doubles the points and halves the drawing back', () => {
    const ink = newInk();
    ink.begin(2);
    drawMeasurement(ink, ACCENT, { shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }, 90);
    expect(layers(ink).line.scale.x).toBe(0.5);
    expect(layers(ink).area.scale.x).toBe(0.5);
    const [line] = drawn(layers(ink).accent);
    expect(line!.path.map((step) => step.data.slice(0, 2))).toEqual([[0, 0], [200, 0]]);
    ink.destroy();
  });

  it('composes the lines of every measurement on a layer in one pass, the dark bands max-blended', () => {
    const layer = new MeasureInkLayer();
    const inks = [new MeasureInk(layer), new MeasureInk(layer), new MeasureInk(layer)];
    expect(layer.lines.filters).toHaveLength(1);
    expect(layer.lines.children).toHaveLength(3);
    expect(layer.lines.children.every((line) => !line.filters || line.filters.length === 0)).toBe(true);
    const [dark, accent] = (layer.lines.children[0] as Container).children as Graphics[];
    expect(dark!.blendMode).toBe('max');
    expect(accent!.blendMode).not.toBe('max');
    // The areas lie beneath every line.
    expect(layer.view.children).toEqual([layer.areas, layer.lines]);
    inks[1]!.destroy();
    expect(layer.lines.children).toHaveLength(2);
    expect(layer.areas.children).toHaveLength(2);
    layer.destroy();
  });

  it('shows or hides one measurement, area and line together, and leaves the others', () => {
    const layer = new MeasureInkLayer();
    const [first, second] = [new MeasureInk(layer), new MeasureInk(layer)];
    first!.shape.visible = false;
    expect(layer.areas.children.map((area) => area.visible)).toEqual([false, true]);
    expect(layer.lines.children.map((line) => line.visible)).toEqual([false, true]);
    expect([first!.shape.visible, second!.shape.visible]).toEqual([false, true]);
    layer.destroy();
  });
});

describe('drawMeasurement', () => {
  it('strokes a ruler once in its colour, opaque and with round ends, and marks its start with a ring and its end with a dot', () => {
    const ink = newInk();
    ink.begin(1);
    drawMeasurement(ink, ACCENT, { shape: 'ruler', points: [start, { x: 315, y: 175 }] }, 90);
    const strokes = drawn(layers(ink).accent).filter((step) => step.action === 'stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.style).toMatchObject({ width: CANVAS_INK.stroke, alpha: 1, cap: 'round', join: 'round' });
    // The end's dot, the start's ring and its white middle; nothing translucent among them.
    expect(circleRadii(layers(ink).accent)).toEqual([4, 5, 5 - CANVAS_INK.stroke]);
    expect(drawn(layers(ink).area)).toEqual([]);
    // The casing under it: black, wider than the stroke by the casing on either side.
    const casing = drawn(layers(ink).dark).filter((step) => step.action === 'stroke').at(-1)!;
    expect(casing.style).toMatchObject({ width: CANVAS_INK.stroke + 2 * MEASURE_CASING.width, color: 0x000000, alpha: MEASURE_CASING.alpha });
    expect(MEASURE_CASING.alpha).toBeGreaterThan(CANVAS_INK.keylineAlpha);
    ink.destroy();
  });

  it('strokes a ruler with corners as one path through them, a dot on every corner', () => {
    const ink = newInk();
    ink.begin(1);
    drawMeasurement(ink, 0xff8800, { shape: 'ruler', points: [start, { x: 315, y: 35 }, { x: 315, y: 175 }] }, 90);
    const strokes = drawn(layers(ink).accent).filter((step) => step.action === 'stroke');
    expect(strokes).toHaveLength(1);
    expect(strokes[0]!.style).toMatchObject({ color: 0xff8800 });
    expect(strokes[0]!.path.map((step) => step.data.slice(0, 2))).toEqual([[105, 35], [315, 35], [315, 175]]);
    expect(circleRadii(layers(ink).accent)).toEqual([4, 4, 5, 5 - CANVAS_INK.stroke]);
    ink.destroy();
  });

  it('draws a circle as one wash inside one outline', () => {
    const ink = newInk();
    ink.begin(1);
    drawMeasurement(ink, ACCENT, { shape: 'circle', points: [start, { x: 245, y: 35 }] }, 90);
    expect(drawn(layers(ink).area).map((step) => step.action)).toEqual(['fill']);
    expect(circleRadii(layers(ink).area)).toEqual([140]);
    expect(drawn(layers(ink).accent).filter((step) => step.action === 'stroke')).toHaveLength(1);
    ink.destroy();
  });

  // Canvas 2D (the renderer without WebGL) throws on a negative arc radius, which stops the map from rendering.
  it('draws no area before the pointer has moved, only the start', () => {
    const ink = newInk();
    ink.begin(1);
    drawMeasureCircle(ink, ACCENT, start, 0);
    drawMeasureCone(ink, ACCENT, start, start, 90);
    expect(drawn(layers(ink).area)).toEqual([]);
    expect(drawn(layers(ink).accent)).toEqual([]);
    ink.destroy();
  });

  it('outlines a cone as one closed path whose arc runs on from the apex, opened by the angle it is given', () => {
    const ink = newInk();
    ink.begin(1);
    drawMeasureCone(ink, ACCENT, start, { x: 315, y: 35 }, 60);
    const strokes = drawn(layers(ink).accent).filter((step) => step.action === 'stroke');
    expect(strokes).toHaveLength(1);
    const path = strokes[0]!.path;
    expect(path.map((step) => step.action)).toEqual(['moveTo', 'arc', 'closePath']);
    const [, , radius, from, to] = path[1]!.data as number[];
    expect(radius).toBeCloseTo(210);
    expect(to! - from!).toBeCloseTo(Math.PI / 3);
    ink.destroy();
  });
});

describe('measureLabelTarget', () => {
  const end = { x: 315, y: 175 };
  it('puts a ruler\'s distance beside it, a circle\'s above its centre and a cone\'s over the middle of its axis', () => {
    const at = (shape: Measurement['shape']): unknown => measureLabelTarget({ shape, points: [start, end] });
    expect(at('ruler')).toEqual({ beside: [start, end] });
    expect(at('circle')).toEqual({ beside: [start] });
    expect(at('cone')).toEqual({ over: { x: 210, y: 105 } });
  });

  it('puts the total of a ruler with corners beyond its end, where no leg\'s own length stands', () => {
    expect(measureLabelTarget({ shape: 'ruler', points: [start, { x: 315, y: 35 }, end] })).toEqual({ beyond: { from: { x: 315, y: 35 }, to: end } });
  });
});
