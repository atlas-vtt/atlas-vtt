import { imageWorldRect, sameStretch, type MapStretch } from '../../../grid/mapStretch';
import { artCells, type ArtCells, type LevelArt } from '../../../levels/artRaster';
import { levelImagePlacement } from '../../../levels/levelAlignment';
import { levelBackground } from '../../../levels/levelEdits';
import { levelObjects, levelObjectsOn } from '../../../levels/levelObjects';
import { levelStack, levelsBelow, levelsShownBelow, openingsBox, stackGrid, type LevelStack, type StackGrid, type StackLevel } from '../../../levels/levelStack';
import type { TexelBox } from '../../../levels/surfaceRaster';
import { levelSurfaceList } from '../../../levels/levelSurfaces';
import { hasLevels, levelById, viewedLevelId } from '../../../levels/sceneLevels';
import type { SceneLevel } from '../../../types/sceneLevelTypes';
import type { Point } from '../../../types/visionTypes';
import type { MapBounds } from '../../../vision/visibility';
import type { LightingState } from '../LightingRenderer';

/** Reads a level's map for the stack: its size and which pixels hold art (`LevelArt`). */
export type LevelArtSource = (background: string | null, gridSize: number | undefined) => Promise<LevelArt>;

/** How the view lies over the levels below it, from their maps and surfaces alone (whether their pictures are ready is not asked). */
export interface BelowLayoutResult {
  /** The level stack with every level below the view draws counted as drawn; null while the view shows only its own level. */
  stack: LevelStack | null;
  /** The levels below the view draws, nearest first: a level's index in the stack is its place here, plus one. */
  shown: readonly string[];
  /** The world the view looks over: its own map and those of the levels below it draws; null while nothing below shows. */
  reach: MapBounds | null;
}

const NOTHING: BelowLayoutResult = { stack: null, shown: [], reach: null };

/** A level's map: being read, read, or not readable (which holds floor everywhere). */
type ArtState = LevelArt | 'reading' | 'unreadable';

interface KeptCells {
  art: LevelArt;
  placement: MapStretch;
  opensArt: boolean;
  grid: StackGrid;
  area: TexelBox | undefined;
  cells: ArtCells;
}

/** Whether a level's transparent parts are openings (`SceneLevel.openArt`). */
export function opensArt(level: SceneLevel | null | undefined): boolean {
  return level?.openArt !== false;
}

/**
 * Lays the view's level over the levels below it (`levelStack`): each level's map read once (its
 * size and transparent parts, `LevelArt`, through `read`), placed as the scene places it, on a grid
 * over the view's own map and the maps of the levels below it draws, so a small tower sees the
 * ground beyond its own image. Worked out again only when what it is made of changes. Maps of the
 * levels further down are read only once the view is open somewhere: their floor stops the view.
 */
export class BelowLayout {
  private readonly arts = new Map<string, ArtState>();
  private readonly cells = new Map<string, KeptCells>();
  /** Counts the maps read: a new one changes the layout. */
  private artsRead = 0;
  private inputs: readonly unknown[] = [];
  private result: BelowLayoutResult = NOTHING;

  /** `onRead` is called when a map has been read (or could not be), to lay the view out again. */
  constructor(private readonly read: LevelArtSource, private readonly onRead: () => void) {}

  /** The levels below the view draws (`levelsShownBelow`) while the viewed level may be open somewhere; none otherwise. */
  shownBelow(state: LightingState): string[] {
    const viewed = viewedLevelId(state);
    if (!hasLevels(state.levels) || viewed === null) return [];
    if (!opensArt(levelById(state.levels, viewed)) && !levelSurfaceList(levelObjects(state).levelSurfaces).some((surface) => surface.open)) return [];
    return levelsShownBelow(state.levels, viewed);
  }

  update(state: LightingState, viewBounds: MapBounds): BelowLayoutResult {
    const viewed = viewedLevelId(state);
    const shown = this.shownBelow(state);
    if (viewed === null || shown.length === 0 || !state.levels) return this.keep([], NOTHING);
    const below = levelsBelow(state.levels, viewed);
    const inputs = [state.levels, viewed, viewBounds.width, viewBounds.height, state.levelAlignments, state.grid?.mapStretch, state.background, this.artsRead,
      levelObjects(state).levelSurfaces, ...below.map((level) => levelObjectsOn(state, level.id).levelSurfaces)];
    if (inputs.length === this.inputs.length && inputs.every((input, i) => input === this.inputs[i])) return this.result;
    return this.keep(inputs, this.lay(state, viewed, shown, below, viewBounds));
  }

  /**
   * Whether level `id`'s map holds floor at `point` as the stack lays it (`artCells`): false where it
   * is open (transparent, or outside the image), true where it holds art; null where it was not laid
   * there (not read yet, or a level below away from the view's openings), which counts as floor.
   */
  artFloorAt(id: string, point: Point): boolean | null {
    const kept = this.cells.get(id);
    if (!kept) return null;
    const { grid, area, cells } = kept;
    const column = Math.floor(point.x / grid.texel);
    const row = Math.floor(point.y / grid.texel);
    if (!(column >= 0 && row >= 0 && column < grid.columns && row < grid.rows)) return null;
    if (area && (column < area.x || row < area.y || column >= area.x + area.columns || row >= area.y + area.rows)) return null;
    return cells.open[row * grid.columns + column] === 0;
  }

  /** Forgets every map read: another scene, or a map that changed. */
  reset(): void {
    this.arts.clear();
    this.cells.clear();
    this.artsRead++;
    this.keep([], NOTHING);
  }

  private keep(inputs: readonly unknown[], result: BelowLayoutResult): BelowLayoutResult {
    this.inputs = inputs;
    this.result = result;
    return result;
  }

  private lay(state: LightingState, viewed: string, shown: readonly string[], below: readonly SceneLevel[], viewBounds: MapBounds): BelowLayoutResult {
    const levels = state.levels!;
    // The grid reaches over the maps of the levels below drawn whose size is known.
    let [width, height] = [viewBounds.width, viewBounds.height];
    for (const id of shown) {
      const art = this.artOf(state, id);
      if (!art) continue;
      const rect = imageWorldRect(art, levelImagePlacement(state, id));
      [width, height] = [Math.max(width, rect.width), Math.max(height, rect.height)];
    }
    const grid = stackGrid({ width, height });
    const top = this.stackLevel(state, levelById(levels, viewed)!, grid);
    const open = openingsBox(top, grid);
    // Its map not read yet, or all of it floor: nothing below is looked at.
    if (!open) return { stack: null, shown, reach: null };
    // The levels below matter only where the view is open.
    const stack = levelStack(top, below.map((level) => this.stackLevel(state, level, grid, open)), shown, grid);
    return { stack: stack.box ? stack : null, shown, reach: stack.box ? { width, height } : null };
  }

  /** A level as the stack reads it on `grid`: its surfaces, and its map where that has been read, on `area` alone where given. */
  private stackLevel(state: LightingState, level: SceneLevel, grid: StackGrid, area?: TexelBox): StackLevel {
    const surfaces = levelSurfaceList(levelObjectsOn(state, level.id).levelSurfaces);
    const art = this.artOf(state, level.id);
    if (!art) return { id: level.id, surfaces };
    const placement = levelImagePlacement(state, level.id);
    const opens = opensArt(level);
    const kept = this.cells.get(level.id);
    if (kept && kept.art === art && kept.opensArt === opens && sameStretch(kept.placement, placement) && sameGrid(kept.grid, grid) && sameBox(kept.area, area)) {
      return { id: level.id, surfaces, art: kept.cells };
    }
    const cells = artCells(art, placement, opens, grid, area);
    this.cells.set(level.id, { art, placement, opensArt: opens, grid, area, cells });
    return { id: level.id, surfaces, art: cells };
  }

  /** Level `id`'s map once it has been read; read now where it has not been asked for. */
  private artOf(state: LightingState, id: string): LevelArt | null {
    const background = levelBackground(state, id);
    const key = background ?? '';
    const known = this.arts.get(key);
    if (known === undefined) {
      this.arts.set(key, 'reading');
      this.read(background, state.grid?.size).then(
        (art) => this.settle(key, art),
        (error: unknown) => {
          console.warn('[Atlas] A level\'s map could not be read for the openings to the levels below:', error);
          this.settle(key, 'unreadable');
        },
      );
      return null;
    }
    return typeof known === 'string' ? null : known;
  }

  private settle(key: string, art: ArtState): void {
    if (this.arts.get(key) !== 'reading') return;
    this.arts.set(key, art);
    this.artsRead++;
    this.onRead();
  }
}

function sameGrid(a: StackGrid, b: StackGrid): boolean {
  return a.texel === b.texel && a.columns === b.columns && a.rows === b.rows;
}

function sameBox(a: TexelBox | undefined, b: TexelBox | undefined): boolean {
  return a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.columns === b.columns && a.rows === b.rows);
}
