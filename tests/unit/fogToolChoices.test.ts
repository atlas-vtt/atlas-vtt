import { describe, expect, it } from 'vitest';
import { clampBrushSize, DEFAULT_FOG_TOOL, FOG_BRUSH_SIZES, fogStrokeReveals, fogToolFor, fogWhat, isFogTool, makesFogAreas, settledFogTool, steppedBrushSize } from '../../src/app/fog/fogToolChoices';
import { DEFAULT_GM_FOG_OPACITY, readGmFogOpacity } from '../../src/app/fog/gmFogOpacity';

describe('what the fog tool does', () => {
  const state = (activeTool: string, areas = false): { activeTool: string; fogTool: { areas: boolean } } => ({ activeTool, fogTool: { areas } });

  it('hides with the fog tool, reveals with its eraser, and makes areas only while it hides', () => {
    expect(fogWhat(state('fog'))).toBe('hide');
    expect(fogWhat(state('eraser'))).toBe('reveal');
    expect(fogWhat(state('fog', true))).toBe('areas');
    // The revealing tool makes no areas, whatever the choice says.
    expect(fogWhat(state('eraser', true))).toBe('reveal');
  });

  it('names the tool and the mode for each thing it does, which read back as that thing', () => {
    expect(fogToolFor('hide')).toEqual({ tool: 'fog', areas: false });
    expect(fogToolFor('reveal')).toEqual({ tool: 'eraser', areas: false });
    expect(fogToolFor('areas')).toEqual({ tool: 'fog', areas: true });
    for (const what of ['hide', 'reveal', 'areas'] as const) {
      const { tool, areas } = fogToolFor(what);
      expect(fogWhat(state(tool, areas))).toBe(what);
    }
  });

  it('knows its two tools', () => {
    expect(['fog', 'eraser'].every(isFogTool)).toBe(true);
    expect(['move', 'measure', 'draw-eraser', ''].some(isFogTool)).toBe(false);
  });

  it('turns a stroke around while Alt is held', () => {
    expect(fogStrokeReveals('fog', false)).toBe(false);
    expect(fogStrokeReveals('eraser', false)).toBe(true);
    expect(fogStrokeReveals('fog', true)).toBe(true);
    expect(fogStrokeReveals('eraser', true)).toBe(false);
  });
});

describe('the choices the fog tool can hold', () => {
  it('have no brush while the tool makes areas: the rectangle takes its place', () => {
    expect(settledFogTool({ areas: true, shape: 'brush', brushSize: 50 })).toEqual({ areas: true, shape: 'rectangle', brushSize: 50 });
    expect(settledFogTool({ areas: false, shape: 'brush', brushSize: 50 }).shape).toBe('brush');
    expect(settledFogTool({ areas: true, shape: 'lasso', brushSize: 50 }).shape).toBe('lasso');
  });

  it('make areas only while the hiding tool is the one in use', () => {
    expect(makesFogAreas({ activeTool: 'fog', fogTool: { areas: true } })).toBe(true);
    expect(makesFogAreas({ activeTool: 'fog', fogTool: { areas: false } })).toBe(false);
    expect(makesFogAreas({ activeTool: 'move', fogTool: { areas: true } })).toBe(false);
    expect(makesFogAreas({ activeTool: 'eraser', fogTool: { areas: true } })).toBe(false);
  });

  it('keep the brush within its limits', () => {
    expect(settledFogTool({ areas: false, shape: 'brush', brushSize: 9000 }).brushSize).toBe(FOG_BRUSH_SIZES.max);
  });
});

describe('the fog brush\'s size', () => {
  it('stays whole and within its limits, and is the default where it is no number', () => {
    expect(clampBrushSize(50.4)).toBe(50);
    expect(clampBrushSize(3)).toBe(FOG_BRUSH_SIZES.min);
    expect(clampBrushSize(9000)).toBe(FOG_BRUSH_SIZES.max);
    expect(clampBrushSize(-Infinity)).toBe(DEFAULT_FOG_TOOL.brushSize);
    expect(clampBrushSize(Number.NaN)).toBe(DEFAULT_FOG_TOOL.brushSize);
  });

  it('steps by about a seventh of itself, so a small and a large brush change alike', () => {
    expect(steppedBrushSize(50, 1)).toBe(57);
    expect(steppedBrushSize(50, -1)).toBe(43);
    expect(steppedBrushSize(100, 1)).toBe(115);
    expect(steppedBrushSize(100, -1)).toBe(87);
    for (const size of [10, 14, 23, 50, 87, 140, 173]) {
      const larger = steppedBrushSize(size, 1);
      expect(larger / size).toBeGreaterThan(1.05);
      expect(larger / size).toBeLessThan(1.25);
    }
  });

  it('steps a held key\'s brush by about a twentieth of itself, a pixel at least, so a held key sizes it smoothly', () => {
    expect(steppedBrushSize(100, 1, true)).toBe(105);
    expect(steppedBrushSize(100, -1, true)).toBe(95);
    expect(steppedBrushSize(FOG_BRUSH_SIZES.min, 1, true)).toBeGreaterThan(FOG_BRUSH_SIZES.min);
    let size: number = FOG_BRUSH_SIZES.min;
    let steps = 0;
    while (size < FOG_BRUSH_SIZES.max) {
      size = steppedBrushSize(size, 1, true);
      steps += 1;
    }
    // At 25 repeats a second, the whole range in two to four seconds.
    expect(steps).toBeGreaterThan(40);
    expect(steps).toBeLessThan(100);
  });

  it('walks from the smallest brush to the largest and back, a step at a time, and stops at either end', () => {
    let size: number = FOG_BRUSH_SIZES.min;
    const up: number[] = [size];
    while (size < FOG_BRUSH_SIZES.max) {
      const next = steppedBrushSize(size, 1);
      expect(next).toBeGreaterThan(size);
      up.push(size = next);
    }
    expect(up.length).toBeGreaterThan(15);
    expect(up.length).toBeLessThan(30);
    expect(steppedBrushSize(FOG_BRUSH_SIZES.max, 1)).toBe(FOG_BRUSH_SIZES.max);
    while (size > FOG_BRUSH_SIZES.min) {
      const next = steppedBrushSize(size, -1);
      expect(next).toBeLessThan(size);
      size = next;
    }
    expect(steppedBrushSize(FOG_BRUSH_SIZES.min, -1)).toBe(FOG_BRUSH_SIZES.min);
  });
});

describe('the GM\'s fog opacity as it is stored', () => {
  it('reads a number, or a number as text, within its range', () => {
    expect(readGmFogOpacity(0.35)).toBe(0.35);
    expect(readGmFogOpacity('0.8')).toBe(0.8);
    expect(readGmFogOpacity(1)).toBe(1);
    expect(readGmFogOpacity(0)).toBe(0.1);
    expect(readGmFogOpacity(-4)).toBe(0.1);
    expect(readGmFogOpacity('7')).toBe(1);
  });

  it('is the default for whatever is no opacity', () => {
    for (const stored of [null, undefined, '', '  ', 'half', Number.NaN, Infinity, '1e999', true, {}, [], ['0.3']]) {
      expect(readGmFogOpacity(stored), String(stored)).toBe(DEFAULT_GM_FOG_OPACITY);
    }
  });
});
