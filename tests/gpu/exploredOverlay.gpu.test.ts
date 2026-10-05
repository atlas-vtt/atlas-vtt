import '../setup/obsidianDom';
import type { EventEmitter } from 'events';
import { Container, EventEmitter as PixiEmitter, RenderTexture, Sprite, Texture, type Application, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { ExploredBrush } from '../../src/app/pixi/lighting/ExploredBrush';
import { LightingRenderer } from '../../src/app/pixi/lighting/LightingRenderer';
import { playerLightingLayers } from '../../src/app/pixi/lighting/playerLightingLayers';
import { captureWithLayerVisibility } from '../../src/app/pixi/playerSafeFrame';
import { SIZE } from '../../src/app/pixi/lighting/__tests__/rendererHarness';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { watchGl, type GlWatch } from '../../src/app/pixi/lighting/engine/__tests__/strictGl';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { createInMemoryApp } from '../mocks/inMemoryVault';

type Pixel = readonly [number, number, number];

interface Bench {
  renderer: WebGLRenderer;
  store: ViewAtlasStore;
  lighting: LightingRenderer;
  brush: ExploredBrush;
  eventBus: PixiEmitter;
  /** The undos (true) and redos (false) of memory edits the GM was told of. */
  announced: boolean[];
  /** The GM's canvas: the map, its lighting and the overlay, one screen pixel per world pixel. */
  canvas: () => (x: number, y: number) => Pixel;
  /** The memory's coverage at a point of the map. */
  redAt: (x: number, y: number) => number;
}

const apart = (a: Pixel, b: Pixel): number => Math.max(...a.map((channel, i) => Math.abs(channel - b[i]!)));
const differs = (a: Pixel, b: Pixel): boolean => apart(a, b) > 6;
/** The same but for the composite's dither, which moves a channel by a level from pixel to pixel. */
const same = (a: Pixel, b: Pixel): boolean => apart(a, b) <= 2;

describe('the explored memory\'s overlay on the GM\'s canvas', () => {
  const cleanup: (() => void)[] = [];
  let watch: GlWatch | null = null;

  afterEach(() => {
    watch?.stop();
    expect(watch?.findings ?? []).toEqual([]);
    watch = null;
    while (cleanup.length) cleanup.pop()!();
  });

  /** A daylit map with the lighting tool in its explored-memory mode. */
  async function bench(mapSize: () => { width: number; height: number } = () => ({ width: SIZE, height: SIZE })): Promise<Bench> {
    const renderer = await createTestRenderer(SIZE);
    watch = watchGl(renderer.gl);
    const store = createViewAtlasStore(createInMemoryApp().app, `memory-overlay-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/overlay.atlasmap' });
    store.getState().setSceneLighting({ enabled: true, ambient: 1 });
    const viewport = new Viewport({ screenWidth: SIZE, screenHeight: SIZE, worldWidth: SIZE, worldHeight: SIZE, events: renderer.events, noTicker: true });
    viewport.sortableChildren = true;
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(SIZE, SIZE);
    floor.tint = 0x808080;
    viewport.addChild(floor);
    const eventBus = new PixiEmitter();
    const bounds = mapSize;
    const edits: { lighting?: LightingRenderer } = {};
    const announced: boolean[] = [];
    const brush = new ExploredBrush({
      viewport,
      canvas: renderer.canvas,
      store,
      eventBus: eventBus as unknown as EventEmitter,
      bounds,
      edit: (edit) => edits.lighting!.editExplored(edit),
      onActiveChange: () => {
        // As the controller's layers follow the mode.
        brush.view.visible = brush.active;
        brush.afterVisibilityChange();
      },
      announce: (undone) => announced.push(undone),
    });
    const lighting = new LightingRenderer({
      viewport,
      app: { renderer, ticker: { add: vi.fn(), remove: vi.fn() } } as unknown as Application,
      store,
      measurement: () => ({ unitDistance: 5 }) as unknown as MeasurementSettings,
      bounds,
      albedo: () => null,
      exploredWatcher: brush,
    });
    edits.lighting = lighting;
    const target = RenderTexture.create({ width: SIZE, height: SIZE });
    cleanup.push(() => {
      brush.destroy();
      if (!lighting.layer.destroyed) lighting.destroy();
      viewport.destroy({ children: true });
      target.destroy(true);
      renderer.destroy();
    });
    eventBus.emit('wall-submode-changed', 'explored-memory');
    return {
      renderer,
      store,
      lighting,
      brush,
      eventBus,
      announced,
      canvas: () => {
        renderer.render({ container: viewport, target, clear: true });
        const pixels = readRgba(renderer, target);
        return (x, y) => [pixels[(y * SIZE + x) * 4]!, pixels[(y * SIZE + x) * 4 + 1]!, pixels[(y * SIZE + x) * 4 + 2]!];
      },
      redAt: (x, y) => {
        const explored = (lighting as unknown as { memory: { texture: { texture: RenderTexture } } }).memory.texture.texture;
        return readRgba(renderer, explored)[(y * explored.width + x) * 4]!;
      },
    };
  }

  it('tints what is explored, faintly, and leaves the rest of the map as it is', async () => {
    const { lighting, brush, canvas } = await bench();
    expect(brush.view.visible).toBe(true);
    const plain = canvas()(200, 128);
    lighting.editExplored({ mode: 'reveal', area: { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE } });
    const at = canvas();
    expect(differs(at(200, 128), plain)).toBe(true);
    expect(same(at(60, 128), plain)).toBe(true);
    // Faint: the map shows through.
    expect(apart(at(200, 128), plain)).toBeLessThan(100);

    brush.view.visible = false;
    expect(canvas()(200, 128)).toEqual(plain);
  });

  it('shows a reveal as it will land while the pointer is down, without touching the memory until the release', async () => {
    const { lighting, brush, canvas, redAt } = await bench();
    lighting.editExplored({ mode: 'reveal', area: { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE } });
    const explored = canvas()(200, 128);
    const plain = canvas()(60, 200);

    brush.pointerDown({ x: 40, y: 60 });
    brush.pointerMove({ x: 100, y: 60 });
    let at = canvas();
    // The stroke looks like the memory it will be.
    expect(same(at(70, 60), explored)).toBe(true);
    expect(at(60, 200)).toEqual(plain);
    expect(redAt(70, 60)).toBe(0);

    // Crossing itself, or running into what is explored already, it is no darker there.
    brush.pointerMove({ x: 40, y: 60 });
    brush.pointerMove({ x: 150, y: 60 });
    at = canvas();
    expect(same(at(70, 60), explored)).toBe(true);
    expect(same(at(140, 60), explored)).toBe(true);

    brush.pointerUp();
    expect(redAt(70, 60)).toBe(255);
    expect(same(canvas()(70, 60), explored)).toBe(true);
  });

  it('previews a brush stroke exactly as it will be stamped: points too close to count add nothing', async () => {
    const { store, brush, canvas, redAt } = await bench();
    const plain = canvas();
    store.getState().setExploredBrush({ brushSize: 100 });
    // The pointer dips 9 px and comes back: closer than a tenth of the brush, so the stroke is one disc around (60, 128).
    brush.pointerDown({ x: 60, y: 128 });
    brush.pointerMove({ x: 60, y: 137 });
    brush.pointerMove({ x: 60, y: 128 });
    const during = canvas();
    brush.pointerUp();
    const after = canvas();
    // 105 px below the centre: within the brush of the dip, outside the disc that is stamped.
    expect(redAt(60, 233)).toBe(0);
    expect(redAt(60, 225)).toBe(255);
    expect(same(during(60, 233), plain(60, 233))).toBe(true);
    expect(differs(during(60, 225), plain(60, 225))).toBe(true);
    // A longer stroke: what was shown while the pointer was down is what the memory then holds.
    for (const [x, y] of [[60, 233], [60, 225], [150, 128], [165, 128], [60, 30], [60, 22]] as const) {
      expect(same(during(x, y), after(x, y)), `at ${x}, ${y}`).toBe(true);
    }
  });

  it('previews a long brush stroke as the memory will hold it, bend for bend', async () => {
    const { store, brush, canvas } = await bench();
    store.getState().setExploredBrush({ brushSize: 60 });
    // A tight zigzag in steps of 5 px, under the 6 px the brush tells apart.
    brush.pointerDown({ x: 40, y: 128 });
    for (let step = 1; step <= 30; step++) brush.pointerMove({ x: 40 + step * 4, y: 128 + (step % 2 ? 3 : -3) });
    const during = canvas();
    brush.pointerUp();
    const after = canvas();
    let unlike = 0;
    for (let y = 0; y < SIZE; y += 2) for (let x = 0; x < SIZE; x += 2) if (apart(during(x, y), after(x, y)) > 12) unlike++;
    // Only texels on the stroke's soft edge may differ between the drawn preview and the stamped memory.
    expect(unlike).toBeLessThan(40);
  });

  it('shows the brush\'s ring at the pointer, and none once the pointer has left the map', async () => {
    const { store, brush, canvas } = await bench();
    const plain = canvas();
    store.getState().setExploredBrush({ brushSize: 40 });
    brush.pointerMove({ x: 128, y: 128 });
    // On the ring, 40 px from the pointer.
    expect(differs(canvas()(168, 128), plain(168, 128))).toBe(true);
    brush.pointerLeft();
    expect(canvas()(168, 128)).toEqual(plain(168, 128));
    brush.pointerMove({ x: 100, y: 128 });
    expect(differs(canvas()(140, 128), plain(140, 128))).toBe(true);
  });

  it('cuts a forget out of the tint while the pointer is down, and leaves no trace when the stroke is dropped', async () => {
    const { store, lighting, brush, canvas, redAt } = await bench();
    const plain = canvas()(200, 128);
    lighting.editExplored({ mode: 'reveal', area: 'everything' });
    const explored = canvas()(200, 128);
    store.getState().setExploredBrush({ mode: 'forget' });
    store.getState().setExploredBrush({ brushSize: 30 });

    brush.pointerDown({ x: 180, y: 128 });
    brush.pointerMove({ x: 220, y: 128 });
    let at = canvas();
    // Where the stroke lies the tint is gone: the map as without the overlay.
    expect(at(200, 128)).toEqual(plain);
    expect(same(at(200, 200), explored)).toBe(true);
    expect(redAt(200, 128)).toBe(255);

    brush.stop();
    at = canvas();
    expect(at(200, 128)).toEqual(explored);
    expect(redAt(200, 128)).toBe(255);

    brush.pointerDown({ x: 180, y: 128 });
    brush.pointerMove({ x: 220, y: 128 });
    brush.pointerUp();
    expect(redAt(200, 128)).toBe(0);
    expect(canvas()(200, 128)).toEqual(plain);
  });

  it('outlines a rectangle and a lasso in the stroke\'s colour, red for a forget, and shows inside them what the memory will hold', async () => {
    const { store, lighting, brush, canvas } = await bench();
    const plain = canvas();
    lighting.editExplored({ mode: 'reveal', area: 'everything' });
    store.getState().setExploredBrush({ mode: 'forget' });
    store.getState().setExploredBrush({ shape: 'rectangle' });
    brush.pointerDown({ x: 160, y: 90 });
    brush.pointerMove({ x: 240, y: 170 });
    let at = canvas();
    // On the outline: red. Inside: the tint is cut away, the map as without the overlay.
    const [r, g, b] = at(200, 90);
    expect(r).toBeGreaterThan(g + 30);
    expect(r).toBeGreaterThan(b + 30);
    expect(at(200, 128)).toEqual(plain(200, 128));
    brush.stop();

    // A lasso that crosses itself (a figure of eight): both loops are cut, the ground between them is not.
    store.getState().setExploredBrush({ shape: 'lasso' });
    brush.pointerDown({ x: 20, y: 20 });
    brush.pointerMove({ x: 100, y: 100 });
    brush.pointerMove({ x: 100, y: 20 });
    brush.pointerMove({ x: 20, y: 100 });
    at = canvas();
    expect(at(40, 60)).toEqual(plain(40, 60));
    expect(at(80, 60)).toEqual(plain(80, 60));
    expect(differs(at(60, 30), plain(60, 30))).toBe(true);
    expect(differs(at(60, 90), plain(60, 90))).toBe(true);
    expect(differs(at(150, 60), plain(150, 60))).toBe(true);
  });

  it('is in no frame captured for the players, whatever the GM is doing with it', async () => {
    const { lighting, brush, canvas } = await bench();
    lighting.editExplored({ mode: 'reveal', area: { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE } });
    brush.pointerDown({ x: 40, y: 60 });
    brush.pointerMove({ x: 100, y: 60 });
    const gm = canvas();

    // What the players' frame hides and shows of the lighting; the overlay is the only GM overlay on this canvas.
    const other = { visible: false };
    const gmOverlays = { wallEditor: other, lightZones: other, exploredMemory: brush.view, doorBadges: other, lightMarkers: other, rangeRings: other, sightAids: other };
    const frames: ReturnType<typeof canvas>[] = [];
    captureWithLayerVisibility(playerLightingLayers({ enabled: true, modeLayer: lighting.modeLayer, gmOverlays }), () => undefined, () => frames.push(canvas()));
    const frame = frames[0]!;
    expect(brush.view.visible).toBe(true);
    expect(lighting.modeLayer.visible).toBe(false);

    // The players' picture of the same canvas, with the overlay taken off by hand.
    brush.view.visible = false;
    lighting.modeLayer.visible = true;
    const players = canvas();
    lighting.modeLayer.visible = false;
    brush.view.visible = true;
    for (const [x, y] of [[200, 128], [70, 60], [60, 200], [140, 60]] as const) {
      expect(frame(x, y)).toEqual(players(x, y));
    }
    // And on the GM's own canvas the tint and the stroke are back.
    expect(canvas()(70, 60)).toEqual(gm(70, 60));
    expect(differs(gm(200, 128), frame(200, 128))).toBe(true);
  });

  it('shows an undo and a redo on the overlay, and tells the GM of them only while the overlay is hidden', async () => {
    const { store, lighting, brush, announced, canvas } = await bench();
    const history = getHistoryStore(store)!;
    const plain = canvas()(200, 128);
    lighting.editExplored({ mode: 'reveal', area: 'everything' });
    const explored = canvas()(200, 128);
    history.getState().undo();
    expect(canvas()(200, 128)).toEqual(plain);
    history.getState().redo();
    expect(canvas()(200, 128)).toEqual(explored);
    expect(announced).toEqual([]);

    // Another tool, or the players' view: the canvas shows nothing of the memory.
    brush.view.visible = false;
    brush.afterVisibilityChange();
    history.getState().undo();
    history.getState().redo();
    expect(announced).toEqual([true, false]);
  });

  it('follows the memory when its texture is replaced, and lets go of it when the lighting view goes', async () => {
    let size = { width: SIZE, height: SIZE };
    const { lighting, brush, canvas } = await bench(() => size);
    const plain = canvas();
    lighting.editExplored({ mode: 'reveal', area: { type: 'rectangle', x: 128, y: 0, width: 128, height: SIZE } });
    expect(differs(canvas()(200, 128), plain(200, 128))).toBe(true);
    const first = (lighting as unknown as { memory: { texture: { texture: RenderTexture } } }).memory.texture.texture;

    // The map's image is replaced by one half as wide: the memory gets a texture of that size, blank.
    size = { width: SIZE / 2, height: SIZE };
    lighting.refreshBounds();
    expect(first.destroyed).toBe(true);
    // The overlay draws the new texture, not the one that was destroyed: nothing is explored on it.
    const blank = canvas();
    expect(same(blank(100, 128), plain(100, 128))).toBe(true);
    // And it lies over the new map: its right half is the new texture's right half, and nothing of it lies beyond the map.
    lighting.editExplored({ mode: 'reveal', area: { type: 'rectangle', x: 64, y: 0, width: 64, height: SIZE } });
    let at = canvas();
    expect(differs(at(100, 128), blank(100, 128))).toBe(true);
    expect(at(30, 128)).toEqual(blank(30, 128));
    expect(at(200, 128)).toEqual(blank(200, 128));

    // The lighting view goes (the Canvas fallback takes its place, or the map view closes): the
    // overlay holds none of its textures, and the GM's canvas still renders.
    lighting.destroy();
    expect(brush.view.visible).toBe(true);
    at = canvas();
    expect(at(100, 128)).toEqual(at(30, 128));
  });
});
