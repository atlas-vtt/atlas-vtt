import '../setup/obsidianDom';
import { autoDetectRenderer, Container, type Renderer } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { describe, expect, it } from 'vitest';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { Point } from '../../src/app/types/visionTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { perceivedLevel, showsMap } from '../../src/app/gameSystems/senseRules';
import { CanvasLightingFallback } from '../../src/app/pixi/lighting/CanvasLightingFallback';

const SIZE = 320;
const FLOOR = [0x88, 0x99, 0xaa];
const MEASUREMENT: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'equidistant', rangeBands: [], coneAngle: 90 };

interface Scene {
  tokens: TokenEntity[];
  walls?: WallSegment[];
  lights?: LightSource[];
}

/** What the players' picture shows at sampled pixels, against what the fallback's own sight says it must. */
interface Verdict {
  /** Pixels in sight that are black. */
  hidden: number;
  /** Pixels out of sight, or in magical darkness no sense sees into, that show the map. */
  leaked: number;
  /** Pixels compared: those clear of every outline. */
  compared: number;
  /** How many tokens' sight covers the compared pixels, at most. */
  deepest: number;
  /** Compared pixels that must show the map. */
  shown: number;
}

function token(id: string, x: number, y: number, vision: TokenEntity['vision'] = { enabled: true, range: 30 }): TokenEntity {
  return { id, kind: 'token', imagePath: '', x, y, size: 1, layer: 0, rotation: 0, isHidden: false, vision };
}

function wall(id: string, p1: Point, p2: Point): WallSegment {
  return { id, kind: 'wall', type: 'solid', p1, p2 };
}

function darkness(id: string, x: number, y: number, radius: number): LightSource {
  return { id, kind: 'light', x, y, emission: { bright: 0, dim: radius, color: '#000000', intensity: 1, animation: 'none', darkness: true } };
}

function contains(polygon: readonly Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function nearOutline(polygon: readonly Point[], x: number, y: number, margin: number): boolean {
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    if (Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < margin) return true;
  }
  return false;
}

/** The players' view of the scene through the fallback at scale 1, drawn by PIXI's renderer of that kind. */
async function judge(scene: Scene, preference: 'webgl' | 'canvas'): Promise<Verdict> {
  const renderer: Renderer = await autoDetectRenderer({ preference, width: SIZE, height: SIZE, antialias: false, backgroundAlpha: 1, backgroundColor: 0x8899aa });
  const stage = new Container();
  const viewport = new Container();
  stage.addChild(viewport);
  const store = createViewAtlasStore(createInMemoryApp().app, `fallback-overlap-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const byId = <T extends { id: string }>(list: readonly T[] = []): Record<string, T> => Object.fromEntries(list.map((item) => [item.id, item]));
  store.setState((state) => ({ objects: { ...state.objects, tokens: byId(scene.tokens), walls: byId(scene.walls), lights: byId(scene.lights) } }));
  store.getState().setSceneLighting({ enabled: true, ambient: 0 });
  const fallback = new CanvasLightingFallback({ viewport: viewport as unknown as Viewport, store, measurement: () => MEASUREMENT, bounds: () => ({ width: SIZE, height: SIZE }) });
  fallback.modeLayer.visible = true;
  try {
    expect(renderer.name).toBe(preference);
    renderer.render({ container: stage });
    const context = new OffscreenCanvas(SIZE, SIZE).getContext('2d')!;
    context.drawImage(renderer.canvas as HTMLCanvasElement, 0, 0);
    const pixels = context.getImageData(0, 0, SIZE, SIZE).data;

    const seeing = fallback.currentSight().regions.filter((region) => showsMap(region.sense) && region.polygon);
    const dark = fallback.lightReaches().map((reach) => reach.polygon);
    const outlines = [...seeing.map((region) => region.polygon!), ...dark];
    const verdict: Verdict = { hidden: 0, leaked: 0, compared: 0, deepest: 0, shown: 0 };
    for (let y = 3; y < SIZE - 3; y += 2) {
      for (let x = 3; x < SIZE - 3; x += 2) {
        const px = x + 0.5, py = y + 0.5;
        if (outlines.some((outline) => nearOutline(outline, px, py, 2.5))) continue;
        const viewers = new Set(seeing.filter((region) => contains(region.polygon!, px, py)).map((region) => region.tokenId));
        const inDarkness = dark.some((polygon) => contains(polygon, px, py));
        const pierced = seeing.some((region) => perceivedLevel(region.sense, 'magical-dark') !== null && contains(region.polygon!, px, py));
        const shown = viewers.size > 0 && (!inDarkness || pierced);
        const i = (y * SIZE + x) * 4;
        const isFloor = pixels[i] === FLOOR[0] && pixels[i + 1] === FLOOR[1] && pixels[i + 2] === FLOOR[2];
        verdict.compared++;
        if (shown) verdict.shown++;
        if (shown) verdict.deepest = Math.max(verdict.deepest, viewers.size);
        if (shown && !isFloor) verdict.hidden++;
        if (!shown && isFloor) verdict.leaked++;
      }
    }
    return verdict;
  } finally {
    fallback.destroy();
    stage.destroy({ children: true });
    renderer.destroy();
  }
}

const RENDERERS = ['canvas', 'webgl'] as const;

describe('the line-of-sight fallback where several tokens see the same floor', () => {
  it.each(RENDERERS)('shows what two, three and four tokens see together, and nothing else, on %s', async (preference) => {
    // Four tokens around a pillar, each seeing 30 ft: every pair's sight overlaps, and all four meet beside the pillar.
    const pillar = [{ x: 150, y: 150 }, { x: 170, y: 150 }, { x: 170, y: 170 }, { x: 150, y: 170 }];
    const verdict = await judge({
      tokens: [
        token('zorgash', 100, 110, { enabled: true, range: 30, senses: [{ id: 'darkvision', range: 60 }] }),
        token('gyliam', 220, 110),
        token('koss', 110, 220),
        token('akhmet', 215, 215),
      ],
      walls: pillar.map((corner, i) => wall(`pillar${i}`, corner, pillar[(i + 1) % 4]!)),
    }, preference);
    expect(verdict.deepest).toBe(4);
    expect(verdict.compared).toBeGreaterThan(10_000);
    expect({ hidden: verdict.hidden, leaked: verdict.leaked }).toEqual({ hidden: 0, leaked: 0 });
  });

  it.each(RENDERERS)('keeps a magical darkness black outside the sight of a sense that sees into it, and the floor around it shown, on %s', async (preference) => {
    // Truesight looks into the darkness from the left and far past it; plain sight overlaps both.
    const verdict = await judge({
      tokens: [
        token('seer', 70, 160, { enabled: true, range: 10, senses: [{ id: 'truesight', range: 15 }] }),
        token('guard', 160, 60, { enabled: true, range: 10 }),
      ],
      lights: [darkness('shade', 225, 165, 3.5)],
    }, preference);
    expect(verdict.deepest).toBe(2);
    expect({ hidden: verdict.hidden, leaked: verdict.leaked }).toEqual({ hidden: 0, leaked: 0 });
  });

  it.each(RENDERERS)('opens a magical darkness at each of two senses that see in it, apart from each other, on %s', async (preference) => {
    // Both seers stand in the darkness and keep only their truesight: two holes in the map's black and two in the darkness'.
    const verdict = await judge({
      tokens: [
        token('left', 90, 160, { enabled: true, range: 10, senses: [{ id: 'truesight', range: 4 }] }),
        token('right', 230, 160, { enabled: true, range: 10, senses: [{ id: 'truesight', range: 4 }] }),
      ],
      lights: [darkness('shade', 160, 160, 12)],
    }, preference);
    expect(verdict.shown).toBeGreaterThan(1_000);
    expect({ hidden: verdict.hidden, leaked: verdict.leaked }).toEqual({ hidden: 0, leaked: 0 });
  });
});
