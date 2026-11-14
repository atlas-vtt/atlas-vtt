// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Point, Texture, type Container, type EventSystem, type FederatedPointerEvent } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { EventEmitter } from 'events';
import { PinRenderer } from '../../../src/app/pixi/PinRenderer';
import { NotePinTool } from '../../../src/app/tools/NotePinTool';
import { MapService } from '../../../src/app/services/MapService';
import type { RendererService } from '../../../src/app/services/RendererService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { captureSceneFrame } from '../../../src/app/pixi/sceneFrameCapture';
import { captureWithLayerVisibility } from '../../../src/app/pixi/playerSafeFrame';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { showNotice } from '../../../src/app/ui/notice';
import type { NotePin } from '../../../src/app/types';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { fakeMapRenderer } from '../../helpers/fakeMapRenderer';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));
// jsdom has no 2D canvas, so pin glyphs cannot be rasterised here.
vi.mock('../../../src/app/pixi/utils/pinIconTexture', () => ({ createPinIconTexture: vi.fn(() => new Texture()) }));

const WORLD = 'maps/world.atlasmap';
const TOWN = 'maps/town.atlasmap';
const LEVELS = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];
const OTHER_TOOLS = ['move', 'select', 'measure', 'fog', 'draw-pen', 'text'] as const;

function sceneFile(mapPath: string, levels?: typeof LEVELS): string {
  const version = levels ? 5 : 4;
  return JSON.stringify({
    version,
    state: {
      schema: 'atlas-vtt', version, mapPath, background: 'maps/ground.png',
      grid: { enabled: true, visible: true, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 },
      objects: { tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
      camera: { x: 0, y: 0, scale: 1 },
      ...(levels && { levels }),
    },
  });
}

/**
 * A GM pins a world map through the tool itself, with everything a session does in between:
 * other tools, a picker left open, thumbnails and players' frames, undo, other levels and scenes,
 * the players' view, a zoom out. After every step each pin the view shows is drawn and answers
 * the pointer, and the file holds what the store holds.
 */
describe('Placing many note pins', () => {
  let store: ViewAtlasStore;
  let viewport: Viewport;
  let eventBus: EventEmitter;
  let renderer: PinRenderer;
  let tool: NotePinTool;
  let service: MapService;
  let rendererService: RendererService;
  let files: Map<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    Element.prototype.scrollIntoView = vi.fn();
    const notes = Object.fromEntries(Array.from({ length: 60 }, (_, index) => [`Places/Place ${index}.md`, '']));
    const vault = createInMemoryApp({ files: { [WORLD]: sceneFile(WORLD, LEVELS), [TOWN]: sceneFile(TOWN), 'maps/ground.png': '', 'maps/upper.png': '', ...notes } });
    const { app } = vault;
    files = vault.files;
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    app.vault.getFolderByPath = app.vault.getAbstractFileByPath;
    Object.assign(app.vault, { getAllLoadedFiles: () => app.vault.getFiles() });

    store = createViewAtlasStore(app, 'pin-placement-view');
    eventBus = new EventEmitter();
    eventBus.on('wait-for-tokens-loaded', (done: () => void) => done());
    const map = fakeMapRenderer();
    rendererService = { getRenderer: () => map } as unknown as RendererService;
    service = new MapService(app, eventBus, store);
    const events = { domElement: document.createElement('canvas') } as unknown as EventSystem;
    viewport = new Viewport({ screenWidth: 1400, screenHeight: 1400, worldWidth: 1400, worldHeight: 1400, events });
    renderer = new PinRenderer(viewport, eventBus, store);
    renderer.setMapSize(() => ({ width: 1400, height: 1400 }));
    tool = new NotePinTool(eventBus, app, store);
  });

  afterEach(() => {
    tool.destroy();
    renderer.destroy();
    viewport.destroy();
    document.body.empty();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const picker = (): HTMLElement | null => document.getElementById('atlas-note-pin-dropdown');
  const shownPins = (): Record<string, NotePin> => levelObjects(store.getState()).pins;
  const drawn = (): Container[] => renderer.getPinContainer().children.filter((child) => child.label.startsWith('pin-'));
  const settle = (): Promise<void> => vi.advanceTimersByTimeAsync(200);

  async function open(path: string, level?: string): Promise<void> {
    expect(await service.loadMap(rendererService, path, { centerX: 700, centerY: 700, scale: viewport.scale.x }, level)).not.toBeNull();
    await settle();
  }

  async function save(): Promise<void> {
    await vi.advanceTimersByTimeAsync(600);
    await store.flushStorage();
  }

  /** Presses the map at a world point, as the viewport hears it from PIXI. */
  function press(worldX: number, worldY: number): void {
    const { x, y } = viewport.toScreen(worldX, worldY);
    viewport.emit('pointerdown', { button: 0, ctrlKey: false, shiftKey: false, pointerId: 1, global: new Point(x, y) } as unknown as FederatedPointerEvent);
  }

  /** Places a pin with the tool: a press, then the note picked in the picker that opens. */
  async function place(worldX: number, worldY: number, note: number): Promise<void> {
    press(worldX, worldY);
    const search = picker()?.querySelector<HTMLInputElement>('.pin-search-input');
    expect(search, `the picker for pin ${note}`).toBeTruthy();
    search!.value = `Place ${note}`;
    search!.dispatchEvent(new Event('input'));
    search!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle();
  }

  /** Every pin the view shows is drawn once, where it stands, and answers the pointer there; no other is. */
  function expectPinsShown(step: string): void {
    const pins = shownPins();
    expect(drawn().map((group) => group.label).sort(), step).toEqual(Object.keys(pins).map((id) => `pin-${id}`).sort());
    expect(renderer.getPinContainer().visible, step).toBe(true);
    for (const group of drawn()) {
      const pin = pins[group.label.slice('pin-'.length)]!;
      expect(group.destroyed || !group.visible || group.children.length === 0, `${step}: ${pin.notePath} is drawn`).toBe(false);
      expect(group.scale.x > 0 && Number.isFinite(group.scale.x), `${step}: ${pin.notePath} has a size`).toBe(true);
      expect({ x: group.position.x, y: group.position.y }, step).toEqual({ x: pin.x, y: pin.y });
      expect(renderer.hitTestPins(pin.x, pin.y), `${step}: ${pin.notePath} answers the pointer`).toBe(pin.id);
    }
    const everyPin = Object.values(store.getState().objects.pins);
    for (const pin of everyPin.filter((other) => !(other.id in pins))) expect(renderer.hitTestPins(pin.x, pin.y), step).toBeNull();
  }

  function savedPins(path: string): string[] {
    const saved = JSON.parse(files.get(path) ?? '{}') as { state: { objects: { pins: Record<string, unknown> } } };
    return Object.keys(saved.state.objects.pins).sort();
  }

  it('draws every pin and lets each be pressed, whatever happened between two placements', async () => {
    await open(WORLD, 'ground');
    store.getState().setActiveTool('note-pin');
    let note = 0;
    let upperPins = 0;

    for (let index = 0; index < 36; index++) {
      const step = `pin ${index}`;
      const at = { x: 100 + (index % 6) * 200, y: 100 + Math.floor(index / 6) * 200 };
      // Other tools between two pins, once with the picker still open
      if (index % 4 === 3) {
        press(at.x + 60, at.y + 60);
        expect(picker(), step).not.toBeNull();
      }
      store.getState().setActiveTool(OTHER_TOOLS[index % OTHER_TOOLS.length]!);
      expect(picker(), step).toBeNull();
      store.getState().setActiveTool('note-pin');
      await settle();

      await place(at.x, at.y, note++);
      expect(Object.keys(shownPins()), step).toHaveLength(index + 1);
      expectPinsShown(step);

      if (index % 5 === 4) {
        // A thumbnail shows no pin and puts them back, also when its render fails
        const parts = { gmViewLayers: [], markerLayers: renderer.pictureLayers(), lighting: undefined };
        captureSceneFrame(parts, { x: 0, y: 0, resolution: 1 }, () => expect(renderer.getPinContainer().visible).toBe(false));
        expect(() => captureSceneFrame(parts, { x: 0, y: 0, resolution: 1 }, () => { throw new Error('lost context'); })).toThrow('lost context');
        captureWithLayerVisibility(renderer.playerLayers(), () => undefined, () => expect(renderer.getPinContainer().visible).toBe(false));
        expectPinsShown(`${step}, after pictures`);
      }
      if (index % 7 === 6) {
        store.temporal.getState().undo();
        expect(Object.keys(shownPins()), step).toHaveLength(index);
        expectPinsShown(`${step}, undone`);
        store.temporal.getState().redo();
        expectPinsShown(`${step}, redone`);
      }
      if (index % 8 === 7) {
        store.getState().setViewedLevel('upper');
        expectPinsShown(`${step}, upstairs`);
        await place(150 + upperPins * 200, 150, note++);
        upperPins += 1;
        expect(Object.keys(shownPins()), step).toHaveLength(upperPins);
        expectPinsShown(`${step}, pinned upstairs`);
        store.getState().setViewedLevel('ground');
        expectPinsShown(`${step}, downstairs again`);
      }
      if (index % 9 === 8) {
        await open(TOWN);
        store.getState().setActiveTool('note-pin');
        expectPinsShown(`${step}, in town`);
        await place(300 + index * 20, 900, note++);
        expectPinsShown(`${step}, pinned in town`);
        await open(WORLD, 'ground');
        store.getState().setActiveTool('note-pin');
        expect(Object.keys(shownPins()), step).toHaveLength(index + 1);
        expectPinsShown(`${step}, back on the world map`);
      }
      if (index % 10 === 9) {
        // The players' view shows no pin: none answers the pointer and none is placed
        store.getState().setGMView(false);
        expect(renderer.getPinContainer().visible, step).toBe(false);
        expect(renderer.hitTestPins(at.x, at.y), step).toBeNull();
        press(at.x + 60, at.y + 60);
        expect(picker(), step).toBeNull();
        store.getState().setGMView(true);
        expectPinsShown(`${step}, GM view again`);
      }
      if (index === 20) {
        // Zoomed out, pins are dots, which are still drawn and pressed
        viewport.setZoom(0.2, true);
        viewport.emit('zoomed', { viewport, type: 'wheel' });
        expectPinsShown(`${step}, zoomed out`);
      }
    }

    expect(showNotice).toHaveBeenCalledTimes(3);
    await save();
    expect(savedPins(WORLD)).toEqual(Object.keys(store.getState().objects.pins).sort());
    expect(savedPins(WORLD)).toHaveLength(36 + upperPins);
    expect(savedPins(TOWN)).toHaveLength(4);

    await open(WORLD, 'upper');
    expect(Object.keys(shownPins())).toHaveLength(upperPins);
    expectPinsShown('opened again upstairs');
  });
});
