/**
 * When a change of the fog fades. The fog's picture is drawn anew for many reasons; only an edit
 * of the fog it already shows moves from the old picture to the new one over a fade.
 */

/**
 * What the picture does with fog drawn anew: `fade` from what it shows to it; `follow`, which
 * shows it at once and lets a fade that runs go on towards it; or `cut`, which shows it at once
 * and ends such a fade.
 */
export type FogPictureStep = 'fade' | 'follow' | 'cut';

export interface FogPictureChange {
  /** The fog of the level shown was edited (a stroke, a choice of its menu, the whole map, undo and redo, another view): not a load, and not another level. */
  readonly edit: boolean;
  /** The picture already shows fog of this map and level, on a canvas of the size it has now. */
  readonly continues: boolean;
  /** The fog is the record the picture shows. */
  readonly sameFog: boolean;
  /** The canvas shows a stroke under way, which is live: committed, it is what the canvas shows already; dropped, it goes at once. */
  readonly stroke: boolean;
  /** Whether the renderer can mix two pictures. */
  readonly canMix: boolean;
  readonly reducedMotion: boolean;
}

export function fogPictureStep(change: FogPictureChange): FogPictureStep {
  if (!change.continues) return 'cut';
  if (change.sameFog || change.stroke) return 'follow';
  if (!change.edit) return 'cut';
  return change.canMix && !change.reducedMotion ? 'fade' : 'cut';
}
