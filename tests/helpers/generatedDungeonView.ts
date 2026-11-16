import { Texture, type WebGLRenderer } from 'pixi.js';
import { generateDungeon } from '../../src/app/dungeons/generate';
import { mapLayout, suggestedPxPerCell } from '../../src/app/dungeons/render/layoutSize';
import { visibleDungeon } from '../../src/app/dungeons/render/visibleDungeon';
import { dungeonScene } from '../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../src/app/dungeons/style';
import { dungeonStyle } from '../../src/app/dungeons/styleCatalog';
import { LEVEL_HEIGHT } from '../../src/app/levels/levelEdits';
import type { LightingQuality } from '../../src/app/lighting/lightingQuality';
import { createViewLiquids } from '../../src/app/pixi/liquids/viewLiquids';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource } from '../../src/app/types/lightingTypes';
import type { LevelSurface, SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { openLevelsView, type FakeMap, type LevelsView } from './levelsView';

interface Point {
  x: number;
  y: number;
}

/** How the outlines of tall objects (columns, statues, wells) are given to the scene. */
export type OutlineWalls = 'as-generated' | 'two-way' | 'none';

export interface GeneratedDungeonOptions {
  seed?: number;
  /** Pixels per cell of the scene's maps: the generator's suggestion where unset. */
  pxPerCell?: number;
  outlines?: OutlineWalls;
}

export interface GeneratedDungeon {
  scene: NonNullable<ReturnType<typeof dungeonScene>>;
  levels: SceneLevel[];
  maps: Record<string, FakeMap>;
  width: number;
  height: number;
  pxPerCell: number;
  viewed: string;
  /** The middle of the entry floor's opening onto the floors below. */
  look: Point;
  /** The middle of the entry floor's room nearest the opening, where a hero stands. */
  hero: Point;
  /** The middle of a tall object of the entry floor with nothing else standing within two cells: the drag circles it. */
  column: Point;
  /** The middle of the largest room of the entry floor with no tall object in it. */
  openRoom: Point;
  /** Torches burning in six rooms near the opening. */
  torches: Record<string, LightSource>;
}

export const TORCH: LightEmission = { bright: 20, dim: 40, color: '#ff9a3c', intensity: 1, animation: 'torch', kind: 'torch', sourceRadius: 2 };

function middle(polygon: readonly Point[]): Point {
  return { x: polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length, y: polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length };
}

/** The outline walls as `outlines` asks: as generated (one-way from inside), closed from both sides, or left out. */
function withOutlines(walls: Record<string, WallSegment>, outlines: OutlineWalls): Record<string, WallSegment> {
  if (outlines === 'as-generated') return walls;
  const out: Record<string, WallSegment> = {};
  for (const [id, wall] of Object.entries(walls)) {
    if (!id.includes('_shadow_')) out[id] = wall;
    else if (outlines === 'two-way') {
      const { direction: _direction, ...closed } = wall;
      out[id] = closed;
    }
  }
  return out;
}

/** A generated dungeon of three floors (seed 4: its entry floor opens onto the floors below) as its scene holds it, with lava, water and plants. */
export function generatedDungeon({ seed = 4, pxPerCell: wanted, outlines = 'as-generated' }: GeneratedDungeonOptions = {}): GeneratedDungeon {
  // The first dungeon from `seed` on whose entry floor a hole opens onto the floor below, which the views look through.
  let model = generateDungeon({ seed, tags: ['lava', 'overgrown', 'wet'], floors: 3 });
  for (let next = seed + 1; !model.floors[0]!.terrain.some((p) => p.opening && p.opening.bottom !== null); next++) model = generateDungeon({ seed: next, tags: ['lava', 'overgrown', 'wet'], floors: 3 });
  const pxPerCell = wanted ?? suggestedPxPerCell(model);
  const layout = mapLayout(model, pxPerCell, DEFAULT_VIEW);
  const image = { width: layout.widthPx, height: layout.heightPx };
  const scene = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell }, image, { unitType: 'ft', ruleDistance: 5 })!;
  const ids = scene.levelIds!;
  // The tall objects of the entry floor, from their outlines as generated.
  const chains = new Map<string, Point[]>();
  for (const wall of Object.values(scene.scene.walls ?? {})) {
    if (!wall.id.includes('_shadow_') || !wall.levels?.includes(ids[0]!)) continue;
    chains.set(wall.chainId!, [...(chains.get(wall.chainId!) ?? []), wall.p1]);
  }
  const objects = [...chains.values()].map(middle);
  scene.scene.walls = withOutlines(scene.scene.walls ?? {}, outlines);
  const maps: Record<string, FakeMap> = {};
  const levels = ids.map((id, floor): SceneLevel => {
    maps[`floor${floor}.png`] = { texture: Texture.WHITE, width: image.width, height: image.height };
    return { id, name: `Floor ${floor}`, elevation: { bottom: -floor * LEVEL_HEIGHT, top: (1 - floor) * LEVEL_HEIGHT }, background: `floor${floor}.png` };
  }).reverse();
  const opening = Object.values(scene.scene.levelSurfaces ?? {}).find((surface) => surface.level === ids[0] && surface.open)!;
  const look = middle(opening.polygon);
  const world = (r: { x: number; y: number; w: number; h: number }): Point => ({ x: (r.x + r.w / 2 + 0.3 - layout.originCell.x) * pxPerCell, y: (r.y + r.h / 2 + 0.3 - layout.originCell.y) * pxPerCell });
  const rooms = visibleDungeon(model, DEFAULT_VIEW, 0).rooms.filter((room) => room.w >= 3 && room.h >= 3)
    .sort((a, b) => Math.hypot(world(a).x - look.x, world(a).y - look.y) - Math.hypot(world(b).x - look.x, world(b).y - look.y));
  const hero = world(rooms[0]!);
  const torches = Object.fromEntries(rooms.slice(1, 7).map((room, i): [string, LightSource] => [`torch${i}`, { id: `torch${i}`, kind: 'light', levels: [ids[0]!], ...world(room), emission: TORCH }]));
  // A cave has no tall object until its formations are drawn: the token then circles where it stands.
  const lonely = objects.find((o) => objects.every((other) => other === o || Math.hypot(other.x - o.x, other.y - o.y) > 2 * pxPerCell)) ?? objects[0] ?? hero;
  const empty = visibleDungeon(model, DEFAULT_VIEW, 0).rooms
    .filter((room) => objects.every((o) => o.x < world(room).x - (room.w / 2) * pxPerCell || o.x > world(room).x + (room.w / 2) * pxPerCell || o.y < world(room).y - (room.h / 2) * pxPerCell || o.y > world(room).y + (room.h / 2) * pxPerCell))
    .sort((a, b) => b.w * b.h - a.w * a.h);
  return { scene, levels, maps, ...image, pxPerCell, viewed: ids[0]!, look, hero, column: lonely, openRoom: world(empty[0]!), torches };
}

/** Every frame the stage rendered, and every picture of a level below drawn for one. */
export interface RenderCounts {
  stage: number;
  below: number;
}

export interface DungeonView {
  view: LevelsView;
  gl: WebGL2RenderingContext;
  counts: RenderCounts;
  /** One display frame at the clock's next step: the lighting's work and the render it asks for. */
  frame: () => void;
  /** The lighting's quality from now on, as a GM's change of it in the settings. */
  setQuality: (quality: LightingQuality) => void;
  destroy: () => void;
}

export interface DungeonViewOptions {
  quality: LightingQuality;
  /** False: no floor has an opening, so the floors below are never seen. */
  openings: boolean;
  pane: number;
  paneHeight: number;
  resolution: number;
}

/** The entry floor's view of `built` with its real lighting, levels below and liquids, a vision token `hero` at the hero's place, the camera on the opening at about 70 points a cell. */
export async function openDungeonView(built: GeneratedDungeon, { quality: initial, openings, pane, paneHeight, resolution }: DungeonViewOptions): Promise<DungeonView> {
  let quality = initial;
  const listeners = new Set<() => void>();
  const view = await openLevelsView({
    map: Math.max(built.width, built.height), pane, paneHeight, resolution,
    levels: built.levels, maps: built.maps, viewedLevel: built.viewed,
    qualitySource: { current: () => quality, onChange: (listener) => { listeners.add(listener); return () => listeners.delete(listener); } },
  });
  const { scene } = built;
  const hero = { id: 'hero', kind: 'token', imagePath: '', x: built.hero.x, y: built.hero.y, level: built.viewed, vision: { enabled: true } } as TokenEntity;
  const surfaces: Record<string, LevelSurface> = openings ? scene.scene.levelSurfaces ?? {} : {};
  view.store.setState({
    mapLoaded: true, isMapLoading: false, levels: built.levels, viewedLevel: built.viewed,
    grid: { ...view.store.getState().grid, ...scene.scene.grid },
    objects: {
      ...view.store.getState().objects,
      walls: scene.scene.walls ?? {}, lights: { ...scene.scene.lights, ...built.torches }, tokens: { hero },
      mapFeatures: scene.scene.mapFeatures ?? {}, liquids: scene.scene.liquids ?? {},
      levelSurfaces: surfaces, levelLinks: scene.scene.levelLinks ?? {},
    },
  });
  view.store.getState().setSceneLighting({ enabled: true, ambient: 0.05 });
  const liquids = createViewLiquids(view.app, view.viewport, view.store, { current: () => initial, onChange: () => () => undefined });
  liquids.container.zIndex = -1;
  view.viewport.addChild(liquids.container);
  liquids.setMode('play');
  liquids.buildPending();
  const zoom = 70 / built.pxPerCell;
  view.viewport.scale.set(zoom);
  view.viewport.position.set(pane / 2 - built.look.x * zoom, paneHeight / 2 - built.look.y * zoom);
  await view.settle();
  const renderer = view.app.renderer as WebGLRenderer;
  const counts: RenderCounts = { stage: 0, below: 0 };
  const render = renderer.render.bind(renderer);
  renderer.render = ((...args: Parameters<typeof render>) => {
    const container = (args[0] as { container?: { label?: string } }).container;
    if (container === view.app.stage) counts.stage++;
    else if (container?.label === 'level-below') counts.below++;
    return render(...args);
  }) as typeof renderer.render;
  let time = performance.now();
  return {
    view, gl: renderer.gl, counts,
    setQuality: (next) => {
      quality = next;
      for (const listener of listeners) listener();
    },
    frame: () => { view.app.ticker.update(time = Math.max(time + 16, performance.now())); },
    destroy: () => { liquids.destroy(); view.dispose(); },
  };
}

/** Waits until the graphics device has done everything asked of it: a pixel read back. */
export function settleGpu(gl: WebGL2RenderingContext): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
}

export const median = (values: readonly number[]): number => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? NaN;
export const percentile = (values: readonly number[], share: number): number => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * share))] ?? NaN;
export const round = (value: number): number => Math.round(value * 100) / 100;
