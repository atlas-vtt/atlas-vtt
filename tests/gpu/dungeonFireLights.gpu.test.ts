/// <reference types="vite/client" />
import '../setup/obsidianDom';
import { CanvasSource, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { generateDungeon } from '../../src/app/dungeons/generate';
import type { DungeonModel, DungeonRequest } from '../../src/app/dungeons/model';
import { mapLayout, suggestedPxPerCell } from '../../src/app/dungeons/render/layoutSize';
import { renderMap } from '../../src/app/dungeons/render/renderMap';
import { dungeonScene, type DungeonSceneParts } from '../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle, type DungeonStyleId } from '../../src/app/dungeons/styleCatalog';
import { LEVEL_HEIGHT } from '../../src/app/levels/levelEdits';
import { LIGHTING_QUALITY, type LightingQualityLevel } from '../../src/app/lighting/lightingQuality';
import type { TokenEntity } from '../../src/app/types';
import type { LightSource } from '../../src/app/types/lightingTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { openLevelsView, type FakeMap, type LevelsView } from '../helpers/levelsView';
import { drawWindow } from './glyphSheetChecks';
import { savePng } from './dungeonRenderHarness';

vi.mock('events', async () => import('eventemitter3'));

/**
 * A lived-in dungeon's fires through the real lighting engine at night: the players' view of a
 * mansion room lit by its fireplace, close up, a Fortress hearth and a cave's fire pit (into
 * `out/dungeon-render/fire-lights/`); and that a fireplace's light leaves its firebox only through
 * its mouth. What they cost is `dungeonFireLightsCost.gpu.test.ts`.
 */

const FEET = { unitType: 'feet', ruleDistance: 5 } as const;
const OUT = 'fire-lights';
const NIGHT = 0.05;
const [PANE, PANE_HEIGHT] = [1440, 900];

interface Built {
  model: DungeonModel;
  parts: DungeonSceneParts;
  pxPerCell: number;
  width: number;
  height: number;
  levels: SceneLevel[];
}

function built(request: DungeonRequest, pxPerCell?: number): Built {
  const model = generateDungeon(request);
  const px = pxPerCell ?? suggestedPxPerCell(model);
  const layout = mapLayout(model, px, DEFAULT_VIEW);
  const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: px }, { width: layout.widthPx, height: layout.heightPx }, FEET)!;
  const ids = parts.levelIds ?? ['only'];
  const levels = ids.map((id, floor): SceneLevel => ({ id, name: `Floor ${floor}`, elevation: { bottom: floor * LEVEL_HEIGHT, top: (floor + 1) * LEVEL_HEIGHT }, background: `floor${floor}.png` }));
  return { model, parts, pxPerCell: px, width: layout.widthPx, height: layout.heightPx, levels };
}

/** Floor 0's map as the scene's image, in look `look`, or white. */
function floorMap(b: Built, look: DungeonStyleId | 'white'): FakeMap {
  if (look === 'white') return { texture: Texture.WHITE, width: b.width, height: b.height };
  const canvas = document.createElement('canvas');
  canvas.width = b.width;
  canvas.height = b.height;
  renderMap(canvas.getContext('2d')!, b.model, dungeonStyle(look), DEFAULT_VIEW, { pxPerCell: b.pxPerCell, floor: 0 });
  return { texture: new Texture({ source: new CanvasSource({ resource: canvas }) }), width: b.width, height: b.height };
}

const fires = (b: Built): LightSource[] => Object.values(b.parts.scene.lights).filter(light => light.id.includes('_fire_') && (!b.parts.levelIds || light.levels?.[0] === b.parts.levelIds[0]));

/** The view of floor 0 at night with its walls and `lights`, a vision token `hero` where given. */
async function openFloor(b: Built, map: FakeMap, quality: LightingQualityLevel, lights: Record<string, LightSource>, hero?: { x: number; y: number }): Promise<LevelsView> {
  const view = await openLevelsView({ map: Math.max(b.width, b.height), pane: PANE, paneHeight: PANE_HEIGHT, quality: LIGHTING_QUALITY[quality], levels: b.levels, maps: { 'floor0.png': map }, viewedLevel: b.levels[0]!.id });
  const tokens: Record<string, TokenEntity> = hero ? { hero: { id: 'hero', kind: 'token', imagePath: '', x: hero.x, y: hero.y, level: b.levels[0]!.id, vision: { enabled: true } } as TokenEntity } : {};
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: b.levels, viewedLevel: b.levels[0]!.id,
    grid: { ...view.store.getState().grid, ...b.parts.scene.grid },
    objects: { ...view.store.getState().objects, walls: b.parts.scene.walls, lights, tokens },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: NIGHT });
  await view.settle();
  return view;
}

/** One cell along a fire's facing, in world pixels (`cells` from the fire; `side` cells to its right). */
function fromFire(light: LightSource, b: Built, cells: number, side = 0): { x: number; y: number } {
  const a = ((light.rotation ?? 0) * Math.PI) / 180;
  const ahead = { x: Math.sin(a), y: -Math.cos(a) };
  const right = { x: -ahead.y, y: ahead.x };
  return { x: light.x + (ahead.x * cells + right.x * side) * b.pxPerCell, y: light.y + (ahead.y * cells + right.y * side) * b.pxPerCell };
}

/** The camera that shows world point `at` in the pane's middle `cells` cells across. */
function camera(b: Built, at: { x: number; y: number }, cells: number): [number, number, number] {
  const scale = PANE / (cells * b.pxPerCell);
  return [scale, PANE / 2 - at.x * scale, PANE_HEIGHT / 2 - at.y * scale];
}

async function savePixels(pixels: Uint8ClampedArray, width: number, height: number, name: string): Promise<void> {
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
  await savePng(canvas, `${OUT}/${name}`);
}

function luminanceAt(pixels: Uint8ClampedArray, [scale, x, y]: [number, number, number], at: { x: number; y: number }): number {
  const sx = Math.round(at.x * scale + x);
  const sy = Math.round(at.y * scale + y);
  const o = (sy * PANE + sx) * 4;
  return 0.2126 * pixels[o]! + 0.7152 * pixels[o + 1]! + 0.0722 * pixels[o + 2]!;
}

/** The players' view of a fire at night: its room, a hero standing in it two cells before the fire. */
async function playersView(request: DungeonRequest, name: string, cells: number[], pxPerCell = 100): Promise<void> {
  const b = built(request, pxPerCell);
  const fire = fires(b)[0]!;
  const lights = Object.fromEntries(fires(b).map(light => [light.id, light]));
  const view = await openFloor(b, floorMap(b, 'parchment'), 'high', lights, fromFire(fire, b, 2));
  try {
    for (const [k, across] of cells.entries()) {
      const pixels = view.playerFrame(...camera(b, fromFire(fire, b, across / 6), across));
      await savePixels(pixels, PANE, PANE_HEIGHT, `${name}${k === 0 ? '' : '-close'}`);
    }
  } finally {
    view.dispose();
  }
}

const MANSION: DungeonRequest = { seed: 7, theme: 'mansion', tags: ['inhabited'], floors: 1 };

describe('the fires of a lived-in dungeon at night', () => {
  it('light a mansion room from its fireplace, a Fortress hall from its hearth and a cave from its fire pit (players\' view)', { timeout: 300_000 }, async () => {
    await playersView(MANSION, 'mansion-room', [12, 4]);
    await playersView({ seed: 11, theme: 'fortress', tags: ['inhabited'], floors: 1 }, 'fortress-hearth', [12]);
    await playersView({ seed: 808, theme: 'cavern', tags: ['inhabited', 'wet'], floors: 1 }, 'cave-fire-pit', [12]);
    // The map image's lit fire, close up: the house's fireplace and the cave's fire pit at 300 px a cell.
    for (const [request, kind, look] of [[MANSION, 'hearth', 'parchment'], [MANSION, 'hearth', 'night'], [{ seed: 808, theme: 'cavern', tags: ['inhabited', 'wet'], floors: 1 }, 'campfire', 'parchment']] as const) {
      const model = generateDungeon(request);
      const prop = model.floors[0]!.props.find(p => p.kind === kind)!;
      const drawn = drawWindow(model, dungeonStyle(look), DEFAULT_VIEW, 300, { x: Math.floor(prop.x) - 1, y: Math.floor(prop.y) - 1, cells: 3, rows: 3 });
      await savePng(drawn.canvas, `${OUT}/embers-${kind}-${look}`);
    }
  });

  it("let a mansion fireplace's light out through its mouth alone", { timeout: 300_000 }, async () => {
    const b = built({ seed: 7, theme: 'mansion', tags: ['inhabited', 'large'], floors: 1 }, 100);
    const all = fires(b);
    expect(all.length).toBeGreaterThan(2);
    // Steady light without bounce: the difference a fire makes is its own direct light.
    const view = await openFloor(b, floorMap(b, 'white'), 'saver', {});
    try {
      for (const fire of all) {
        const shot = camera(b, fire, 8);
        const dark = view.gmCanvas(...shot).slice();
        view.store.setState({ objects: { ...view.store.getState().objects, lights: { [fire.id]: fire } } });
        await view.settle();
        const lit = view.gmCanvas(...shot).slice();
        view.store.setState({ objects: { ...view.store.getState().objects, lights: {} } });
        await view.settle();
        const gain = (at: { x: number; y: number }): number => luminanceAt(lit, shot, at) - luminanceAt(dark, shot, at);
        // Into the room before the fireplace it is lit…
        expect(gain(fromFire(fire, b, 1.2)), `${fire.id} before the fire`).toBeGreaterThan(40);
        // …and the stack behind and beside the firebox, and whatever lies beyond it, stays as dark as without the fire.
        for (const [ahead, side] of [[-0.4, 0], [-0.8, 0], [-1.2, 0], [-0.3, 0.6], [-0.3, -0.6], [-0.9, 0.7], [-0.9, -0.7]] as const) {
          expect(gain(fromFire(fire, b, ahead, side)), `${fire.id} at ${ahead}, ${side} cells`).toBeLessThanOrEqual(2);
        }
      }
    } finally {
      view.dispose();
    }
  });
});
