import type { OnOneLevel } from './sceneLevelTypes';

/** What fills a liquid surface: it picks how the surface moves. */
export type LiquidKind = 'water' | 'lava' | 'acid';

/** The colours a surface moves in, `#rrggbb`, taken from the map's own look so the motion matches its art. */
export interface LiquidColors {
  /** The surface as the map paints it. */
  surface: string;
  /** Where it lies deepest, or cools darkest. */
  deep: string;
  /** Glints of light on water, the molten seams of lava. */
  glint: string;
}

/**
 * Water, lava or acid on a map that moves while maps are animated: a pool that shimmers, a channel
 * that flows, lava that churns. Map art drawn over the map image, never shown as an object, and
 * never part of the rules (a light or a map feature says what the liquid does). Map geometry
 * (undo-tracked, in `objects.liquids`); read them with `liquidList`.
 */
export interface LiquidSurface extends OnOneLevel {
  id: string;
  kind: 'liquid';
  liquid: LiquidKind;
  /** The surface's corners in world pixels, at least three. */
  polygon: { x: number; y: number }[];
  /** What stands dry inside it (a pillar in a pool, an island in a lake): outlines in world pixels, at least three corners each. */
  holes?: { x: number; y: number }[][] | undefined;
  /** Where it flows, a unit vector in world space; absent, it stands still. */
  flow?: { x: number; y: number } | undefined;
  /**
   * The line it flows along, downstream, in world pixels (a river's middle): where it is given, the
   * surface flows round its bends along it and `flow` is only its general way, for readers that
   * know no course.
   */
  course?: { x: number; y: number }[] | undefined;
  /** The edges of `polygon` that are no shore, by the index of their first corner: the water goes on past them (into a lake, another river, beyond the map). */
  openEdges?: number[] | undefined;
  /** Drawn in the engraved looks' ink and hatching, or as Crayon's hand-coloured strokes; absent, painted, as every scene was before. */
  art?: LiquidArt | undefined;
  /** The area light this lava glows with (`LightSource.area`), so the pieces a bridge cuts it into smoulder as one. */
  lavaLight?: string | undefined;
  colors: LiquidColors;
}

/** How a surface is drawn beyond painted: `LiquidSurface.art`. */
export type LiquidArt = 'engraved' | 'crayon';

export type LiquidSurfaceInput = Omit<LiquidSurface, 'id' | 'kind'>;
