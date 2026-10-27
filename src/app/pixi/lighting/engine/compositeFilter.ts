import { Color, Matrix, Texture, UniformGroup, type Filter } from 'pixi.js';
import { CompositeUpscale } from './compositeUpscale';
import { BOUNCE, DARKNESS, EXPOSURE, PURKINJE, wallBand, wallCore } from '../../../lighting/lightingConstants';
import { DEFAULT_AMBIENT_COLOR, DEFAULT_EXPLORED_COLOR, DEFAULT_UNEXPLORED_COLOR } from '../../../lighting/sceneLightingOptions';
import { srgbToLinear } from '../../../lighting/srgb';
import type { GridMarkColor } from '../../../grid/gridLightingMark';
import { ENGINE_SHADERS } from './engineShaders';
import type { DarknessMap } from './DarknessMap';
import type { ZoneMap } from './ZoneMap';
import { createPlaceholder, engineProgram } from './gpu';
import type { LightingWorld } from './LightingWorld';
import { DARK_SIGHT_LEVELS, darkLooks, type DarkLooks } from './senseDrawing';
import { SEES_ALL } from '../../../vision/sight';

export type LightingMode = 'gm' | 'player';

/** The level stack as the composite reads it (`LevelStackTexture`): what each texel of the stack's grid shows. */
export interface CompositeStack {
  /** Red is the level each texel shows (0 the viewed one, 1 and 2 the levels below drawn, 255 nothing). */
  texture: Texture;
  /** Where the texture's first texel lies in the grid, and how many it has. */
  box: { x: number; y: number; columns: number; rows: number };
  /** The grid's texel in world pixels, and its size. */
  texel: number;
  columns: number;
  rows: number;
}

/**
 * The snapshots of the levels below (`BelowSnapshots`), nearest first, null where a level has none:
 * world-space pictures over the stack's box, starting at its texel (`x`, `y`) of the stack's grid,
 * each stack texel split into `sub` × `sub` of their texels.
 */
export interface BelowPictures {
  textures: readonly [Texture | null, Texture | null];
  x: number;
  y: number;
  sub: number;
}

/** No level below is drawn for the render. */
export const NO_BELOW: BelowPictures = { textures: [null, null], x: 0, y: 0, sub: 1 };

/** The bounce's weight in the composite; 0 in a world without bounce. */
const BOUNCE_GAIN: number = BOUNCE.gain;
/** Until a world with bounce names its own (`RadianceCascades.probe`). */
const PROBE_SPACING: number = BOUNCE.probe;

/** Final pass of the lighting layer: lights the scene beneath it and hides what no one sees. */
export interface CompositeFilter {
  filter: Filter;
  /** Binds `world`'s textures; call before the previous world is destroyed. */
  setWorld(world: LightingWorld): void;
  /**
   * The colour is picked in sRGB; the composite adds light in linear light. `lift` is how much
   * the ambient light is raised where dim light is perceived as bright (`ambientLift`).
   */
  setAmbient(level: number, color: string | undefined, lift: number): void;
  /** How what is perceived without light is drawn. */
  setDarkLooks(looks: DarkLooks): void;
  /** The world's darkness map while the scene has a darkness source, null otherwise: nothing of it is read then. */
  setDarkness(map: DarknessMap | null): void;
  /** The world's zone map while the scene has an ambient zone, null otherwise: nothing of it is read then. */
  setZones(map: ZoneMap | null): void;
  /** Both of the above. */
  setMaps(darkness: DarknessMap | null, zones: ZoneMap | null): void;
  setMode(mode: LightingMode): void;
  /** No token has vision: line of sight hides nothing. */
  setAllSeen(all: boolean): void;
  /** Off, the player view shows no explored memory: what no token sees takes the unexplored colour. */
  setMemoryShown(shown: boolean): void;
  /** Tint of remembered areas and fill of never-seen ones in the player view, picked in sRGB. */
  setMemoryColours(explored: string | undefined, unexplored: string | undefined): void;
  /** The caller owns `texture` and rebinds before destroying it. */
  setExplored(texture: Texture): void;
  /** The marked grid's colour (`UnlitGrid`), or null while no grid is marked and shown. */
  setGrid(mark: GridMarkColor | null): void;
  /** Maps screen pixels of the render being drawn to world pixels; `zoom` is screen px per world px. */
  setView(screenToWorld: Matrix, zoom: number): void;
  /** The level stack of the view's openings, or null while the level shows only itself: nothing of it is read then. */
  setStack(stack: CompositeStack | null): void;
  /**
   * The snapshots of the levels below, read in world space where the stack shows them, dimmed by
   * `dim` once per level down; a level without one shows nothing in its texels.
   */
  setBelow(pictures: BelowPictures, dim: number): void;
  /** Which level of the stack this composite draws: 0 the viewed one, 1 or 2 a level below. */
  setLevelIndex(index: number): void;
  /** Device pixels per screen pixel the composite is worked out at, at most (`CompositeUpscale`); undefined, the render's own. */
  setPixelRatio(max: number | undefined): void;
}

export function createCompositeFilter(world: LightingWorld, explored: Texture): CompositeFilter {
  const screenToWorld = new Matrix();
  const areaOrigin = new Float32Array(2);
  const lightWorld = new Float32Array(2);
  const mapSize = new Float32Array(2);
  const ambient = new Float32Array(3);
  const exploredTint = new Float32Array([1, 1, 1]);
  const unexplored = new Float32Array(3);
  const greyTint = new Float32Array(3);
  const darkTint = new Float32Array([1, 1, 1]);
  const gridColor = new Float32Array(3);
  const stackBox = new Float32Array(4);
  const stackGrid = new Float32Array(2);
  const belowShown = new Float32Array(2);
  const belowGrid = new Float32Array([0, 0, 1]);
  let gridMark: number | undefined;
  const group = new UniformGroup({
    uScreenToWorld: { value: screenToWorld, type: 'mat3x3<f32>' },
    uPixelWorld: { value: 1, type: 'f32' },
    uCore: { value: 0, type: 'f32' },
    uBand: { value: 0, type: 'f32' },
    uTexel: { value: 1, type: 'f32' },
    uAreaOrigin: { value: areaOrigin, type: 'vec2<f32>' },
    uLightWorld: { value: lightWorld, type: 'vec2<f32>' },
    uMapSize: { value: mapSize, type: 'vec2<f32>' },
    uAmbient: { value: ambient, type: 'vec3<f32>' },
    uExposure: { value: EXPOSURE, type: 'f32' },
    uBounceGain: { value: BOUNCE_GAIN, type: 'f32' },
    uPurkinje: { value: PURKINJE, type: 'f32' },
    uMode: { value: 0, type: 'f32' },
    uAllSeen: { value: 1, type: 'f32' },
    uMemory: { value: 1, type: 'f32' },
    uExploredTint: { value: exploredTint, type: 'vec3<f32>' },
    uUnexplored: { value: unexplored, type: 'vec3<f32>' },
    uGreyKeep: { value: 0, type: 'f32' },
    uGreyTint: { value: greyTint, type: 'vec3<f32>' },
    uDarkTint: { value: darkTint, type: 'vec3<f32>' },
    uDarkTinted: { value: 0, type: 'f32' },
    uColourLevel: { value: 0, type: 'f32' },
    uAmbientLift: { value: 1, type: 'f32' },
    uHasDarkness: { value: 0, type: 'f32' },
    uHasZones: { value: 0, type: 'f32' },
    uVeil: { value: new Float32Array(DARKNESS.veil), type: 'vec3<f32>' },
    uGmVeil: { value: new Float32Array(DARKNESS.gmVeil), type: 'vec3<f32>' },
    uGreyLevel: { value: 0, type: 'f32' },
    uDarkLevels: { value: new Float32Array([DARK_SIGHT_LEVELS.dim, DARK_SIGHT_LEVELS.bright]), type: 'vec2<f32>' },
    uFluSpacing: { value: PROBE_SPACING, type: 'f32' },
    uGrid: { value: 0, type: 'f32' },
    uGridColor: { value: gridColor, type: 'vec3<f32>' },
    uStackBox: { value: stackBox, type: 'vec4<f32>' },
    uStackGrid: { value: stackGrid, type: 'vec2<f32>' },
    uStackTexel: { value: 1, type: 'f32' },
    uHasBelow: { value: 0, type: 'f32' },
    uLevelIndex: { value: 0, type: 'f32' },
    uBelowShown: { value: belowShown, type: 'vec2<f32>' },
    uBelowDim: { value: 1, type: 'f32' },
    uBelowGrid: { value: belowGrid, type: 'vec3<f32>' },
    uShownOut: { value: 0, type: 'f32' },
  });
  const u = group.uniforms;
  // Bound while the scene has no darkness source, no ambient zone or no bounce, so the filter never holds a destroyed map.
  const noDarkness = createPlaceholder();
  let darkness: DarknessMap | null = null;
  let zones: ZoneMap | null = null;
  const filter = new CompositeUpscale({
    glProgram: engineProgram(ENGINE_SHADERS.composite),
    resources: {
      compositeUniforms: group,
      uExplored: explored.source,
      uLightMap: world.lightMap.texture.source,
      uFluence: (world.cascades?.fluence ?? noDarkness).source,
      uDarkness: noDarkness.source,
      uZones: noDarkness.source,
      uZonesLifted: noDarkness.source,
      uStack: noDarkness.source,
      uBelow1: noDarkness.source,
      uBelow2: noDarkness.source,
      ...fieldResources(world),
    },
    blendRequired: true,
    resolution: 'inherit',
  }, areaOrigin, group, (footprint) => {
    if (u.uShownOut === footprint) return;
    u.uShownOut = footprint;
    group.update();
  });
  const composite: CompositeFilter = {
    filter,
    setWorld(next): void {
      lightWorld.set(next.lightMap.world);
      mapSize.set([next.bounds.width, next.bounds.height]);
      u.uCore = wallCore(next.texel);
      u.uBand = wallBand(next.texel);
      u.uTexel = next.texel;
      // A world without bounce: the composite reads none (gain 0) and binds the placeholder.
      u.uBounceGain = next.cascades ? BOUNCE_GAIN : 0;
      u.uFluSpacing = next.cascades?.probe ?? PROBE_SPACING;
      Object.assign(filter.resources, { uLightMap: next.lightMap.texture.source, uFluence: (next.cascades?.fluence ?? noDarkness).source, ...fieldResources(next) });
      group.update();
    },
    setAmbient(level, color, lift): void {
      setLinear(ambient, color ?? DEFAULT_AMBIENT_COLOR, level);
      u.uAmbientLift = lift;
      group.update();
    },
    setDarkLooks(looks): void {
      u.uGreyKeep = looks.greyKeep;
      greyTint.set(looks.greyTint);
      darkTint.set(looks.tint ?? [1, 1, 1]);
      u.uDarkTinted = looks.tint ? 1 : 0;
      u.uGreyLevel = looks.greyLevel;
      u.uColourLevel = looks.colourLevel;
      group.update();
    },
    setDarkness(map): void {
      if (map === darkness) return;
      darkness = map;
      filter.resources.uDarkness = (map?.texture ?? noDarkness).source;
      u.uHasDarkness = map ? 1 : 0;
      group.update();
    },
    setZones(map): void {
      if (map === zones) return;
      zones = map;
      filter.resources.uZones = (map?.texture ?? noDarkness).source;
      filter.resources.uZonesLifted = (map?.lifted ?? noDarkness).source;
      u.uHasZones = map ? 1 : 0;
      group.update();
    },
    setMaps(darknessMap, zoneMap): void {
      composite.setDarkness(darknessMap);
      composite.setZones(zoneMap);
    },
    setMode(mode): void {
      u.uMode = mode === 'player' ? 1 : 0;
      group.update();
    },
    setAllSeen(all): void {
      u.uAllSeen = all ? 1 : 0;
      group.update();
    },
    setMemoryShown(shown): void {
      u.uMemory = shown ? 1 : 0;
      group.update();
    },
    setMemoryColours(explored, unexploredColor): void {
      setLinear(exploredTint, explored ?? DEFAULT_EXPLORED_COLOR);
      setLinear(unexplored, unexploredColor ?? DEFAULT_UNEXPLORED_COLOR);
      group.update();
    },
    setExplored(texture): void {
      filter.resources.uExplored = texture.source;
    },
    setGrid(mark): void {
      // Set at every render: the uniforms are uploaded only when the grid changes.
      const kind = mark ? (mark.contrasting ? 2 : 1) : 0;
      if (kind === u.uGrid && mark?.color === gridMark) return;
      u.uGrid = kind;
      gridMark = mark?.color;
      const color = new Color(mark?.color ?? 0);
      gridColor.set([color.red, color.green, color.blue]);
      group.update();
    },
    setView(matrix, zoom): void {
      screenToWorld.copyFrom(matrix);
      u.uPixelWorld = 1 / zoom;
      group.update();
    },
    setStack(stack): void {
      filter.resources.uStack = (stack?.texture ?? noDarkness).source;
      u.uHasBelow = stack ? 1 : 0;
      if (stack) {
        stackBox.set([stack.box.x, stack.box.y, stack.box.columns, stack.box.rows]);
        stackGrid.set([stack.columns, stack.rows]);
        u.uStackTexel = stack.texel;
      }
      group.update();
    },
    setBelow({ textures: [first, second], x, y, sub }, dim): void {
      filter.resources.uBelow1 = (first ?? noDarkness).source;
      filter.resources.uBelow2 = (second ?? noDarkness).source;
      belowShown.set([first ? 1 : 0, second ? 1 : 0]);
      belowGrid.set([x, y, sub]);
      u.uBelowDim = dim;
      group.update();
    },
    setLevelIndex(index): void {
      u.uLevelIndex = index;
      group.update();
    },
    setPixelRatio(max): void {
      filter.maxPixelRatio = max;
    },
  };
  const destroy = filter.destroy.bind(filter);
  filter.destroy = (destroyPrograms?: boolean): void => {
    // The filter lets go of the placeholder before it is destroyed.
    destroy(destroyPrograms);
    noDarkness.destroy(true);
  };
  composite.setWorld(world);
  composite.setDarkLooks(darkLooks(SEES_ALL));
  return composite;
}

/** The world's wall fields under the names the composite reads them by: the walls that stop light, those that stop sight, and those that stop light both ways. */
function fieldResources(world: LightingWorld): ReturnType<LightingWorld['fields']['tiles']['resources']> {
  const { light, sight } = world.fields.bound();
  return { ...light.resources(), ...sight.resourcesAs('uSightField'), ...world.fields.tiles.resourcesAs('uTwoWayField') };
}

/** Writes an sRGB colour into `out` in linear light, scaled by `level`. */
function setLinear(out: Float32Array, color: string, level = 1): void {
  const c = new Color(color);
  out.set([srgbToLinear(c.red) * level, srgbToLinear(c.green) * level, srgbToLinear(c.blue) * level]);
}
