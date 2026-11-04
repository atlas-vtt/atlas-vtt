import type { DungeonModel, PropKind } from '../../../src/app/dungeons/model';

/**
 * One family's specimen for the glyph sheets (`dungeonGlyphSheets.gpu.test.ts`): every kind it
 * draws, a crowded group as recipes place them, and whole scenes for families that are no props.
 * A file `glyphSheets/<family>.ts` exports one as `SPECIMEN`.
 */
export interface GlyphSpecimen {
  family: string;
  /** Every kind of the family at 0° and 90°, stretched kinds at their shortest and longest; each is also checked alone. */
  pieces: readonly SpecimenPiece[];
  /** Pieces as recipes group them (a table with its chairs, a bed with its chest), each at its place in the group. */
  crowded: readonly SpecimenPiece[];
  scenes?: readonly SpecimenScene[];
}

export interface SpecimenPiece {
  kind: PropKind;
  /** Radians; 0 faces up (towards −y). */
  rotation: number;
  /** Where a stretched piece is drawn longer than its footprint, in cells. */
  size?: { along: number; out: number };
  /** Stands with its back against the wall behind it (the wall its +y side faces at this rotation); a wall piece always hangs on one. */
  against?: 'wall';
  /** In a crowded group: the corner of the piece's cells (a disc's centre), in cells from the group's corner. */
  at?: { x: number; y: number };
}

/** A whole model to draw for families that are no props (cave ground, ways, floor cover): generated or hand-built. */
export interface SpecimenScene {
  name: string;
  model: () => DungeonModel;
  floor: number;
  window?: { x: number; y: number; cells: number; rows: number };
}
