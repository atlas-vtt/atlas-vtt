import type { DungeonProp, PropKind } from '../model';
import { PROP_SPECS } from '../props/catalogue';
import type { Material } from './art/hand';
import type { GlyphPen } from './glyphPen';
import { PROP_GLYPHS } from './props/registry';

/**
 * Atlas' own drawings of the pieces, one family in the grammar of `glyphPen.ts`: in cells
 * around the piece's centre, its front towards −y (into the room; a back-wall or wall piece's back
 * is the wall, at +y). Stone is bevelled, wood shows its grain or bands, water lies in its basin.
 * Every kind has a drawing for each painter, kept by family in `props/registry.ts`.
 */

/** The size a piece is drawn at, in its own cells: its footprint, the size it is stretched to, or a disc's diameter both ways. */
export interface GlyphFit {
  along: number;
  out: number;
}

/** One painter's drawing of a piece at its fit; the caller has moved, turned and scaled the context and set the ink and outline width. */
export type GlyphDraw = (pen: GlyphPen, fit: GlyphFit) => void;

/** One kind of piece: what it is made of, how tall it stands, its outline and a drawing for each painter. */
export interface PropGlyph {
  material: Material;
  /** About half its size, in its own cells: how far the light's modelling reaches across it. */
  radius: number;
  /** Rounded, so the light models it across its top; a flat top is lit evenly. */
  dome?: true;
  /** How tall it stands, as a share of a column's shadow; 0 for what lies flat. */
  lift: number;
  /** The outline that casts its shadow and holds its texture; none for what lies flat. */
  silhouette?: (path: CanvasPath, fit: GlyphFit) => void;
  stone: GlyphDraw;
  engraved: GlyphDraw;
  /**
   * The outline lighting takes as a wall (total cover only), lying on the drawing, in its own cells
   * at scale 1: half its width and depth, and its centre where that is not the piece's (a case at
   * the back of its cell).
   */
  tall?: { halfW: number; halfH: number; round: boolean; x?: number; y?: number };
  /** How it is drawn on a house's floor, where it stands before a chimney stack; unset, as anywhere else. */
  inHouse?: PropGlyph;
  /** How it is drawn with its fire burning, in a lived-in dungeon (`firesLit`); unset, as when cold. Only its drawings differ. */
  lit?: PropGlyph;
}

/** A family's drawings by kind. */
export type FamilyGlyphs = Partial<Record<PropKind, PropGlyph>>;

/** The size a piece is drawn at, in its own cells (the context is scaled by its scale). */
export function glyphFit(prop: Pick<DungeonProp, 'kind' | 'size' | 'scale'>): GlyphFit {
  if (prop.size) return { along: prop.size.along / prop.scale, out: prop.size.out / prop.scale };
  const { footprint } = PROP_SPECS[prop.kind];
  return 'reach' in footprint ? { along: footprint.reach * 2, out: footprint.reach * 2 } : { along: footprint.along, out: footprint.out };
}

/**
 * A kind's drawing, on a house's floor (`DungeonFloor.walls === 'edges'`) or elsewhere, its fire
 * burning where it has one and is `lit`; none for a kind not drawn yet.
 */
export function propGlyph(kind: PropKind, inHouse = false, lit = false): PropGlyph | undefined {
  const glyph = PROP_GLYPHS[kind];
  const placed = (inHouse && glyph?.inHouse) || glyph;
  return (lit && placed?.lit) || placed;
}

/** Every kind with a drawing. */
export function drawnPropKinds(): PropKind[] {
  return Object.keys(PROP_GLYPHS) as PropKind[];
}

/** Traces the outline that casts a piece's shadow, at its fit, onto `path`; false for a piece that lies flat or has no drawing. */
export function tracePropSilhouette(prop: Pick<DungeonProp, 'kind' | 'size' | 'scale'>, path: CanvasPath, inHouse = false): boolean {
  const silhouette = propGlyph(prop.kind, inHouse)?.silhouette;
  if (!silhouette) return false;
  silhouette(path, glyphFit(prop));
  return true;
}

/** How tall a piece stands, as a share of a column's shadow; 0 for a kind without a drawing. */
export function propLift(kind: PropKind, inHouse = false): number {
  return propGlyph(kind, inHouse)?.lift ?? 0;
}

/** The outline lighting takes as a wall for a kind; none for what does not block sight. */
export function propTall(kind: PropKind): PropGlyph['tall'] {
  return PROP_GLYPHS[kind]?.tall;
}
