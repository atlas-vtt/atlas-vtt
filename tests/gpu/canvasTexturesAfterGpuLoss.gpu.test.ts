import '../setup/obsidianDom';
import { Container, RenderTexture, Sprite, Texture, type WebGLRenderer } from 'pixi.js';
import { createStore } from 'zustand/vanilla';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import { DEFAULT_FOG_EDGE, HARD_FOG_EDGE } from '../../src/app/fog/fogEdge';
import { CellNumberLabels } from '../../src/app/grid/cellNumberLabels';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { DOOR_GLYPH_PATHS } from '../../src/app/lighting/doorGlyphs';
import { decodedSource, decodeImage } from '../../src/app/pixi/decodedImage';
import { FogPicture } from '../../src/app/pixi/fog/FogPicture';
import { hitsTexture } from '../../src/app/pixi/gridAlignment/scanTextures';
import { BelowFog } from '../../src/app/pixi/lighting/levels/BelowFog';
import { createTestRenderer, readRgba } from '../../src/app/pixi/lighting/engine/__tests__/gpuTestUtils';
import { getConditionGlyphTexture } from '../../src/app/pixi/token-renderer/conditionGlyphTexture';
import { createDownedEmblemTexture } from '../../src/app/pixi/token-renderer/downedEmblemTexture';
import { EYE_OFF_SVG } from '../../src/app/pixi/token-renderer/HiddenTokenIcon';
import { SpriteFactory } from '../../src/app/pixi/token-renderer/SpriteFactory';
import { createLucideIconTexture } from '../../src/app/pixi/utils/lucideIconTexture';
import { createGlyphTexture, createLineGlyphTexture, createPinIconTexture } from '../../src/app/pixi/utils/pinIconTexture';
import { PIN_ICON_PATHS, type PinIconId } from '../../src/app/types/pinIcons';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { GridSystem } from '../../src/app/grid/GridSystem';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import { watchGpuProcess } from './gpuProcessDeath';

/**
 * After Obsidian's GPU process died, every picture the map draws from a 2D canvas shows again once
 * the context is back, without the map being opened again: PIXI uploads each texture anew from its
 * canvas, which the GPU process may have held.
 */

// Before anything draws: the canvases made from here on are the ones the GPU process can take.
const gpu = watchGpuProcess();
afterAll(() => gpu.stop());

const SIZE = 128;
let renderer: WebGLRenderer;
beforeEach(async () => { renderer = await createTestRenderer(SIZE); });
afterEach(() => renderer.destroy());

/** How many pixels of `view`, drawn on a cleared target of `SIZE`, hold anything. */
function inkedPixels(view: Container): number {
  const target = RenderTexture.create({ width: SIZE, height: SIZE });
  renderer.render({ container: view, target, clear: true, clearColor: [0, 0, 0, 0] });
  const pixels = readRgba(renderer, target);
  target.destroy(true);
  let inked = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]! > 0) inked++;
  return inked;
}

/** `texture` over the whole target. */
function filling(texture: Texture): Container {
  const view = new Container();
  view.addChild(new Sprite({ texture, width: SIZE, height: SIZE }));
  return view;
}

async function inkBeforeAndAfterDeath(view: Container): Promise<{ before: number; after: number }> {
  const before = inkedPixels(view);
  await gpu.die(renderer.gl);
  return { before, after: inkedPixels(view) };
}

const SVG_TOKEN = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="28" fill="#c33"/></svg>').buffer;
const FIRST_PIN_ICON = Object.keys(PIN_ICON_PATHS)[0] as PinIconId;

describe('a texture drawn once on a canvas', () => {
  const makers: Array<[string, () => Promise<Texture | null> | Texture | null]> = [
    ['a door badge glyph', () => createGlyphTexture(DOOR_GLYPH_PATHS.closed, 256)],
    ['a measure handle glyph', () => createLineGlyphTexture(['M4 12h16', 'M12 4v16'])],
    ['a pin icon', () => createPinIconTexture(FIRST_PIN_ICON)],
    ['a condition icon', () => getConditionGlyphTexture({ kind: 'icon', icon: 'skull' })],
    ['a condition letter', () => getConditionGlyphTexture({ kind: 'text', text: 'P' })],
    ['the downed emblem', () => createDownedEmblemTexture()],
    ['a hidden token icon', () => createLucideIconTexture(EYE_OFF_SVG, 'white', 64)],
    ['a token glass dome', () => new SpriteFactory({} as unknown as GridSystem).createGlassOverlay(new Container(), SIZE).texture],
    ['token art from an SVG', async () => new Texture({ source: decodedSource(await decodeImage(SVG_TOKEN, 'image/svg+xml', 64), {}) })],
    ['the grid scan\'s edges', () => hitsTexture(new Float32Array([0, 0, 100, 100, 0, 100, 100, 0]), { x: 0, y: 0, width: 100, height: 100 })],
  ];

  it.each(makers)('%s shows again after the GPU process died', async (_name, make) => {
    const texture = await make();
    expect(texture).not.toBeNull();
    const { before, after } = await inkBeforeAndAfterDeath(filling(texture!));
    expect(before).toBeGreaterThan(0);
    expect(after).toBe(before);
  });
});

it('the cell numbers show again after the GPU process died', async () => {
  const view = new Container();
  const map = { x: 0, y: 0, width: SIZE, height: SIZE };
  const numbers = new CellNumberLabels({ lattice: squareLattice(SIZE / 2, 0, 0), map, format: 'column-row' }, { x: 0, y: 0 }, { color: 0xffffff, opacity: 1 }, { zoom: 1, pixelRatio: 1, world: map });
  view.addChild(numbers.container);
  const { before, after } = await inkBeforeAndAfterDeath(view);
  expect(before).toBeGreaterThan(0);
  expect(after).toBe(before);
  numbers.destroy();
});

const FOG: Readonly<Record<string, FogOperation>> = {
  covered: { id: 'covered', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 0, y: 0, width: SIZE / 2, height: SIZE },
};

it.each([['a hard edge', HARD_FOG_EDGE], ['the default edge', DEFAULT_FOG_EDGE]])('the fog with %s shows again after the GPU process died', async (_name, edge) => {
  const view = new Container();
  const state = { objects: { fog: FOG }, mapPath: 'a.atlasmap', isPlayerView: true, isGMView: false } as unknown as ViewAtlasState;
  const fog = new FogPicture({
    layer: view,
    app: { renderer, canvas: renderer.canvas } as unknown as FogPictureApp,
    store: createStore<ViewAtlasState>(() => state),
    mapRect: () => ({ x: 0, y: 0, width: SIZE, height: SIZE }),
    coverage: new FogCoverageCache(),
  });
  fog.sprite.visible = true;
  fog.setEdge(edge);
  const { before, after } = await inkBeforeAndAfterDeath(view);
  expect(before).toBeGreaterThan(0);
  expect(after).toBe(before);
  fog.destroy();
});

it('the fog of a level below shows again after the GPU process died', async () => {
  const below = new BelowFog(() => undefined);
  below.sync(FOG, { width: SIZE, height: SIZE }, 'a.atlasmap#below');
  const view = new Container();
  view.addChild(below.view);
  const { before, after } = await inkBeforeAndAfterDeath(view);
  expect(before).toBeGreaterThan(0);
  expect(after).toBe(before);
  below.destroy();
});

type FogPictureApp = ConstructorParameters<typeof FogPicture>[0]['app'];
