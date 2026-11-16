import type { MapStretch } from '../grid/mapStretch';

/**
 * How a level's map image lies on the scene's one grid: drawn with `stretch` (as the scene's own
 * image is drawn with `GridState.mapStretch`), then scaled by `scale` and moved by `offset` world
 * pixels, so its printed grid lies on the scene's. Read it only through `levelImagePlacement`.
 */
export interface LevelAlignment {
  offset: { x: number; y: number };
  scale: number;
  stretch: MapStretch;
}

/** A level's height range in game units: what it stands on and where its ceiling is. */
export interface LevelElevation {
  bottom: number;
  top: number;
}

/**
 * One floor of a scene (Foundry's Level): a map image of its own over the scene's shared grid.
 * A scene's levels are ordered bottom first; the first is the one every object without a level
 * stands on, and its background is the scene's `background`.
 */
export interface SceneLevel {
  id: string;
  /** What the GM calls the level; unset (never blank) where it has no name: `levelLabel` names it by its place then. */
  name?: string;
  elevation: LevelElevation;
  /** The level's map image, a vault path; null for a level without one. */
  background: string | null;
  /** A roof or canopy drawn above the tokens. */
  foreground?: string | null;
  /**
   * The levels below this one that are drawn through its openings (the transparent parts of its map,
   * the openings drawn on it), nearest first; unset is every level below it. A level below that it
   * does not see still has its floor, and nothing shows where that floor is.
   */
  sees?: string[];
  /** False: the transparent parts of the level's map are floor, not openings to the levels below. Unset, they are openings. */
  openArt?: false;
  /** Where the level's background lies, in cells from the scene's origin. */
  offset?: { x: number; y: number };
  /**
   * How the level's image is fitted to the scene's grid. In a scene file only: in memory it is the
   * view state's `levelAlignments`, which undo reaches level by level.
   */
  alignment?: LevelAlignment | undefined;
}

/**
 * The levels a wall, light, light zone or sound belongs to: some by id, or all of them, which
 * includes levels added later. Unset is the first level.
 */
export type LevelSet = string[] | 'all';

/** An object that stands on one level: tokens, pins, texts, drawings, fog. Unset is the first level. */
export interface OnOneLevel {
  level?: string | undefined;
}

/** An object that may belong to several levels: walls, lights, light zones, sounds. */
export interface OnLevels {
  levels?: LevelSet | undefined;
}

/** Which way a level link carries a token: only to levels above, only to levels below, or either way. */
export type LevelLinkDirection = 'up' | 'down' | 'both';

/**
 * Stairs that are walked (`LevelLink.flight`), on a link of four corners joining two levels: edge
 * `foot` (from corner `foot` to the next) is the end at ground level on the lower level, the
 * opposite edge the end at ground level on the upper one. On each level a token steps on and off
 * only across the end at its ground level, and changes level only in the last of the flight's
 * `rows` at the other end, arriving at the same place, which on the other level is its ground end.
 */
export interface LevelLinkFlight {
  /** The index of the polygon's edge at the foot of the stairs. */
  foot: number;
  /** How many rows of cells the stairs are long, from foot to head; at least 2. */
  rows: number;
}

/**
 * Stairs, a ladder, a trapdoor or an elevator (Foundry's Change Level region): an area of the map
 * that joins the levels it stands on (`levels`, like a wall's). A token put down inside it on one of
 * them goes to another of them at the same place, if `direction` lets it go that way; where several
 * remain, the GM picks one. Map geometry the GM draws (undo-tracked, in `objects.levelLinks`). Read
 * them with `levelLinkList`.
 */
export interface LevelLink extends OnLevels {
  id: string;
  kind: 'level-link';
  /** The area's corners in world pixels, at least three. */
  polygon: { x: number; y: number }[];
  /** Unset is `both`. */
  direction?: LevelLinkDirection | undefined;
  /** Stairs that are walked, foot to head; unset: a token put down anywhere inside changes level. */
  flight?: LevelLinkFlight | undefined;
}

export type LevelLinkInput = Omit<LevelLink, 'id' | 'kind'>;

/** Changes to a level link: a field given as undefined is removed. */
export type LevelLinkChanges = { [Field in keyof LevelLinkInput]?: LevelLinkInput[Field] | undefined };

/**
 * Part of a level's floor the GM drew (Foundry's Define Surface): open to the levels below (a
 * gallery, a pit, a stairwell) or floor. Through an open surface the view shows the level below,
 * as far as the players' sight reaches; a token put down over one falls to the first level below
 * that has floor there. A later surface lies over an earlier one of its level. Map geometry the GM
 * draws (undo-tracked, in `objects.levelSurfaces`); read them with `levelSurfaceList`.
 */
export interface LevelSurface extends OnOneLevel {
  id: string;
  kind: 'level-surface';
  /** The area's corners in world pixels, at least three. */
  polygon: { x: number; y: number }[];
  /** True: open to the levels below; false: floor, closing what lies under it. */
  open: boolean;
  name?: string | undefined;
}

export type LevelSurfaceInput = Omit<LevelSurface, 'id' | 'kind'>;

/** Changes to a level surface: a field given as undefined is removed. */
export type LevelSurfaceChanges = { [Field in keyof LevelSurfaceInput]?: LevelSurfaceInput[Field] | undefined };
