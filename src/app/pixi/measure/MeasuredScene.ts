import type { StoreApi } from 'zustand/vanilla';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { levelObjects } from '../../levels/levelObjects';
import { BASE_TEXEL, worldTexel } from '../../lighting/lightingConstants';
import { sealedWalls } from '../../lighting/sealWalls';
import { areaMapOf, type AreaMap } from '../../measure/areaOnMap';
import type { AreaToken } from '../../measure/measureTokens';
import { mapTokens } from '../../tokens/offMap';
import type { ViewState } from '../../types/viewState';
import type { WallSegment } from '../../types/wallTypes';
import { isRecord } from '../../utils/guards';
import type { MapBounds } from '../../vision/visibility';
import { wallList } from '../../vision/wallList';

type SceneState = Pick<ViewState, 'grid' | 'objects' | 'levels' | 'viewedLevel'>;

const NO_WALLS: readonly WallSegment[] = [];

/**
 * What measured areas read of the level a view shows: its walls, which they stop at, and its
 * tokens, which they ring and count; and when either is another, so that areas are worked out
 * again then and at no other store write.
 */
export class MeasuredScene {
  /** The map's size, by which the lighting seals its walls: areas stop at the same walls. Without it, at the walls as a small map has them. */
  bounds: (() => MapBounds | null) | null = null;
  private wallsRecord: unknown = null;
  private tokensRecord: unknown = null;
  private known = false;

  constructor(private readonly store: Pick<StoreApi<SceneState>, 'getState'>) {}

  /** Notes the walls and the tokens of the level shown, and says which are others than when last asked; neither the first time. */
  follow(state: SceneState): { walls: boolean; tokens: boolean } {
    const objects = levelObjects(state);
    const tokens = mapTokens(objects);
    const changed = { walls: this.known && objects.walls !== this.wallsRecord, tokens: this.known && tokens !== this.tokensRecord };
    this.wallsRecord = objects.walls;
    this.tokensRecord = tokens;
    this.known = true;
    return changed;
  }

  /** Whether walls stand on the level shown. */
  walled(state: SceneState): boolean {
    return this.drawnWalls(state).length > 0;
  }

  /** The tokens of the level shown that stand on the map, as the store has them now. */
  tokens(): Readonly<Record<string, AreaToken>> {
    return mapTokens(levelObjects(this.store.getState()));
  }

  /** The map as areas read it: `grid` with the collection's rules, whether its cells are counted (its Snap is on), and the walls areas stop at. */
  areaMap(state: SceneState, grid: GridGeometry, settings: MeasurementSettings): AreaMap {
    return areaMapOf(grid, settings, state.grid?.snapToGrid ?? true, this.walls(state));
  }

  private drawnWalls(state: SceneState): readonly WallSegment[] {
    const record = levelObjects(state).walls;
    return isRecord(record) ? wallList(record) : NO_WALLS;
  }

  /**
   * The walls areas stop at: those of the level shown with their joints sealed as the lighting
   * seals them, at the same texel. `sealedWalls` keeps the result for a list of walls, so this is
   * the lighting's own array where the scene is lit, and built once per change of the walls where
   * it is not. A level without walls has none, and costs nothing.
   */
  private walls(state: SceneState): readonly WallSegment[] {
    const drawn = this.drawnWalls(state);
    if (drawn.length === 0) return NO_WALLS;
    const bounds = this.bounds?.() ?? null;
    return sealedWalls(drawn, bounds ? worldTexel(bounds) : BASE_TEXEL);
  }
}
