import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { Texture, type EventSystem } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { TFile } from 'obsidian';
import { axialToPixel, createHexLayout } from '../../src/app/grid/hexGeometry';
import { hexLayoutOfGrid, hexLinkAt, linkedHexOf } from '../../src/app/grid/hexLinks';
import { HexLinkRenderer } from '../../src/app/pixi/hexLinks/HexLinkRenderer';
import { PinRenderer } from '../../src/app/pixi/PinRenderer';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { GridState } from '../../src/app/types/gridTypes';
import type { NotePin } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../src/app/pixi/utils/pinIconTexture', () => ({
  createPinIconTexture: vi.fn(() => new Texture()),
}));

const HEX_GRID: GridState = { enabled: true, type: 'hex-horizontal', size: 100, offsetX: 0, offsetY: 0, opacity: 0.7 };
const layout = createHexLayout('hex-horizontal', 100, 0, 0);

const linkedPin = (id: string, x: number, y: number): NotePin => ({ id, kind: 'pin', x, y, notePath: `${id}.md`, hex: true });

describe('hex link geometry', () => {
  it('has a hex layout only on hex grids', () => {
    expect(hexLayoutOfGrid(HEX_GRID)).toEqual(layout);
    expect(hexLayoutOfGrid({ ...HEX_GRID, type: 'square' })).toBeNull();
    expect(hexLayoutOfGrid(null)).toBeNull();
  });

  it('finds the linked pin anywhere inside its hex, and only linked pins', () => {
    const center = axialToPixel(layout, { q: 2, r: 1 });
    const pins = {
      linked: linkedPin('linked', center.x, center.y),
      plain: { id: 'plain', kind: 'pin' as const, x: 500, y: 500, notePath: 'plain.md' },
    };
    expect(hexLinkAt(pins, layout, { x: center.x + 30, y: center.y - 30 })?.id).toBe('linked');
    expect(hexLinkAt(pins, layout, { x: center.x + 100, y: center.y })).toBeNull();
    expect(hexLinkAt(pins, layout, { x: 500, y: 500 })).toBeNull();
  });

  it('keeps a link on the same part of the map when the grid is nudged', () => {
    const center = axialToPixel(layout, { q: 3, r: 2 });
    const nudged = createHexLayout('hex-horizontal', 100, 12, -9);
    const hex = linkedHexOf(linkedPin('keep', center.x, center.y), nudged);
    const nudgedCenter = axialToPixel(nudged, hex);
    expect(Math.hypot(nudgedCenter.x - center.x, nudgedCenter.y - center.y)).toBeLessThan(20);
  });
});

describe('linked hexes on the canvas', () => {
  const cleanups: Array<() => void> = [];
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
  });

  function setup(): { store: ReturnType<typeof createViewAtlasStore>; viewport: Viewport; eventBus: EventEmitter } {
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    const viewport = new Viewport({ screenWidth: 800, screenHeight: 600, events });
    const { app } = createInMemoryApp({ files: { 'notes/Keep.md': '# Keep' } });
    Object.assign(app.vault, { getAllLoadedFiles: () => [new TFile('notes/Keep.md')] });
    const store = createViewAtlasStore(app, 'hex-link-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath('maps/hexcrawl.atlasmap');
    store.getState().setGrid(HEX_GRID);
    const eventBus = new EventEmitter();
    const tool = new NotePinTool(eventBus, app, store);
    cleanups.push(() => {
      tool.destroy();
      viewport.destroy();
    });
    return { store, viewport, eventBus };
  }

  it('centres a linked note\'s pin in its hex and lets the hex take the pointer; on square grids it is a plain pin', () => {
    const { store, viewport, eventBus } = setup();
    const pins = new PinRenderer(viewport, eventBus, store);
    const hexes = new HexLinkRenderer({ viewport, store, eventBus, getMapRect: () => ({ x: 0, y: 0, width: 1000, height: 1000 }) });
    cleanups.push(() => {
      pins.destroy();
      hexes.destroy();
    });
    const center = axialToPixel(layout, { q: 1, r: 1 });
    // Linked from a point off the hex centre
    const id = store.getState().addNotePin(center.x + 20, center.y - 15, 'notes/Keep.md', 'castle', { hex: true });
    const badge = (): { x: number; y: number } => pins.getPinContainer().getChildByLabel(`pin-${id}`)!.position;

    expect(badge()).toMatchObject({ x: center.x, y: center.y });
    expect(pins.hitTestPins(center.x, center.y)).toBeNull();
    expect(hexes.hitTest(center.x + 35, center.y + 20)).toBe(id);
    expect(hexes.numberOf({ q: 1, r: 1 })).toBe('0202');

    store.getState().setGrid({ ...HEX_GRID, type: 'square' });
    expect(badge()).toMatchObject({ x: center.x + 20, y: center.y - 15 });
    expect(pins.hitTestPins(center.x + 20, center.y - 15)).toBe(id);
    expect(hexes.hitTest(center.x, center.y)).toBeNull();
  });

  it('hides linked hexes from the player perspective', () => {
    const { store, viewport, eventBus } = setup();
    const hexes = new HexLinkRenderer({ viewport, store, eventBus, getMapRect: () => null });
    cleanups.push(() => hexes.destroy());
    const id = store.getState().addNotePin(100, 100, 'notes/Keep.md', 'pin', { hex: true });
    expect(hexes.hitTest(100, 100)).toBe(id);

    store.getState().setGMView(false);
    expect(hexes.hitTest(100, 100)).toBeNull();
    expect(hexes.container.visible).toBe(false);
  });

  it('links the picked note to the Shift-clicked hex', async () => {
    const { store, eventBus } = setup();
    store.getState().setActiveTool('note-pin');

    eventBus.emit('canvas-click', { x: 0, y: 0, worldX: 150, worldY: 190, shiftKey: true });
    await Promise.resolve();
    pickFirstNote();
    await settle();

    const [pin] = Object.values(store.getState().objects.pins);
    const center = axialToPixel(layout, { q: 1, r: 1 });
    expect(pin).toMatchObject({ notePath: 'notes/Keep.md', hex: true });
    expect(pin!.x).toBeCloseTo(center.x);
    expect(pin!.y).toBeCloseTo(center.y);
  });

  it('changes the note of an already linked hex instead of adding a second link', async () => {
    const { store, eventBus } = setup();
    store.getState().setActiveTool('note-pin');
    const center = axialToPixel(layout, { q: 1, r: 1 });
    const id = store.getState().addNotePin(center.x, center.y, 'notes/Old.md', 'pin', { hex: true });

    eventBus.emit('canvas-click', { x: 0, y: 0, worldX: center.x + 20, worldY: center.y, shiftKey: true });
    await Promise.resolve();
    pickFirstNote();
    await settle();

    expect(Object.keys(store.getState().objects.pins)).toEqual([id]);
    expect(store.getState().objects.pins[id]?.notePath).toBe('notes/Keep.md');
  });

  it('previews the pin in the centre of the hex while Shift is held', () => {
    const { store, eventBus } = setup();
    store.getState().setActiveTool('note-pin');
    const previews: Array<{ x: number; y: number }> = [];
    eventBus.on('pin-preview-update', (preview: { x: number; y: number }) => previews.push(preview));

    eventBus.emit('viewport-pointer-move', { worldX: 150, worldY: 190, shiftKey: true });
    const center = axialToPixel(layout, { q: 1, r: 1 });
    expect(previews.at(-1)).toMatchObject({ x: center.x, y: center.y });

    eventBus.emit('viewport-pointer-move', { worldX: 150, worldY: 190, shiftKey: false });
    expect(previews.at(-1)).toMatchObject({ x: 150, y: 190 });
  });

  it('pins to the point without Shift', async () => {
    const { store, eventBus } = setup();
    store.getState().setActiveTool('note-pin');

    eventBus.emit('canvas-click', { x: 0, y: 0, worldX: 150, worldY: 190, shiftKey: false });
    await Promise.resolve();
    pickFirstNote();
    await settle();

    expect(Object.values(store.getState().objects.pins)).toEqual([
      expect.objectContaining({ x: 150, y: 190, notePath: 'notes/Keep.md' }),
    ]);
    expect(Object.values(store.getState().objects.pins)[0]?.hex).toBeUndefined();
  });
});

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function pickFirstNote(): void {
  const search = document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input');
  expect(search).not.toBeNull();
  search!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}
