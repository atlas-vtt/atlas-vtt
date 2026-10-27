import type { RenderTexture } from 'pixi.js';
import type { Box } from '../../../vision/polygonBounds';
import type { MeasurementSettings } from '../../../grid/measurementFormat';
import { levelImagePlacement } from '../../../levels/levelAlignment';
import { levelBackground } from '../../../levels/levelEdits';
import { everyLevelObjects, levelObjectsOn } from '../../../levels/levelObjects';
import { mapTokens } from '../../../tokens/offMap';
import { partyPlaces } from '../../../levels/roofs';
import { exploredMaskOf, levelMapKey } from '../../../levels/sceneLevels';
import type { LevelStack } from '../../../levels/levelStack';
import { stampClip, type TexelMask } from '../../../levels/stackClip';
import { sameStretch } from '../../../grid/mapStretch';
import { sceneLook } from '../../../lighting/sceneLightingOptions';
import { withZones } from '../../../lighting/lightZones';
import type { TokenEntity } from '../../../types';
import type { Point } from '../../../types/visionTypes';
import { exploredShapes } from '../../../vision/exploredShapes';
import { SceneModelBuilder, SceneSpots, type SceneModel } from '../../../vision/sceneModel';
import type { AmbientZone, Sight } from '../../../vision/sight';
import type { SightRules } from '../../../vision/sightRules';
import { GM_SIGHT_POLICY } from '../../../vision/tokenSightPolicy';
import { SightBelow, type BelowSight } from '../../../vision/throughSight';
import type { MapBounds } from '../../../vision/visibility';
import { sameSnapshotGrid, snapshotCamera, SnapshotView, type SnapshotGrid } from './belowSnapshot';
import { LightingEngine } from '../engine/LightingEngine';
import type { CompositeStack, LightingMode } from '../engine/compositeFilter';
import type { BelowLevelDeps, BelowLiquids, BelowLook, BelowMapImage, SnapshotDrawn } from './belowLevelTypes';
import { ExploredMemory } from '../ExploredMemory';
import { exploredGrid } from '../ExploredTexture';
import type { LightingState } from '../LightingRenderer';
import { BelowFog } from './BelowFog';
import { BelowStage } from './BelowStage';
import { BelowTokens, type BelowTokenLook } from './BelowTokens';
import { levelRoof, Roof } from './Roof';

const DEFAULT_CELL_SIZE = 70;
const NO_PLACES: readonly Point[] = [];
const NO_ZONES: readonly AmbientZone[] = [];
/** How translucent the GM sees the committed fog of a level below, as on the level itself. */
const GM_FOG_ALPHA = 0.5;

export type { BelowLevelDeps, BelowLiquids, BelowLook, BelowMapImage, SnapshotDrawn } from './belowLevelTypes';

/**
 * One level below the view, seen through the view's openings (`LevelsBelow`): its own map image,
 * liquids, tokens, fog, lighting (a second `LightingEngine` at a lower quality, off-screen) and
 * explored memory, all of that level, in the same world pixels as the view. What its engine draws
 * as seen is `sightBelow`: the view's lines of sight and the level's own tokens' sight. It is drawn
 * into world-space snapshots over the stack's box (`draw`), only when something it shows changed:
 * the view's camera never enters it, so panning and zooming cost it nothing.
 */
export class BelowLevel {
  readonly engine: LightingEngine;
  readonly stage: BelowStage;
  /** Where the map and roof images read their tiles: the snapshot's rect and texel. */
  private readonly camera = new SnapshotView();
  private readonly image: BelowMapImage;
  private readonly liquids: BelowLiquids | null;
  private grid: SnapshotGrid | null = null;
  /** What the engine was last given, compared by identity: a change draws the snapshot anew. */
  private inputs: readonly unknown[] = [];
  private readonly memory: ExploredMemory;
  private readonly tokens: BelowTokens;
  private readonly fog: BelowFog;
  private readonly roof: Roof;
  private readonly builder = new SceneModelBuilder();
  private readonly spots = new SceneSpots();
  private readonly gmSpots = new SceneSpots(GM_SIGHT_POLICY);
  private readonly playerBelow = new SightBelow();
  private readonly gmBelow = new SightBelow();
  /** The background asked for, and the one whose image has loaded. */
  private wanted: string | null | undefined = undefined;
  private loaded: string | null | undefined = undefined;
  private model: SceneModel | null = null;
  /** What the memory last recorded of the view's sight through the openings. */
  private recorded: { sight: Sight; model: SceneModel; stack: LevelStack } | null = null;
  /** The memory texels the openings of `stack` show the level in (`stampClip`), kept while the stack and the map stay. */
  private clip: { stack: LevelStack; bounds: MapBounds; within: TexelMask | null } | null = null;
  /** What the rules read of the level: set once it is built. */
  private rule: Omit<BelowSight, 'stack' | 'index'> | null = null;
  private mode: LightingMode = 'gm';
  private destroyed = false;
  /**
   * Counts the changes to what the level's snapshot shows that its stage's display tree does not
   * hold (its light map, memory and composite, the scene it is built from, the snapshot's grid):
   * a snapshot drawn at the same count, with nothing pending in its stage and its tokens looking
   * the same, is the snapshot it would draw again (`draw`'s `shown`).
   */
  private revision = 0;
  /** Something the picture shows changed: a part's texture or image, the memory; asks for a render. */
  private readonly changed = (): void => {
    this.revision++;
    this.deps.requestRender();
  };

  constructor(private readonly deps: BelowLevelDeps) {
    this.engine = new LightingEngine(deps.renderer, deps.quality, { levelIndex: deps.index, backBuffer: false });
    this.image = deps.image(this.camera);
    this.liquids = deps.liquids?.(this.changed) ?? null;
    this.tokens = new BelowTokens(deps.art, this.changed);
    this.fog = new BelowFog(this.changed);
    this.memory = new ExploredMemory({
      renderer: deps.renderer,
      store: deps.store,
      onTexture: (texture) => {
        if (texture) this.engine.setExplored(texture);
      },
      onTravel: () => undefined,
      onChange: this.changed,
      guard: deps.guard,
      edits: false,
    });
    this.roof = new Roof({ host: deps.roofs, requestRender: this.changed, onReady: deps.onReady, fadeMs: deps.fadeMs, camera: this.camera });
    this.stage = new BelowStage({ map: this.image.layer, liquids: this.liquids?.container, tokens: this.tokens.view, lighting: this.engine.layer, roof: this.roof.layer.view, fog: this.fog.view });
  }

  get id(): string {
    return this.deps.id;
  }

  get index(): number {
    return this.deps.index;
  }

  /** The level's map in world pixels once its image is the one asked for; null until then. */
  bounds(): MapBounds | null {
    if (this.wanted === undefined || this.loaded !== this.wanted) return null;
    const rect = this.image.worldRect;
    return rect && rect.width > 0 && rect.height > 0 ? { width: rect.width, height: rect.height } : null;
  }

  /** Its picture can be drawn: the image is in, and its engine has built a world. */
  ready(): boolean {
    return this.bounds() !== null && this.model !== null && this.engine.hasWorld();
  }

  /** Shows the level's own map, as the scene places it, loading it where another was shown. */
  followImage(state: LightingState): void {
    const background = levelBackground(state, this.deps.id);
    const placement = levelImagePlacement(state, this.deps.id);
    if (background === this.wanted) {
      if (this.loaded === background && !sameStretch(placement, this.image.mapStretch)) this.image.setStretch(placement);
      return;
    }
    this.wanted = background;
    void this.image.load(background, state.grid?.size, placement).then(() => {
      if (this.destroyed || this.wanted !== background) return;
      this.loaded = background;
      this.deps.onReady();
    });
  }

  /**
   * Lights the level from the store, as a view of it would, and draws as seen what the view's
   * players and GM (`viewed`) see of it through the openings and what its own tokens see. Its
   * memory records what its tokens see (and `recordThrough` what the view sees of it).
   */
  update(state: LightingState, viewed: { sight: Sight; gmSight: Sight }, measurement: () => MeasurementSettings, rules?: () => SightRules): void {
    const bounds = this.bounds();
    if (!bounds) return;
    const id = this.deps.id;
    const seen = { ...state, viewedLevel: id };
    this.memory.sync(bounds, exploredMaskOf(state, id), id);
    const { model, rebuilt } = this.builder.update(seen, bounds, measurement, rules);
    this.model = model;
    if (rebuilt && model.explored) this.memory.record(model.explored);
    const own = model.gmSight ?? model.sight;
    const player = this.playerBelow.of(viewed.sight, model.sight);
    const gm = this.gmBelow.of(viewed.gmSight, own);
    const spots = this.spots.update(model, seen, measurement, rules);
    const gmSpots = own === model.sight ? spots : this.gmSpots.update(model, seen, measurement, rules, own);
    this.rule = { sight: player, ambient: model.ambient, reaches: model.reaches };
    const inputs = [model, gm, player, spots, gmSpots, state.lighting, state.grid?.size, bounds.width, bounds.height];
    if (inputs.length !== this.inputs.length || inputs.some((input, i) => input !== this.inputs[i])) {
      this.inputs = inputs;
      this.revision++;
    }
    this.engine.setEnabled(true);
    this.engine.update({
      bounds, walls: model.walls, lights: model.lights, albedo: null, zones: model.zones,
      sight: gm, spots: gmSpots, ...(gm !== player && { playerSight: player, playerSpots: spots }),
      sightRadius: (state.grid?.size ?? DEFAULT_CELL_SIZE) * 0.5, cellSize: state.grid?.size ?? DEFAULT_CELL_SIZE, ...sceneLook(state.lighting),
    });
    const objects = levelObjectsOn(state, id);
    this.tokens.sync(mapTokens(objects), state.grid?.size ?? DEFAULT_CELL_SIZE, state.tokenSettings?.tokenRingSize ?? 1);
    this.fog.sync(objects.fog, bounds, levelMapKey(state.mapPath, seen));
    // The level's roof: faded where its party stands, seen as the players see this level from above.
    this.roof.update({
      ...levelRoof(state, id), background: this.image.imageSize, party: partyPlaces(mapTokens(objects)), selected: NO_PLACES,
      lit: { lighting: state.lighting, zones: model.ambient.zones ?? NO_ZONES, bounds, sight: player, tokens: mapTokens(everyLevelObjects(state)) },
    });
  }

  /** Whether the level's drawn roof covers `point` in the players' picture: a token of it there is not seen. */
  roofCovers(point: Point): boolean {
    return this.roof.coversForPlayers(point);
  }

  /** What the rules read of the level from the view above, through `stack`; null until it is built. */
  belowSight(stack: LevelStack): BelowSight | null {
    return this.rule && { stack, index: this.deps.index, ...this.rule };
  }

  /** The level's committed fog as the rules read it (null: unreadable, which hides all). */
  fogCoverage(): ReturnType<BelowFog['coverage']> {
    return this.fog.coverage();
  }

  setStack(stack: CompositeStack | null): void {
    this.revision++;
    this.engine.setStack(stack);
  }

  /**
   * Where the level's snapshot lies (the stack's box on its grid): the map and roof images load
   * the tiles it shows, and the snapshot is drawn anew.
   */
  setSnapshot(grid: SnapshotGrid | null): void {
    if (sameSnapshotGrid(grid, this.grid)) return;
    this.grid = grid;
    this.camera.aim(grid, this.deps.renderer.resolution);
    this.revision++;
  }

  /**
   * Draws the level's snapshot in `look` into `target` (the snapshot grid's size): its tokens as
   * `tokens` says, its fog and roof for the look. `shown` is what `target` was last drawn at, or
   * null: where nothing changed since, it is left as it is. Returns what `target` now shows; null
   * without a snapshot grid.
   */
  draw(look: BelowLook, target: RenderTexture, tokens: (token: TokenEntity) => BelowTokenLook, shown: SnapshotDrawn | null = null): SnapshotDrawn | null {
    const grid = this.grid;
    if (!grid) return null;
    // What the stage holds changed (a token, a tile of the map, a fade) since its last render.
    if (this.stage.hasChanges()) this.revision++;
    const tokenLook = this.tokens.lookKey(tokens);
    if (shown && shown.revision === this.revision && shown.tokens === tokenLook) return shown;
    if (look.mode !== this.mode) {
      this.mode = look.mode;
      this.engine.setMode(look.mode);
    }
    const camera = snapshotCamera(grid);
    const inverse = camera.clone().invert();
    this.engine.setView(inverse, 1 / grid.texel);
    this.roof.setMode(look.picture ? 'picture' : look.mode);
    this.roof.setView(inverse);
    this.tokens.show(tokens);
    this.fog.view.alpha = look.mode === 'player' ? 1 : GM_FOG_ALPHA;
    this.stage.render(this.deps.renderer, target, camera);
    return { revision: this.revision, tokens: tokenLook };
  }

  /** Flicker below and the roof's fading: true where the level's light map changed (the roof asks for its renders itself). */
  animate(now: number, view?: Box): boolean {
    this.roof.animate(now);
    const drew = this.engine.busy() && this.engine.animate(now, view);
    if (drew) this.revision++;
    return drew;
  }

  /** The graphics context is lost: nothing its memory holds from now on is its memory. */
  holdSaves(): void {
    this.memory.holdSaves();
  }

  /**
   * The view is done with this level: its memory saves what is pending first (`flush`), unless what
   * it holds may be broken (a lost context, an engine that stopped).
   */
  destroy(flush: boolean): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (flush) this.deps.guard(() => this.memory.beforeMapUnload());
    this.stage.release();
    this.roof.destroy();
    this.engine.destroy();
    this.liquids?.destroy();
    this.memory.destroy();
    this.tokens.destroy();
    this.fog.destroy();
    this.image.destroy();
  }

  /**
   * Records what the view's players see of the level through the openings (`sight`), within the
   * memory texels that touch only texels `stack` shows it in (`stampClip`), when that or the
   * level's light changed.
   */
  recordThrough(sight: Sight, stack: LevelStack, state: LightingState): void {
    const model = this.model;
    const bounds = this.bounds();
    if (!model || !bounds) return;
    const last = this.recorded;
    if (last?.sight === sight && last.model === model && last.stack === stack) return;
    this.recorded = { sight, model, stack };
    if (sight.all) return;
    const looking: Sight = { all: false, regions: sight.regions.filter((region) => region.polygon !== null) };
    const shapes = exploredShapes(looking, withZones(state.lighting, model.ambient.zones ?? []), model.reaches);
    const within = shapes && this.clipOf(stack, bounds);
    if (shapes && within) {
      // Assigned, not spread: a spread would work the polygons out now (`exploredShapes`).
      this.memory.record(Object.assign(shapes, { within }));
      this.revision++;
    }
  }

  /** The memory texels `stack` shows the level in, worked out once for the stack and the map. */
  private clipOf(stack: LevelStack, bounds: MapBounds): TexelMask | null {
    const kept = this.clip;
    if (kept?.stack === stack && kept.bounds.width === bounds.width && kept.bounds.height === bounds.height) return kept.within;
    const within = stampClip(stack, this.deps.index, { ...exploredGrid(bounds), mapWidth: bounds.width, mapHeight: bounds.height });
    this.clip = { stack, bounds, within };
    return within;
  }
}
