import { GM_SIGHT_POLICY, PLAYER_SIGHT_POLICY } from '../../vision/tokenSightPolicy';
import { selectSight } from '../../vision/selectSight';
import type { Viewport } from 'pixi-viewport';
import type { ViewAtlasState, ViewAtlasStore } from '../../storeFactory';
import type { WallSegment } from '../../types/wallTypes';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { unitScaleOf } from '../../lighting/lightingUnits';
import { sealedWalls } from '../../lighting/sealWalls';
import { worldTexel } from '../../lighting/lightingConstants';
import { perceivedLevel, showsMap } from '../../gameSystems/senseRules';
import { SightTokens, heldForSight } from '../../lighting/sightOnDrop';
import { SEES_ALL, SightCache, sceneSight, sightSources, type AmbientLight, type LightReach, type Sight, type SightRegion } from '../../vision/sight';
import { wallList } from '../../vision/wallList';
import { seenSpots, type SeenSpot } from '../../vision/perception';
import type { SightRules } from '../../vision/sightRules';
import type { MapBounds, Polygon } from '../../vision/visibility';
import type { HideableLayer } from '../playerSafeFrame';
import type { SceneFrame } from './engine/types';
import { LIGHTING_Z_INDEX } from './LightingRenderer';
import { PlayerView } from './PlayerView';
import { SightMask } from './SightMask';
import { LightReaches } from '../../vision/lightReaches';
import { sourcesInDarkness } from '../../vision/magicalDarkness';
import { activeLights, engineLight } from '../../vision/lightSources';
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
  /**
   * Asks for a render of the stage (`requestRender`). The black is composed only while the
   * players' view shows it, so a change of it in the GM's view leaves the stage as it was, and
   * a canvas that renders on change would render nothing: the player window, which captures
   * its frames in that render, would stay on what the players saw before. Shown, the black is
   * new pixels in a texture the stage already holds, which PIXI does not take for a change.
   */
  requestRender?: () => void;
}

/**
 * Scene lighting without WebGL, which has no shaders: players still see nothing their tokens
 * cannot see (the map is black outside line of sight, unless the scene has token vision off),
 * but there is no light, shadow or explored memory, and everything in sight counts as lit
 * whatever the scene's lit threshold: without its lights, a dark scene would hide every token.
 * Magical darkness is the one thing of the lights it keeps, since it hides: its area is black
 * and what stands in it is not seen. The GM's canvas is unchanged.
 */
export class CanvasLightingFallback implements SceneLightingView {
  readonly modeLayer: HideableLayer;
  /** The black over what the players do not see. */
  private readonly mask = new SightMask();
  private readonly cache = new SightCache();
  private readonly sightTokens = new SightTokens();
  private sight: Sight = SEES_ALL;
  /** `sight` was worked out from the scene the store holds: not while lighting is off or the map has no bounds. */
  private sightBuilt = false;
  private readonly darknessReaches = new LightReaches();
  /** The darkness sources of the scene; the fallback has no other light. */
  private reaches: LightReach[] = NO_REACHES;
  /** What the last update read: a store change that touches none of it works nothing out. */
  private inputs: readonly unknown[] = [];
  /** The walls with their bridges, kept while the drawn walls and the map's size stay, so the sight cache knows them. */
  private sealed: { drawn: ViewAtlasState['objects']['walls']; texel: number; walls: readonly WallSegment[] } | null = null;
  /** What the black is composed from; none while there is none to show. */
  private source: DarknessSource | null = null;
  /** `source` changed since the black was composed. */
  private stale = false;
  private readonly playerView = new PlayerView((shown) => {
    if (shown) this.drawDarkness();
    this.mask.view.visible = shown;
  });
  private readonly unsubscribe: () => void;

  constructor(private readonly deps: CanvasLightingDeps) {
    this.mask.view.zIndex = LIGHTING_Z_INDEX;
    this.mask.view.visible = false;
    this.mask.view.eventMode = 'none';
    deps.viewport.addChild(this.mask.view);
    this.modeLayer = this.playerView;
    this.unsubscribe = deps.store.subscribe((state) => this.update(state));
    this.update(deps.store.getState());
  }

  isEnabled(): boolean { return this.deps.store.getState().lighting.enabled; }
  currentSight(): Sight { return this.sight; }
  sightIsCurrent(): boolean { return !this.isEnabled() || this.sightBuilt; }
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
    const shown = this.mask.view.visible;
    this.mask.view.visible = false;
    try {
      return render();
    } finally {
      this.mask.view.visible = shown;
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
      this.sightBuilt = false;
      this.mask.clear();
      if (this.source) this.deps.requestRender?.();
      this.source = null;
      this.stale = false;
      return;
    }
    const scale = unitScaleOf(measurement, state.grid);
    const walls = this.sealedWalls(state.objects.walls, worldTexel(bounds));
    const tokens = this.sightTokens.read(state);
    const dark = activeLights(state.objects.lights, tokens, state.lighting.ambient).filter((light) => light.emission.darkness).map((light) => engineLight(light, scale));
    // The same list while there is no darkness, so whoever compares it finds it unchanged.
    this.reaches = dark.length > 0 ? this.darknessReaches.sync(dark, walls) : NO_REACHES;
    const sources = sourcesInDarkness(sightSources(tokens, scale, bounds, rules, GM_SIGHT_POLICY), FULL_DAYLIGHT, this.reaches);
    this.cache.retain(new Set(sources.map(source => source.tokenId)));
    const sight = selectSight(sceneSight(state.lighting, sources, walls, this.cache), tokens, PLAYER_SIGHT_POLICY);
    // The same regions are the same sight: what was worked out from it (who is seen) stays good.
    if (!sameSight(sight, this.sight)) this.sight = sight;
    this.sightBuilt = true;
    const spots = seenSpots(this.sight, FULL_DAYLIGHT, this.reaches, state.objects.tokens, scale.cellSize, walls, { conditions: rules?.conditions ?? [], held, policy: PLAYER_SIGHT_POLICY });
    this.setDarkness(bounds, spots);
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
   * Notes what the black is composed from. It is composed only while the players' view shows
   * it, and only when that changed: a store change that leaves sight alone, or a view that does
   * not show the black, must not pay for composing and uploading a canvas.
   */
  private setDarkness(bounds: MapBounds, spots: readonly SeenSpot[]): void {
    const source: DarknessSource = { sight: this.sight, reaches: this.reaches.map((reach) => reach.polygon), footprints: spots.map((spot) => spot.polygon), width: bounds.width, height: bounds.height };
    if (this.source && sameSource(source, this.source)) return;
    this.source = source;
    this.stale = true;
    if (this.playerView.visible) this.drawDarkness();
    this.deps.requestRender?.();
  }

  /**
   * Black over the map outside what a sense shows and outside each token seen without the map
   * around it; black again over each magical darkness outside those tokens and outside where a
   * sense that sees in magical darkness looks: a token it shows must not lie under the black.
   */
  private drawDarkness(): void {
    if (!this.stale || !this.source) return;
    this.stale = false;
    const { sight, reaches, footprints, width, height } = this.source;
    const seeing = sight.regions.filter((region) => showsMap(region.sense));
    const polygonsOf = (regions: readonly SightRegion[]): Polygon[] => regions.flatMap((region) => (region.polygon ? [region.polygon] : []));
    const piercing = seeing.filter((region) => perceivedLevel(region.sense, 'magical-dark') !== null);
    this.mask.compose({
      width,
      height,
      shown: sight.all ? null : [...polygonsOf(seeing), ...footprints],
      darkness: reaches,
      pierced: [...polygonsOf(piercing), ...footprints],
    });
  }

  destroy(): void {
    this.unsubscribe();
    this.mask.destroy();
  }
}

function sameSight(a: Sight, b: Sight): boolean {
  return a.all === b.all && a.regions.length === b.regions.length && a.regions.every((region, i) => region === b.regions[i]);
}

/** What the darkness is drawn from. `sight` is the view's own, the same object while its regions are the same. */
interface DarknessSource {
  sight: Sight;
  reaches: readonly Polygon[];
  footprints: readonly Polygon[];
  width: number;
  height: number;
}

function sameSource(a: DarknessSource, b: DarknessSource): boolean {
  return a.sight === b.sight && a.width === b.width && a.height === b.height && samePolygons(a.reaches, b.reaches) && samePolygons(a.footprints, b.footprints);
}

/** A reach keeps its polygon while it is not traced anew; a footprint is traced at every update, so its corners are compared. */
function samePolygons(a: readonly Polygon[], b: readonly Polygon[]): boolean {
  return a.length === b.length && a.every((polygon, i) => {
    const other = b[i]!;
    return polygon === other || (polygon.length === other.length && polygon.every((corner, j) => corner.x === other[j]!.x && corner.y === other[j]!.y));
  });
}
