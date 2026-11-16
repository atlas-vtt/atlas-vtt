/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { choicesOf, GRAPHICS_KNOBS, GRAPHICS_PRESETS, qualityOf, TRACED_KNOBS, type GraphicsKnob, type GraphicsKnobs } from '../../src/app/lighting/graphicsSettings';
import { bouncesOn, LIGHTING_QUALITY, pictureTexel, type LightingQuality } from '../../src/app/lighting/lightingQuality';
import { generatedDungeon, openDungeonView, type DungeonView } from '../helpers/generatedDungeonView';

vi.mock('events', async () => import('eventemitter3'));

/**
 * Every knob of the Graphics page, turned on a lit dungeon with the real engine: each value reaches
 * the engine's world or composite as the page says (the picture, the texel, the bounce, the flicker,
 * the rays, the composite's pixels), a knob the world need not be rebuilt for keeps the world, and
 * the preset's own object comes back once a knob is set back.
 */

const [WIDTH, HEIGHT] = [900, 600];

interface World { readonly picture: 'traced' | 'polygons'; readonly texel: number; readonly cascades: object | null; readonly tileRays?: number; readonly flickerMs?: number }
interface Engine { readonly world: World | null; readonly composite: { readonly picture: string; readonly filter: { readonly maxPixelRatio: number | undefined } } | null }

function engineOf(ctx: DungeonView): Engine {
  return (ctx.view.controller.renderer as unknown as { view: { engine?: Engine } }).view.engine!;
}

function worldOf(ctx: DungeonView): World {
  return engineOf(ctx).world!;
}

/** The engine with `quality` applied and a few frames drawn with it. */
function lit(ctx: DungeonView, quality: LightingQuality): Engine {
  ctx.setQuality(quality);
  for (let i = 0; i < 6; i++) ctx.frame();
  return engineOf(ctx);
}

/** What the engine shows of `quality` on this map, as the page's rows describe it. */
function shown(ctx: DungeonView, quality: LightingQuality): Record<string, unknown> {
  const engine = lit(ctx, quality);
  const world = engine.world!;
  const bounds = mapSide;
  const cell = ctx.view.store.getState().grid.size;
  expect(world.texel, 'the world is drawn at the texel the quality gives this map').toBe(pictureTexel(bounds, quality, cell));
  return {
    picture: world.picture,
    texel: world.texel,
    bounce: !!world.cascades,
    rays: world.picture === 'traced' ? world.tileRays : null,
    flicker: world.picture === 'traced' ? world.flickerMs : null,
    pixelRatio: engine.composite!.filter.maxPixelRatio,
    compositePicture: engine.composite!.picture,
  };
}

const built = generatedDungeon({ pxPerCell: 100 });
const mapSide = { width: built.width, height: built.height };
let ctx: DungeonView;

beforeAll(async () => {
  ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY.high, openings: false, pane: WIDTH, paneHeight: HEIGHT, resolution: 2 });
  for (let i = 0; i < 30; i++) ctx.frame();
}, 120_000);

afterAll(() => ctx?.destroy());

describe('the Graphics page\'s knobs on the real engine', () => {
  it.each(GRAPHICS_KNOBS)('%s: every value reaches the engine from the High preset', { timeout: 120_000 }, (knob) => {
    const results = choicesOf(knob).map((value) => {
      const knobs = { ...GRAPHICS_PRESETS.high, [knob]: value } as GraphicsKnobs;
      const quality = qualityOf(knobs);
      const result = shown(ctx, quality);
      expect(result.compositePicture, `${knob}=${String(value)} composite`).toBe(result.picture);
      switch (knob) {
        case 'picture': expect(result.picture).toBe(value); break;
        case 'bounce': expect(result.bounce).toBe(quality.picture !== 'polygons' && bouncesOn(quality, mapSide)); break;
        case 'flames': expect(result.flicker).toBe((quality as { flickerMs: number }).flickerMs); break;
        case 'shadows': expect(result.rays).toBe((quality as { tileRays: number }).tileRays); break;
        case 'litMap': expect(result.pixelRatio).toBe(value === 'standard' ? 1 : undefined); break;
        case 'detail': case 'liquids': break;
      }
      return { value, ...result, world: worldOf(ctx) };
    });
    // A knob that changes the picture is seen: its values do not all show the same.
    const distinct = new Set(results.map(({ world: _world, value: _value, ...rest }) => JSON.stringify(rest)));
    if (knob !== 'liquids') expect(distinct.size, `${knob} shows`).toBeGreaterThan(1);
    // Flames, liquids and the lit map's pixels change nothing of the world: it stays the same object.
    const worlds = new Set(results.map((result) => result.world));
    if (knob === 'flames' || knob === 'liquids' || knob === 'litMap') expect(worlds.size, `${knob} keeps the world`).toBe(1);
    else expect(worlds.size, `${knob} rebuilds the world`).toBeGreaterThan(1);
  });

  it('greys the traced knobs under the polygon picture: they change nothing there', { timeout: 120_000 }, () => {
    const saverLike = { ...GRAPHICS_PRESETS.high, picture: 'polygons' } as GraphicsKnobs;
    const base = shown(ctx, qualityOf(saverLike));
    const world = worldOf(ctx);
    for (const knob of TRACED_KNOBS as GraphicsKnob[]) {
      for (const value of choicesOf(knob)) {
        const result = shown(ctx, qualityOf({ ...saverLike, [knob]: value } as GraphicsKnobs));
        expect(result).toEqual(base);
        expect(worldOf(ctx)).toBe(world);
      }
    }
  });

  it('comes back to the preset\'s own picture once every knob is set back', { timeout: 120_000 }, () => {
    const high = shown(ctx, LIGHTING_QUALITY.high);
    shown(ctx, LIGHTING_QUALITY.saver);
    expect(shown(ctx, qualityOf({ ...GRAPHICS_PRESETS.saver, picture: 'traced', detail: 'fine', bounce: 'all', flames: 'lively', shadows: 'fine', liquids: 30, litMap: 'sharp' }))).toEqual(high);
    expect(qualityOf({ ...GRAPHICS_PRESETS.high })).toBe(LIGHTING_QUALITY.high);
    console.log(`map ${mapSide.width} × ${mapSide.height} px, cell ${ctx.view.store.getState().grid.size} px`);
  });
});
