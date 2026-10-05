import { gmSightSource } from '../../vision/tokenSightPolicy';
import { tableSight } from '../../vision/tableSight';
import { Graphics } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { WallSegment } from '../../types/wallTypes';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { worldTexel } from '../../lighting/lightingConstants';
import { perceivedLevel, showsMap } from '../../gameSystems/senseRules';
import { SightTokens, heldForSight } from '../../lighting/sightOnDrop';
import { SEES_ALL, SightCache, sceneSight, sightSources, type AmbientLight, type LightReach, type Sight } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import { seenSpots, type SeenSpot } from '../../vision/perception';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import { destroyTree } from '../utils/destroyTree';
import type { SceneFrame } from './engine/types';
import { LIGHTING_Z_INDEX } from './LightingRenderer';
import { PlayerView } from './PlayerView';
import { LightReaches } from './lightReaches';
import { sourcesInDarkness } from '../../vision/magicalDarkness';
import { activeLights, engineLight } from './lightSources';
import type { SceneLightingView } from './sceneLightingView';

/** Full ambient light: everything in sight counts as lit. */
const FULL_DAYLIGHT: AmbientLight = { ambient: 1 };
/** The fallback has no lights. One list, so whoever compares it (`PerceptionMemo`) finds it unchanged. */
const NO_REACHES: LightReach[] = [];

export interface CanvasLightingDeps {
  viewport: Viewport;
  store: ViewAtlasStore;
  measurement: () => MeasurementSettings;
  bounds: () => MapBounds | null;
  /** The senses and conditions of the map's collection; the generic ones without it. */
  rules?: () => SightRules;
  /** What the tokens see, or what sight goes by (tokens, walls, lighting, rules), changed. */
  onSightChange?: () => void;
}

/**
 * Scene lighting without WebGL, which has no shaders: players still see nothing their tokens
 * cannot see (the map is black outside line of sight, unless the scene has token vision off),
 * but there is no light, shadow or explored memory, and everything in sight counts as lit
 * whatever the scene's lit threshold: without its lights, a dark scene would hide every token.
 * Magical darkness is the one thing of the lights it keeps, since it hides: its area is black
 * and what stands in it is not seen. The GM's canvas is unchanged.
 */
// ponytail: overlapping sight polygons are cut as separate holes; earcut may darken their overlap. Union them if that shows.
export class CanvasLightingFallback implements SceneLightingView {
  readonly modeLayer: HideableLayer;
  private readonly darkness = new Graphics();
  private readonly cache = new SightCache();
  private readonly sightTokens = new SightTokens();
  private sight: Sight = SEES_ALL;
  private readonly darknessReaches = new LightReaches();
  /** The darkness sources of the scene; the fallback has no other light. */
  private reaches: LightReach[] = NO_REACHES;
  /** What the last update read: a store change that touches none of it works nothing out. */
  private inputs: readonly unknown[] = [];
  /** The walls with their bridges, kept while the drawn walls and the map's size stay, so the sight cache knows them. */
  private sealed: { drawn: ViewAtlasState['objects']['walls']; texel: number; walls: readonly WallSegment[] } | null = null;
  private readonly playerView = new PlayerView((shown) => { this.darkness.visible = shown; });
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: CanvasLightingDeps) {
    this.darkness.zIndex = LIGHTING_Z_INDEX;
    this.darkness.eventMode = 'none';
    deps.viewport.addChild(this.darkness);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    this.update(deps.store.getState());
  }

  isEnabled(): boolean { return this.deps.store.getState().lighting.enabled; }
  currentSight(): Sight { return this.sight; }
  lightReaches(): LightReach[] { return this.reaches; }
  ambientLight(): AmbientLight { return FULL_DAYLIGHT; }
  refreshBounds(): void {
    this.inputs = [];
    this.update(this.deps.store.getState());
  }
  resetExplored(): void { /* The fallback keeps no explored memory. */ }
  editExplored(): boolean { return false; }
  beforeMapUnload(): void { /* Nothing is pending in the fallback. */ }

  /** The GM's view is unlit, and so is its thumbnail: only the darkness of a players' view on the canvas is left out. */
  renderForFrame<T>(_frame: SceneFrame, render: () => T): T {
    const shown = this.darkness.visible;
    this.darkness.visible = false;
    try {
      return render();
    } finally {
      this.darkness.visible = shown;
    }
  }

  private update(state: ViewAtlasState): void {
    const bounds = this.deps.bounds();
    const rules = this.deps.rules?.();
    const measurement = this.deps.measurement();
    const held = heldForSight(state);
    const inputs = [state.lighting, state.objects.tokens, state.objects.walls, state.objects.lights, state.grid, held, rules, bounds?.width, bounds?.height, measurement.unitDistance];
    if (inputs.every((input, i) => input === this.inputs[i]) && inputs.length === this.inputs.length) return;
    this.inputs = inputs;
    if (!state.lighting.enabled || !bounds) {
      this.darkness.clear();
      return;
    }
    const scale = unitScaleOf(measurement, state.grid);
    const walls = this.sealedWalls(state.objects.walls, worldTexel(bounds));
    const tokens = this.sightTokens.read(state);
    const dark = activeLights(state.objects.lights, tokens, state.lighting.ambient).filter((light) => light.emission.darkness).map((light) => engineLight(light, scale));
    // The same list while there is no darkness, so whoever compares it finds it unchanged.
    this.reaches = dark.length > 0 ? this.darknessReaches.sync(dark, walls) : NO_REACHES;
    const sources = sourcesInDarkness(sightSources(tokens, scale, bounds, rules, gmSightSource), FULL_DAYLIGHT, this.reaches);
    this.cache.retain(new Set(sources.map(source => source.tokenId)));
    const sight = tableSight(sceneSight(state.lighting, sources, walls, this.cache), tokens);
    // The same regions are the same sight: what was worked out from it (who is seen) stays good.
    if (!sameSight(sight, this.sight)) this.sight = sight;
    const spots = seenSpots(this.sight, FULL_DAYLIGHT, this.reaches, state.objects.tokens, scale.cellSize, walls, { conditions: rules?.conditions ?? [], held });
    this.drawDarkness(bounds, spots);
    this.deps.onSightChange?.();
  }

  private sealedWalls(drawn: ViewAtlasState['objects']['walls'], texel: number): readonly WallSegment[] {
    const kept = this.sealed;
    if (kept && kept.drawn === drawn && kept.texel === texel) return kept.walls;
    const walls = sealedWalls(wallList(drawn), texel);
    this.sealed = { drawn, texel, walls };
    return walls;
  }

  /**
   * Black over the map, cut open where a sense shows it and at each token seen without the map
   * around it; then black again over each magical darkness, cut open at those tokens and where
   * a sense that sees in magical darkness looks: a token it shows must not lie under the black.
   */
  private drawDarkness(bounds: MapBounds, spots: readonly SeenSpot[]): void {
    const g = this.darkness;
    g.clear();
    const cutSpots = (): void => {
      for (const { polygon } of spots) {
        if (polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).cut();
      }
    };
    if (!this.sight.all) {
      g.rect(0, 0, bounds.width, bounds.height).fill({ color: 0x000000 });
      for (const { sense, polygon } of this.sight.regions) {
        if (showsMap(sense) && polygon && polygon.length >= 3) g.poly(polygon.flatMap((p) => [p.x, p.y])).cut();
      }
      cutSpots();
    }
    for (const { polygon } of this.reaches) {
      if (polygon.length < 3) continue;
      g.poly(polygon.flatMap((p) => [p.x, p.y])).fill({ color: 0x000000 });
      for (const region of this.sight.regions) {
        if (showsMap(region.sense) && perceivedLevel(region.sense, 'magical-dark') !== null && region.polygon && region.polygon.length >= 3) g.poly(region.polygon.flatMap((p) => [p.x, p.y])).cut();
      }
      cutSpots();
    }
    this.darkness.visible = this.playerView.visible;
  }

  destroy(): void {
    this.unsubscribe();
    destroyTree(this.darkness);
  }
}

function sameSight(a: Sight, b: Sight): boolean {
  return a.all === b.all && a.regions.length === b.regions.length && a.regions.every((region, i) => region === b.regions[i]);
}
