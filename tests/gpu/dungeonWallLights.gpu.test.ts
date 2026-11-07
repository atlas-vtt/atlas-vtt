/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { CanvasSource, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { pointSegmentDistance } from '../../src/app/dungeons/render/geometry';
import { isDarkColour } from '../../src/app/dungeons/render/stone/colours';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { wallLightsOf, type WallLight } from '../../src/app/dungeons/render/wallLights/wallLightSites';
import { dungeonScene, type DungeonSceneParts } from '../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { DUNGEON_STYLES, dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LEVEL_HEIGHT } from '../../src/app/levels/levelEdits';
import { worldTexel } from '../../src/app/lighting/lightingConstants';
import { LIGHTING_QUALITY, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import { sealedWalls } from '../../src/app/lighting/sealWalls';
import { crosses, splitBlocking, type Seg } from '../../src/app/lighting/segments';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { openLevelsView, type FakeMap, type LevelsView } from '../helpers/levelsView';
import { drawWindow } from './glyphSheetChecks';
import { savePng } from './dungeonRenderHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * A lived-in dungeon's wall lights through the real lighting engine at night: whole floors of a
 * mansion, a fortress and a cave in the players' view with every light shown, and close-ups of a
 * sconce, a torch bracket and a cave torch in the map image (into `out/dungeon-render/wall-lights/`);
 * and that each light shines into its room and nothing of it through its wall. What they cost is
 * `dungeonWallLightsCost.gpu.test.ts`.
 */

const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const OUT = 'wall-lights';
const NIGHT = 0.05;
const [PANE, PANE_HEIGHT] = [1440, 900];

const LIVED_IN: Readonly<Record<'mansion' | 'fortress' | 'cave', DungeonRequest>> = {
  mansion: { seed: 7, theme: 'mansion', tags: ['inhabited', 'large'], floors: 1 },
  fortress: { seed: 11, theme: 'fortress', tags: ['inhabited', 'large'], floors: 1 },
  cave: { seed: 808, theme: 'cavern', tags: ['inhabited', 'wet'], floors: 1 },
};
/** A large lived-in cave one of whose chambers is lit from a brazier. */
const BRAZIER_CAVE: DungeonRequest = { seed: 3, theme: 'cavern', tags: ['inhabited', 'large'], floors: 1 };

interface Built {
  model: DungeonModel;
  parts: DungeonSceneParts;
  pxPerCell: number;
  originCell: { x: number; y: number };
  width: number;
  height: number;
  levels: SceneLevel[];
}

function built(request: DungeonRequest, pxPerCell: number): Built {
  const model = generateDungeon(request);
  const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell }, { width: layout.widthPx, height: layout.heightPx }, FEET)!;
  const ids = parts.levelIds ?? ['only'];
  const levels = ids.map((id, floor): SceneLevel => ({ id, name: `Floor ${floor}`, elevation: { bottom: floor * LEVEL_HEIGHT, top: (floor + 1) * LEVEL_HEIGHT }, background: `floor${floor}.png` }));
  return { model, parts, pxPerCell, originCell: layout.originCell, width: layout.widthPx, height: layout.heightPx, levels };
}

function floorMap(b: Built, look: DungeonStyleId | 'white'): FakeMap {
  if (look === 'white') return { texture: Texture.WHITE, width: b.width, height: b.height };
  const canvas = document.createElement('canvas');
  canvas.width = b.width;
  canvas.height = b.height;
  renderMap(canvas.getContext('2d')!, b.model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: b.pxPerCell, floor: 0 });
  return { texture: new Texture({ source: new CanvasSource({ resource: canvas }) }), width: b.width, height: b.height };
}

const onFloor0 = (b: Built, light: LightSource): boolean => !b.parts.levelIds || light.levels?.[0] === b.parts.levelIds[0];
const wallLights = (b: Built): LightSource[] => Object.values(b.parts.scene.lights).filter(light => light.id.includes('_wall_') && onFloor0(b, light));

async function openFloor(b: Built, map: FakeMap, quality: LightingQualityLevel, lights: Record<string, LightSource>): Promise<LevelsView> {
  const view = await openLevelsView({ map: Math.max(b.width, b.height), pane: PANE, paneHeight: PANE_HEIGHT, quality: LIGHTING_QUALITY[quality], levels: b.levels, maps: { 'floor0.png': map }, viewedLevel: b.levels[0]!.id });
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: b.levels, viewedLevel: b.levels[0]!.id,
    grid: { ...view.store.getState().grid, ...b.parts.scene.grid },
    objects: { ...view.store.getState().objects, walls: b.parts.scene.walls, lights, tokens: {} },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: NIGHT });
  await view.settle();
  return view;
}

/** The camera that shows world point `at` in the pane's middle `cells` cells across. */
function camera(b: Built, at: { x: number; y: number }, cells: number): [number, number, number] {
  const scale = PANE / (cells * b.pxPerCell);
  return [scale, PANE / 2 - at.x * scale, PANE_HEIGHT / 2 - at.y * scale];
}

/** The camera that shows the whole floor. */
function wholeFloor(b: Built): [number, number, number] {
  const scale = Math.min(PANE / b.width, PANE_HEIGHT / b.height);
  return [scale, (PANE - b.width * scale) / 2, (PANE_HEIGHT - b.height * scale) / 2];
}

async function savePixels(pixels: Uint8ClampedArray, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(PANE, PANE_HEIGHT);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), PANE, PANE_HEIGHT), 0, 0);
  await savePng(canvas, `${OUT}/${name}`);
}

function luminanceAt(pixels: Uint8ClampedArray, [scale, x, y]: [number, number, number], at: { x: number; y: number }): number {
  const o = (Math.round(at.y * scale + y) * PANE + Math.round(at.x * scale + x)) * 4;
  return 0.2126 * pixels[o]! + 0.7152 * pixels[o + 1]! + 0.0722 * pixels[o + 2]!;
}

/** A point `cells` cells from a wall light's flame, out into its room (negative: back through its wall), in world pixels; `side` cells along the wall. */
function fromFlame(light: WallLight, b: Built, cells: number, side = 0): { x: number; y: number } {
  const into = { x: Math.sin(light.rotation), y: -Math.cos(light.rotation) };
  const along = { x: -into.y, y: into.x };
  return {
    x: (light.flame.x + into.x * cells + along.x * side - b.originCell.x) * b.pxPerCell,
    y: (light.flame.y + into.y * cells + along.y * side - b.originCell.y) * b.pxPerCell,
  };
}

describe("a lived-in dungeon's wall lights at night", () => {
  it("light whole floors of a mansion, a fortress and a cave (players' view), and draw on the map", { timeout: 600_000 }, async () => {
    for (const [name, request] of Object.entries(LIVED_IN)) {
      const b = built(request, 60);
      const lights = Object.fromEntries(Object.values(b.parts.scene.lights).filter(light => onFloor0(b, light)).map(light => [light.id, light]));
      expect(wallLights(b).length).toBeGreaterThan(2);
      const view = await openFloor(b, floorMap(b, 'parchment'), 'high', lights);
      try {
        await savePixels(view.playerFrame(...wholeFloor(b)), `${name}-floor`);
      } finally {
        view.dispose();
      }
    }
    // The map image's lights close up at 300 px a cell, in a painter each.
    for (const [request, kind] of [[LIVED_IN.mansion, 'sconce'], [LIVED_IN.fortress, 'bracket'], [LIVED_IN.cave, 'cave-torch'], [BRAZIER_CAVE, 'brazier']] as const) {
      const model = generateDungeon(request);
      const light = wallLightsOf(visibleDungeon(model, DEFAULT_VIEW, 0)).find(l => l.kind === kind)!;
      for (const look of ['parchment', 'print'] as const) {
        const drawn = drawWindow(model, dungeonStyle(look), DEFAULT_VIEW, 300, { x: Math.floor(light.x) - 1, y: Math.floor(light.y) - 1, cells: 3, rows: 3 });
        expect(drawn.texts).toEqual([]);
        await savePng(drawn.canvas, `${OUT}/${kind}-${look}`);
      }
    }
  });

  it("burn the fires of the fire lights' round as teardrop flames (fireplace, hearth, fire pit; parchment over print)", { timeout: 300_000 }, async () => {
    const TILE = 450;
    const fires = [
      [{ seed: 7, theme: 'mansion', tags: ['inhabited'], floors: 1 }, 'hearth'],
      [{ seed: 11, theme: 'fortress', tags: ['inhabited'], floors: 1 }, 'hearth'],
      [{ seed: 808, theme: 'cavern', tags: ['inhabited', 'wet'], floors: 1 }, 'campfire'],
    ] as const;
    const sheet = new OffscreenCanvas(fires.length * TILE, 2 * TILE);
    const ctx = sheet.getContext('2d')!;
    for (const [i, [request, kind]] of fires.entries()) {
      const model = generateDungeon(request);
      const prop = model.floors[0]!.props.find(p => p.kind === kind)!;
      for (const [row, look] of (['parchment', 'print'] as const).entries()) {
        const drawn = drawWindow(model, dungeonStyle(look), DEFAULT_VIEW, 300, { x: Math.floor(prop.x) - 1, y: Math.floor(prop.y) - 1, cells: 3, rows: 3 });
        expect(drawn.texts).toEqual([]);
        ctx.drawImage(drawn.canvas, i * TILE, row * TILE, TILE, TILE);
      }
    }
    await savePng(sheet, `${OUT}/fires-after`);
  });

  it('warm the floor round a light and never darken it, in every look with a light floor', { timeout: 300_000 }, async () => {
    const PX = 150;
    const luminance = (d: Uint8ClampedArray, o: number): number => 0.2126 * d[o]! + 0.7152 * d[o + 1]! + 0.0722 * d[o + 2]!;
    let sampled = 0;
    for (const request of [LIVED_IN.mansion, LIVED_IN.fortress, LIVED_IN.cave, BRAZIER_CAVE]) {
      const model = generateDungeon(request);
      const lights = wallLightsOf(visibleDungeon(model, DEFAULT_VIEW, 0)).slice(0, 4);
      for (const { id, style } of DUNGEON_STYLES) {
        if (style.direction !== 'stone' || isDarkColour(style.colors.floor)) continue;
        for (const light of lights) {
          const window = { x: Math.floor(light.flame.x) - 1, y: Math.floor(light.flame.y) - 1, cells: 3, rows: 3 };
          const lit = drawWindow(model, dungeonStyle(id), DEFAULT_VIEW, PX, window).canvas.getContext('2d')!.getImageData(0, 0, 3 * PX, 3 * PX).data;
          const bare = drawWindow(model, dungeonStyle(id), { ...DEFAULT_VIEW, props: false }, PX, window).canvas.getContext('2d')!.getImageData(0, 0, 3 * PX, 3 * PX).data;
          const into = { x: Math.sin(light.rotation), y: -Math.cos(light.rotation) };
          const along = { x: -into.y, y: into.x };
          // Floor near the flame off the drawing: beside it, and before it a little aside.
          const offsets = light.kind === 'brazier' ? [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]] : [[0, 0.33], [0, -0.33], [0.36, 0.22], [0.36, -0.22]];
          for (const [ahead, side] of offsets) {
            const p = { x: light.flame.x + into.x * ahead! + along.x * side!, y: light.flame.y + into.y * ahead! + along.y * side! };
            const o = (Math.floor((p.y - window.y) * PX) * 3 * PX + Math.floor((p.x - window.x) * PX)) * 4;
            sampled++;
            expect(luminance(lit, o), `${id} ${light.kind} at ${ahead}, ${side}`).toBeGreaterThanOrEqual(luminance(bare, o) - 0.5);
          }
        }
      }
    }
    expect(sampled).toBeGreaterThan(100);
  });

  it('draw each kind in every look, in colour and in monochrome (a sheet per kind)', { timeout: 300_000 }, async () => {
    const PX = 150;
    const CELLS = 2;
    for (const [request, kind] of [[LIVED_IN.mansion, 'sconce'], [LIVED_IN.fortress, 'bracket'], [LIVED_IN.cave, 'cave-torch'], [BRAZIER_CAVE, 'brazier']] as const) {
      const model = generateDungeon(request);
      const light = wallLightsOf(visibleDungeon(model, DEFAULT_VIEW, 0)).find(l => l.kind === kind)!;
      const window = { x: Math.floor(light.flame.x) - 0.5, y: Math.floor(light.flame.y) - 0.5, cells: CELLS, rows: CELLS };
      const looks = DUNGEON_STYLES.map(style => style.id);
      const sheet = new OffscreenCanvas(looks.length * CELLS * PX, 2 * CELLS * PX);
      const ctx = sheet.getContext('2d')!;
      for (const [i, look] of looks.entries()) {
        for (const [row, monochrome] of [false, true].entries()) {
          const drawn = drawWindow(model, dungeonStyle(look), { ...DEFAULT_VIEW, monochrome }, PX, window);
          expect(drawn.texts).toEqual([]);
          ctx.drawImage(drawn.canvas, i * CELLS * PX, row * CELLS * PX);
        }
      }
      await savePng(sheet, `${OUT}/looks-${kind}`);
    }
  });

  it('light their rooms and nothing through their walls', { timeout: 600_000 }, async () => {
    for (const request of Object.values(LIVED_IN)) {
      const b = built(request, 100);
      const sites = wallLightsOf(visibleDungeon(b.model, DEFAULT_VIEW, 0));
      const scene = wallLights(b);
      expect(scene.length).toBe(sites.length);
      // Steady light without bounce: the difference a light makes is its own direct light.
      // Two-way walls: an object's outline stops light only from inside, so its top is lit from outside.
      const segs: readonly Seg[] = splitBlocking(sealedWalls(Object.values(b.parts.scene.walls).filter(wall => !b.parts.levelIds || wall.levels?.[0] === b.parts.levelIds[0]), worldTexel(b)), 'light').twoWay;
      // The composite gives a wall's face the light of the floor before it up to a band of a few texels (dynamic-lighting.md, Wall faces): a point that near a wall says nothing.
      const band = 3 * worldTexel(b, LIGHTING_QUALITY.saver.maxTexels);
      const clear = (at: { x: number; y: number }): boolean => segs.every(([ax, ay, bx, by]) => pointSegmentDistance(at, { x: ax, y: ay }, { x: bx, y: by }) >= band);
      const view = await openFloor(b, floorMap(b, 'white'), 'saver', {});
      let behind = 0;
      try {
        for (const [k, light] of scene.entries()) {
          const site = sites[k]!;
          if (site.kind === 'brazier') continue;
          const shot = camera(b, light, 6);
          const dark = view.gmCanvas(...shot).slice();
          view.store.setState({ objects: { ...view.store.getState().objects, lights: { [light.id]: light } } });
          await view.settle();
          const lit = view.gmCanvas(...shot).slice();
          view.store.setState({ objects: { ...view.store.getState().objects, lights: {} } });
          await view.settle();
          const gain = (at: { x: number; y: number }): number => luminanceAt(lit, shot, at) - luminanceAt(dark, shot, at);
          expect(gain(fromFlame(site, b, 0.45)), `${light.id} before its wall`).toBeGreaterThan(30);
          // Its wall's other face, and whatever lies beyond it, wherever the wall stands between it and every part of the flame (not through a doorway beside it): as dark as without it.
          const flame = (side: number): { x: number; y: number } => fromFlame(site, b, 0, side);
          const spread = (light.emission.sourceRadius ?? 0) / 5 + 0.05;
          for (const [ahead, side] of [[-0.45, 0], [-0.7, 0], [-1.1, 0], [-0.45, 0.4], [-0.45, -0.4], [-0.7, 0.8], [-0.7, -0.8]] as const) {
            const at = fromFlame(site, b, ahead, side);
            if (!clear(at) || ![-spread, 0, spread].every(k => segs.some(seg => crosses(flame(k).x, flame(k).y, at.x, at.y, seg)))) continue;
            behind++;
            expect(gain(at), `${light.id} at ${ahead}, ${side} cells`).toBeLessThanOrEqual(2);
          }
        }
      } finally {
        view.dispose();
      }
      expect(behind).toBeGreaterThan(scene.length * 2);
    }
  });
});
