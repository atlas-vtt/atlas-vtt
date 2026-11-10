/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { CanvasSource, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { LIGHTING_QUALITY, LIGHTING_QUALITY_LEVELS, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import type { LightEmission } from '../../src/app/types/lightingTypes';
import { generatedDungeon, openDungeonView, TORCH, type GeneratedDungeon } from '../helpers/generatedDungeonView';
import { savePng } from './dungeonRenderHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * A generated dungeon of three floors drawn in its own art at each lighting quality, as the
 * players see it and as the GM does, written to `out/saver-lighting/` for a person to compare
 * (`VITE_STILL_PREFIX` names a run, `VITE_QUALITY` picks one level). The lights burn steady so
 * every level is drawn at the same moment.
 */

const [WIDTH, HEIGHT] = [1440, 900];
const PX_PER_CELL = 100;
const STEADY: LightEmission = { ...TORCH, animation: 'none' };
const PREFIX = import.meta.env.VITE_STILL_PREFIX ?? '';
const levels = (import.meta.env.VITE_QUALITY ? [import.meta.env.VITE_QUALITY] : [...LIGHTING_QUALITY_LEVELS]) as LightingQualityLevel[];

/** `built` with every floor's map drawn in the parchment style instead of a white floor. */
function withArt(built: GeneratedDungeon): GeneratedDungeon {
  const model = generateDungeon({ seed: 4, tags: ['lava', 'overgrown', 'wet'], floors: 3 });
  const maps = Object.fromEntries(Object.entries(built.maps).map(([path, map], floor) => {
    const canvas = new OffscreenCanvas(map.width, map.height);
    renderMap(canvas.getContext('2d')!, model, dungeonStyle('parchment'), DEFAULT_VIEW, { pxPerCell: built.pxPerCell, floor });
    const texture = new Texture({ source: new CanvasSource({ resource: canvas as unknown as HTMLCanvasElement }) });
    return [path, { ...map, texture }];
  }));
  const torches = Object.fromEntries(Object.entries(built.torches).map(([id, torch]) => [id, { ...torch, emission: STEADY }]));
  return { ...built, maps, torches };
}

async function save(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), WIDTH, HEIGHT), 0, 0);
  await savePng(canvas, name, 'out/saver-lighting');
}

/** The mean of the colour channels within `radius` px of (`cx`, `cy`). */
function brightness(pixels: Uint8ClampedArray, cx: number, cy: number, radius: number): number {
  let sum = 0;
  let count = 0;
  for (let y = Math.max(0, Math.round(cy - radius)); y < Math.min(HEIGHT, cy + radius); y++) {
    for (let x = Math.max(0, Math.round(cx - radius)); x < Math.min(WIDTH, cx + radius); x++) {
      const o = (y * WIDTH + x) * 4;
      sum += pixels[o]! + pixels[o + 1]! + pixels[o + 2]!;
      count += 3;
    }
  }
  return sum / Math.max(1, count);
}

describe('a generated dungeon at each lighting quality (pictures)', () => {
  const built = withArt(generatedDungeon({ pxPerCell: PX_PER_CELL }));

  it.each(levels)('is drawn at %s', { timeout: 600_000 }, async (level) => {
    const ctx = await openDungeonView(built, { quality: LIGHTING_QUALITY[level], openings: true, pane: WIDTH, paneHeight: HEIGHT, resolution: 1 });
    try {
      const { view } = ctx;
      view.store.getState().updateTokens([{ id: 'hero', changes: { light: STEADY } }]);
      for (let i = 0; i < 120; i++) {
        ctx.frame();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      const zoom = 70 / built.pxPerCell;
      const at = (x: number, y: number, scale: number): [number, number, number] => [scale, WIDTH / 2 - x * scale, HEIGHT / 2 - y * scale];
      const torch = Object.values(built.torches)[0]!;
      const shots: [string, [number, number, number]][] = [
        ['overview', at(built.look.x, built.look.y, zoom * 0.6)],
        ['hero', at(built.hero.x, built.hero.y, zoom * 1.6)],
        ['torch', at(torch.x, torch.y, zoom * 1.6)],
      ];
      for (const [shot, camera] of shots) {
        await save(view.playerFrame(...camera), `${PREFIX}${level}-players-${shot}`);
        await save(view.gmCanvas(...camera), `${PREFIX}${level}-gm-${shot}`);
      }
      // The hero's own torch lights the floor around it; the dark beyond the party's sight shows only memory.
      const [scale, x, y] = shots[1]![1];
      const players = view.playerFrame(scale, x, y);
      expect(brightness(players, WIDTH / 2, HEIGHT / 2, 40)).toBeGreaterThan(30);
    } finally {
      ctx.destroy();
    }
  });
});
