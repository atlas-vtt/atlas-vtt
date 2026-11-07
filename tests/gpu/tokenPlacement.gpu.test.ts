import '../setup/obsidianDom';
import { Application, CanvasSource, FederatedPointerEvent, Graphics, Sprite, Texture, Ticker, type WebGLRenderer } from 'pixi.js';
import { Viewport } from 'pixi-viewport';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestRenderer } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { TokenPlacer } from '../../src/app/pixi/tokenPlacement/TokenPlacer';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createHexLayout, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import { snapTokenCenter } from '../../src/app/grid/gridPlacement';
import type { GridSystem, GridType } from '../../src/app/grid/GridSystem';
import type { TokenEntity } from '../../src/app/types';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const WIDTH = 900;
const HEIGHT = 600;
const CELL = 70;
const COLOURS = ['#c0392b', '#2e86c1', '#27ae60', '#8e44ad', '#d35400', '#16a085'];

/** A grid with the methods placement reads, snapping as `GridSystem` does. */
function fakeGrid(type: GridType): GridSystem {
  const options = { type, size: CELL, offsetX: 0, offsetY: 0, enabled: true };
  const cellCentre = (x: number, y: number): { x: number; y: number } => type === 'square'
    ? { x: Math.floor(x / CELL) * CELL + CELL / 2, y: Math.floor(y / CELL) * CELL + CELL / 2 }
    : nearestHexCenter(createHexLayout(type, CELL, 0, 0), { x, y });
  return {
    getOptions: () => options,
    snapToCellCenter: cellCentre,
    snapTokenCenter: (x: number, y: number, size: number) => snapTokenCenter({ x, y }, size, type, CELL, (p) => cellCentre(p.x, p.y)),
  } as unknown as GridSystem;
}

/** Token art: a coloured disc with a lighter middle, so ghosts read as tokens. */
function art(colour: string): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(54, 50, 6, 64, 64, 64);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.5, colour);
  gradient.addColorStop(1, '#111111');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  // A point at the top, so the way the art faces shows
  context.fillStyle = '#ffffff';
  context.beginPath();
  context.moveTo(64, 6);
  context.lineTo(80, 40);
  context.lineTo(48, 40);
  context.fill();
  return new Texture({ source: new CanvasSource({ resource: canvas }) });
}

interface Bench {
  renderer: WebGLRenderer;
  viewport: Viewport;
  store: ViewAtlasStore;
  placer: TokenPlacer;
  canvas: HTMLCanvasElement;
  /** Moves the clock on by `ms` in frames. */
  run(ms: number): void;
  move(x: number, y: number, shift?: boolean): void;
  press(x: number, y: number, shift?: boolean): void;
  down(x: number, y: number, shift?: boolean): void;
  drag(x: number, y: number): void;
  up(x: number, y: number): void;
  wheel(deltaY: number): void;
  shot(name: string): Promise<void>;
}

describe('placing spawned tokens by hand', () => {
  const cleanup: (() => void)[] = [];
  afterEach(() => { while (cleanup.length) cleanup.pop()!(); });

  async function bench(type: GridType = 'square'): Promise<Bench> {
    await page.viewport(WIDTH + 40, HEIGHT + 40);
    document.body.style.setProperty('--interactive-accent', '#e0a84a');
    const renderer = await createTestRenderer(WIDTH);
    renderer.resize(WIDTH, HEIGHT);
    const canvas = renderer.canvas;
    const host = document.createElement('div');
    host.append(canvas);
    document.body.append(host);
    const app = new Application();
    app.renderer = renderer;
    const ticker = new Ticker();
    ticker.autoStart = false;
    ticker.stop();
    app.ticker = ticker;
    const viewport = new Viewport({ screenWidth: WIDTH, screenHeight: HEIGHT, worldWidth: WIDTH, worldHeight: HEIGHT, events: renderer.events, noTicker: true });
    viewport.sortableChildren = true;
    app.stage.addChild(viewport);
    const floor = new Sprite(Texture.WHITE);
    floor.setSize(WIDTH, HEIGHT);
    floor.tint = 0x3b4a3a;
    viewport.addChild(floor);
    const grid = fakeGrid(type);
    const lines = new Graphics();
    if (type === 'square') {
      for (let x = 0; x <= WIDTH; x += CELL) lines.moveTo(x, 0).lineTo(x, HEIGHT);
      for (let y = 0; y <= HEIGHT; y += CELL) lines.moveTo(0, y).lineTo(WIDTH, y);
    } else {
      const layout = createHexLayout(type, CELL, 0, 0);
      const { hexVertices } = await import('../../src/app/grid/hexGeometry');
      const seen = new Set<string>();
      for (let y = 0; y < HEIGHT + CELL; y += CELL / 3) {
        for (let x = 0; x < WIDTH + CELL; x += CELL / 3) {
          const centre = nearestHexCenter(layout, { x, y });
          const key = `${Math.round(centre.x)},${Math.round(centre.y)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          lines.poly(hexVertices(layout, centre).flatMap((p) => [p.x, p.y]), true);
        }
      }
    }
    lines.stroke({ color: 0x000000, alpha: 0.35, width: 1 });
    viewport.addChild(lines);

    const store = createViewAtlasStore(createInMemoryApp().app, `placement-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: 'maps/placement.atlasmap', isMapLoading: false });
    const factory = new SpriteFactory(grid);
    const placer = new TokenPlacer({
      app, viewport, canvas, viewId: 'placement', settings: () => undefined, store, grid: () => grid,
      previewToken: async (token) => {
        const group = await factory.createTokenSprite({ ...token, id: 'preview', kind: 'token' } as TokenEntity, art(token.ringColor ?? '#888888'));
        return { group, diameter: group.tokenSize, rotate: (degrees) => factory.updateTokenRotation(group, degrees), release: () => factory.destroyTokenSprite(group) };
      },
    });
    let now = 0;
    const event = (x: number, y: number, shift: boolean): FederatedPointerEvent => {
      const pointer = new FederatedPointerEvent(renderer.events.rootBoundary);
      pointer.global.set(x, y);
      pointer.shiftKey = shift;
      pointer.button = 0;
      return pointer;
    };
    const bench: Bench = {
      renderer, viewport, store, placer, canvas,
      run: (ms) => {
        for (let t = 0; t < ms; t += 1000 / 60) ticker.update((now += 1000 / 60));
      },
      move: (x, y, shift = false) => { viewport.emit('pointermove', event(x, y, shift)); },
      press: (x, y, shift = false) => {
        bench.down(x, y, shift);
        bench.up(x, y);
      },
      down: (x, y, shift = false) => {
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: rect.left + x, clientY: rect.top + y, button: 0, shiftKey: shift, bubbles: true, cancelable: true }));
      },
      drag: (x, y) => {
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + x, clientY: rect.top + y, buttons: 1, bubbles: true }));
      },
      up: (x, y) => {
        const rect = canvas.getBoundingClientRect();
        canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: rect.left + x, clientY: rect.top + y, button: 0, bubbles: true }));
      },
      wheel: (deltaY) => { canvas.dispatchEvent(new WheelEvent('wheel', { deltaY, shiftKey: true, bubbles: true, cancelable: true })); },
      shot: async (name) => {
        renderer.render(app.stage);
        const copy = renderer.extract.canvas(app.stage) as HTMLCanvasElement;
        copy.style.display = 'block';
        document.body.append(copy);
        await page.screenshot({ path: `__screenshots__/token-placement-${name}.png`, element: copy });
        copy.remove();
      },
    };
    cleanup.push(() => {
      placer.destroy();
      app.stage.destroy({ children: true });
      renderer.destroy();
      host.remove();
    });
    return bench;
  }

  const tokens = (count: number, size = 1): TokenInput[] => Array.from({ length: count }, (_, i) => ({
    imagePath: `tokens/t${i}.png`, ringColor: COLOURS[i % COLOURS.length]!, size, x: 315 + (i % 3) * CELL * size * 2, y: 245 + Math.floor(i / 3) * CELL * size * 2,
  }));

  const commitTo = (store: ViewAtlasStore) => (placed: TokenInput[]): string[] => store.getState().addTokens(placed);

  it('holds one token at the pointer over the cell it would land in, and places it with a click', async () => {
    const { store, placer, run, move, press, shot } = await bench();
    const placing = placer.place({ tokens: tokens(1), commit: commitTo(store) });
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    move(200, 180);
    run(400);
    expect(Object.keys(store.getState().objects.tokens)).toHaveLength(0);
    await shot('single');
    press(200, 180);
    run(90);
    await shot('single-landing');
    expect(await placing).toHaveLength(1);
    expect(Object.values(store.getState().objects.tokens).map(({ x, y }) => [x, y])).toEqual([[175, 175]]);
    run(800);
    await shot('single-landed');
  });

  it('lays several tokens out as a formation, then queues them while Shift is held', async () => {
    const { store, placer, run, move, press, shot } = await bench();
    const placing = placer.place({ tokens: tokens(6), commit: commitTo(store) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    move(450, 300);
    run(500);
    await shot('formation');
    move(450, 300, true);
    run(120);
    await shot('to-queue-mid');
    run(600);
    await shot('queue');
    press(300, 230, true);
    run(150);
    await shot('queue-after-one');
    expect(Object.keys(store.getState().objects.tokens)).toHaveLength(1);
    move(560, 300, false);
    run(600);
    await shot('formation-of-rest');
    press(560, 300);
    run(100);
    await shot('formation-landing');
    expect(await placing).toHaveLength(6);
    const places = Object.values(store.getState().objects.tokens).map(({ x, y }) => `${x},${y}`);
    expect(new Set(places).size).toBe(6);
  });

  it('turns a token while the button is held, and cycles the queue with Shift and the wheel', async () => {
    const { store, placer, run, move, down, drag, up, wheel, shot } = await bench();
    const placing = placer.place({ tokens: tokens(4), commit: commitTo(store) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    move(300, 300, true);
    run(500);
    wheel(100);
    run(150);
    await shot('cycle-mid');
    run(500);
    await shot('cycled');
    down(300, 300, true);
    drag(420, 330);
    run(20);
    await shot('turning-start');
    run(280);
    await shot('turning');
    up(420, 330);
    run(100);
    const [first] = Object.values(store.getState().objects.tokens);
    expect(first).toMatchObject({ imagePath: 'tokens/t1.png', x: 315, y: 315, rotation: 285 });
    placer.cancel();
    expect(await placing).toHaveLength(1);
  });

  it('lights the hexes of a large token on a hex grid', async () => {
    const { store, placer, run, move, shot } = await bench('hex-vertical');
    void placer.place({ tokens: tokens(2, 1.5), commit: commitTo(store) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    move(420, 290);
    run(500);
    await shot('hex');
    placer.cancel();
    run(400);
    expect(Object.keys(store.getState().objects.tokens)).toHaveLength(0);
  });
});
