import '../setup/obsidianDom';
import { RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it } from 'vitest';
import { LevelLinkEditor } from '../../src/app/pixi/levelLinks/LevelLinkEditor';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { LevelLinkFlight, SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SIZE = 256;
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];
/** Stairs from the ground floor up, over the left half of the map. */
const AREA = [{ x: 40, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 200 }, { x: 40, y: 200 }];

type Pixel = readonly [number, number, number];
const apart = (a: Pixel, b: Pixel): number => Math.max(...a.map((channel, i) => Math.abs(channel - b[i]!)));

interface Bench {
  store: ViewAtlasStore;
  editor: LevelLinkEditor;
  /** The GM's canvas, one screen pixel per world pixel; with `players`, as a players' frame takes it. */
  canvas: (players?: boolean) => (x: number, y: number) => Pixel;
}

describe('stairs on the GM\'s canvas', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => {
    while (cleanup.length) cleanup.pop()!();
  });

  async function bench(flight?: LevelLinkFlight): Promise<Bench> {
    const renderer: WebGLRenderer = await createTestRenderer(SIZE);
    const store = createViewAtlasStore(createInMemoryApp().app, `stairs-overlay-${Math.random()}`);
    store.setState({
      persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground',
      objects: { ...store.getState().objects, levelLinks: { stairs: { id: 'stairs', kind: 'level-link', polygon: AREA, levels: ['ground', 'upper'], ...(flight && { flight }) } } },
    });
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: renderer.events, noTicker: true });
    viewport.sortableChildren = true;
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(SIZE, SIZE);
    floor.tint = 0x808080;
    viewport.addChild(floor);
    const editor = new LevelLinkEditor({ viewport, canvas: renderer.canvas, store, onFull: () => undefined });
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanup.push(() => {
      editor.destroy();
      viewport.destroy({ children: true });
      target.destroy(true);
      renderer.destroy();
    });
    const read = (): ((x: number, y: number) => Pixel) => {
      renderer.render({ container: viewport, target, clear: true });
      const pixels = readRgba(renderer, target);
      return (x, y) => [pixels[(y * SIZE + x) * 4]!, pixels[(y * SIZE + x) * 4 + 1]!, pixels[(y * SIZE + x) * 4 + 2]!];
    };
    return {
      store,
      editor,
      canvas: (players = false) => {
        if (!players) return read();
        let pixels!: (x: number, y: number) => Pixel;
        // The players' frame hides the GM's markers, stairs among them, for its render.
        captureWithLayerVisibility([{ layer: editor.view, visible: false }], () => undefined, () => { pixels = read(); });
        return pixels;
      },
    };
  }

  it('shows the stairs of the level shown at rest: their outline and badge, and nothing else of the map', async () => {
    const { canvas } = await bench();
    const at = canvas();
    const plain = at(200, 128);
    expect(apart(at(40, 120), plain)).toBeGreaterThan(20);
    expect(apart(at(80, 120), plain)).toBeGreaterThan(20);
    expect(apart(at(70, 80), plain)).toBe(0);
    expect(apart(at(200, 60), plain)).toBe(0);
  });

  it('draws nothing on a level the stairs do not stand on, in the players\' frame, or in the players\' view', async () => {
    const { store, canvas } = await bench();
    const plain = canvas()(200, 128);
    expect(apart(canvas(true)(40, 120), plain)).toBe(0);
    store.getState().setViewedLevel('roof');
    expect(apart(canvas()(40, 120), plain)).toBe(0);
    store.getState().setViewedLevel('upper');
    expect(apart(canvas()(40, 120), plain)).toBeGreaterThan(20);
    store.getState().setGMView(false);
    expect(apart(canvas()(40, 120), plain)).toBe(0);
  });

  it('shows walked stairs\' far row faintly and a chevron on the end they are stepped on, from each level, never to players', async () => {
    // The foot is the bottom edge (y 200), two rows: downstairs the far row is y 40 to 120, upstairs y 120 to 200.
    const { store, canvas } = await bench({ foot: 2, rows: 2 });
    const plain = canvas()(200, 128);
    const ground = canvas();
    const band = apart(ground(55, 60), plain);
    expect(band).toBeGreaterThan(4);
    expect(band).toBeLessThan(60);
    expect(apart(ground(55, 160), plain)).toBe(0);
    const chevron = (at: (x: number, y: number) => Pixel, y: number): number => Math.max(...[-2, -1, 0, 1, 2].flatMap((dy) => [-1, 0, 1].map((dx) => apart(at(80 + dx, y + dy), plain))));
    expect(chevron(ground, 190)).toBeGreaterThan(20);
    expect(chevron(ground, 50)).toBeLessThan(band + 3);
    expect(apart(canvas(true)(55, 60), plain)).toBe(0);

    store.getState().setViewedLevel('upper');
    const upper = canvas();
    expect(apart(upper(55, 160), plain)).toBeGreaterThan(4);
    expect(apart(upper(55, 60), plain)).toBe(0);
    expect(chevron(upper, 50)).toBeGreaterThan(20);
    expect(chevron(upper, 190)).toBeLessThan(band + 3);
  });

  it('shows the corners with the stairs tool, and the area drawn so far', async () => {
    const { store, editor, canvas } = await bench();
    const resting = canvas();
    store.getState().setActiveTool('stairs');
    const editing = canvas();
    // The corner handle is a disc in the badge's colour over the corner, where at rest the outlines cross.
    expect(apart(editing(40, 40), resting(40, 40))).toBeGreaterThan(20);
    editor.pointerDown({ x: 160, y: 60 }, { altKey: true });
    editor.pointerDown({ x: 220, y: 60 }, { altKey: true });
    expect(apart(canvas()(190, 60), resting(190, 60))).toBeGreaterThan(20);
    editor.handleEscape();
    expect(apart(canvas()(190, 60), resting(190, 60))).toBe(0);
  });
});
