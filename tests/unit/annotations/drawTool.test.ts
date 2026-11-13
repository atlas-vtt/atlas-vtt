import { describe, expect, it } from 'vitest';
import { DEFAULT_DRAW_TOOL } from '../../../src/app/annotations/annotationTypes';
import { drawToolFrom, rememberedDrawTool } from '../../../src/app/annotations/drawToolMemory';
import { DRAW_TOOL_STORAGE_KEY, loadDrawTool, saveDrawTool } from '../../../src/app/services/deviceSettings';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

describe('the draw tool\'s choices', () => {
  it('start as a white pen of size M that players see, above the tokens, and change without an undo step', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `draw-tool-${Math.random()}`);
    expect(store.getState().drawTool).toEqual(DEFAULT_DRAW_TOOL);
    expect(DEFAULT_DRAW_TOOL).toMatchObject({ mode: 'pen', color: '#ffffff', size: 'm', players: true, layer: 'above', seeThrough: false, fill: null, dash: null, ends: null });

    store.getState().setDrawTool({ mode: 'line', ends: 'end' });
    store.getState().setDrawTool({ color: '#3366ff' });
    expect(store.getState().drawTool).toEqual({ ...DEFAULT_DRAW_TOOL, mode: 'line', ends: 'end', color: '#3366ff' });
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    // Still the tool every other tool id names: the choices are the Draw tool's alone
    expect(store.getState().activeTool).toBe('move');
  });

  it('remember their style on the device, so the next view and the next start begin with it', () => {
    const { app, localStorage } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `draw-tool-${Math.random()}`);
    store.getState().setDrawTool({ color: '#aa3300', size: 'xl', players: false, layer: 'map', fill: 'soft', font: 'mono' });
    expect(JSON.parse(localStorage.get(DRAW_TOOL_STORAGE_KEY) as string)).toMatchObject({ color: '#aa3300', size: 'xl', players: false, layer: 'map', fill: 'soft', font: 'mono' });

    const next = createViewAtlasStore(app, `draw-tool-${Math.random()}`);
    expect(next.getState().drawTool).toEqual({ ...DEFAULT_DRAW_TOOL, color: '#aa3300', size: 'xl', players: false, layer: 'map', fill: 'soft', font: 'mono' });
  });

  it('do not remember the mode or what the eraser does, and store nothing for a change of those alone', () => {
    const { app, localStorage } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `draw-tool-${Math.random()}`);
    store.getState().setDrawTool({ mode: 'eraser', eraseWhole: true, cellsUnfill: true });
    store.getState().setDrawTool({ color: DEFAULT_DRAW_TOOL.color });
    expect(localStorage.has(DRAW_TOOL_STORAGE_KEY)).toBe(false);

    store.getState().setDrawTool({ seeThrough: true });
    expect(localStorage.get(DRAW_TOOL_STORAGE_KEY)).toBe(JSON.stringify(rememberedDrawTool({ ...DEFAULT_DRAW_TOOL, seeThrough: true })));
    expect(loadDrawTool(app)).toEqual({ ...DEFAULT_DRAW_TOOL, seeThrough: true });
  });

  it('read what a device stored field by field, the default for each that cannot be read', () => {
    expect(drawToolFrom(null)).toEqual(DEFAULT_DRAW_TOOL);
    expect(drawToolFrom('pen')).toEqual(DEFAULT_DRAW_TOOL);
    expect(drawToolFrom({
      mode: 'eraser', eraseWhole: true, color: 'red', size: 'xxl', players: 'no', layer: 'sky', dash: 'wavy', ends: 'both', fill: 'solid', curved: true,
      font: 'comic', look: 'plate', align: 'right', bold: true, italic: 1, icon: '', seeThrough: true, cellsLayer: 'sky', cellsUnfill: true,
    })).toEqual({ ...DEFAULT_DRAW_TOOL, ends: 'both', fill: 'solid', curved: true, look: 'plate', align: 'right', bold: true, seeThrough: true });
    expect(drawToolFrom({ icon: 'cauldron', dash: 'dotted', layer: 'map', size: 's', color: '#000000', cellsLayer: 'above' }))
      .toEqual({ ...DEFAULT_DRAW_TOOL, icon: 'cauldron', dash: 'dotted', layer: 'map', size: 's', color: '#000000', cellsLayer: 'above' });
    // One of the twelve symbols stamps had before is drawn still, and placed no more: the tool starts with its own.
    expect(drawToolFrom({ icon: 'skull' }).icon).toBe(DEFAULT_DRAW_TOOL.icon);
    expect(drawToolFrom({ icon: 'constructor' }).icon).toBe(DEFAULT_DRAW_TOOL.icon);
    // The Cells mode fills on the map unless told otherwise, whatever the other modes' layer.
    expect(DEFAULT_DRAW_TOOL).toMatchObject({ layer: 'above', cellsLayer: 'map', icon: 'door' });
  });

  it('start with the defaults where the device\'s storage holds something else or cannot be read', () => {
    const { app, localStorage } = createInMemoryApp({ files: {} });
    localStorage.set(DRAW_TOOL_STORAGE_KEY, '{not json');
    const logged: unknown[] = [];
    const error = console.error;
    console.error = (...args: unknown[]): void => { logged.push(args); };
    try {
      expect(loadDrawTool(app)).toEqual(DEFAULT_DRAW_TOOL);
    } finally {
      console.error = error;
    }
    expect(logged).toHaveLength(1);
    localStorage.set(DRAW_TOOL_STORAGE_KEY, 7);
    expect(loadDrawTool(app)).toEqual(DEFAULT_DRAW_TOOL);
    saveDrawTool(app, { ...DEFAULT_DRAW_TOOL, bold: true });
    expect(loadDrawTool(app).bold).toBe(true);
  });
});
