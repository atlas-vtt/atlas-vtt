/// <reference types="vite/client" />
import '../setup/obsidianDom';
import type { RenderTexture, WebGLRenderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_QUALITY } from '../../src/app/lighting/lightingQuality';
import { readFloats } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { generatedDungeon, openDungeonView, TORCH, type DungeonView } from '../helpers/generatedDungeonView';

vi.mock('events', async () => import('eventemitter3'));

type ShownTile = { moving?: true };
type Tiles = { busy(): boolean; tiles(): ReadonlyMap<string, ShownTile> };

type World = { tiles: Tiles; cascades: { fluence: RenderTexture; building: boolean } | null };

function worldOf(ctx: DungeonView): World {
  const host = ctx.view.controller.renderer as unknown as { view: { engine?: { world: World | null } } };
  return host.view.engine!.world!;
}

function tilesOf(ctx: DungeonView): Tiles {
  return worldOf(ctx).tiles;
}

/** The bounce as it stands: the light arriving at every probe. */
function fluence(ctx: DungeonView): Float32Array {
  return readFloats(ctx.view.app.renderer as WebGLRenderer, worldOf(ctx).cascades!.fluence);
}

function difference(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('a carried light that was dragged', () => {
  let ctx: DungeonView | null = null;
  afterEach(() => { ctx?.destroy(); ctx = null; });

  it('is traced in full once its token rests, never keeping the quick tile of the drag', async () => {
    const built = generatedDungeon();
    ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY.high, openings: true, pane: 720, paneHeight: 450, resolution: 1 });
    const { store } = ctx.view;
    const hero = store.getState().objects.tokens.hero!;
    store.getState().updateTokens([{ id: 'hero', changes: { light: TORCH } }]);
    for (let i = 0; i < 30; i++) { ctx.frame(); await wait(0); }

    for (let i = 1; i <= 10; i++) {
      store.getState().setTokenPositions([{ id: 'hero', x: hero.x + i * 8, y: hero.y }]);
      ctx.frame();
    }
    expect([...tilesOf(ctx).tiles().values()].some((tile) => tile.moving)).toBe(true);

    // The token rests: frames go on as a display's do.
    for (let i = 0; i < 120 && (tilesOf(ctx).busy() || [...tilesOf(ctx).tiles().values()].some((tile) => tile.moving)); i++) {
      await wait(16);
      ctx.frame();
    }
    const left = [...tilesOf(ctx).tiles()].filter(([, tile]) => tile.moving).map(([key]) => key);
    expect(left).toEqual([]);
  }, 120_000);

  it('takes its bounce along, never leaving it where the drag began', async () => {
    const built = generatedDungeon();
    ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY.high, openings: true, pane: 720, paneHeight: 450, resolution: 1 });
    const { store } = ctx.view;
    const from = built.hero, to = { x: from.x + 6 * built.pxPerCell, y: from.y };
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 120 && (tilesOf(ctx!).busy() || worldOf(ctx!).cascades!.building); i++) { await wait(16); ctx!.frame(); }
      for (let i = 0; i < 20; i++) { await wait(16); ctx!.frame(); }
    };
    store.getState().updateTokens([{ id: 'hero', changes: { light: TORCH } }]);
    await settle();
    const before = fluence(ctx);

    // A quick drag across the map, then the pointer hovers where it went at a display's pace: the light keeps moving.
    for (let i = 1; i <= 10; i++) {
      store.getState().setTokenPositions([{ id: 'hero', x: from.x + ((to.x - from.x) * i) / 10, y: from.y + ((to.y - from.y) * i) / 10 }]);
      ctx.frame();
    }
    for (let i = 0; i < 30; i++) {
      store.getState().setTokenPositions([{ id: 'hero', x: to.x + (i % 2), y: to.y }]);
      await wait(16);
      ctx.frame();
    }
    const dragged = fluence(ctx);

    store.getState().setTokenPositions([{ id: 'hero', x: to.x, y: to.y }]);
    await settle();
    const rested = fluence(ctx);
    expect(difference(dragged, rested)).toBeLessThan(0.25 * difference(before, rested));
  }, 120_000);
});

