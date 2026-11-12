import { placeAura, type PlacedAura } from '../../measure/auraArea';
import { isAura } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import type { MeasureLook } from './DrawnMeasure';
import { handlesAtPoints, type MeasureHandlePlace } from './measureHandle';
import type { AuraDragSetting } from './measureHandleDrag';

/**
 * Where the auras of the level shown lie now: each around its token as the store has it, which
 * follows a dragged token with every move of the pointer. Asked whenever the tokens or the kept
 * measurements change; an aura whose token stands where it stood answers with the same object, so
 * whoever draws it draws nothing.
 */
export class AuraPlaces {
  private readonly placed = new Map<string, PlacedAura>();

  /**
   * `measure` around its token; null for a measurement that is no aura, and for an aura whose
   * token is not on the map shown (on another level, beside the map, gone): it is drawn with its
   * token or not at all.
   */
  place(measure: KeptMeasure, look: MeasureLook): PlacedAura | null {
    if (!isAura(measure)) return null;
    const token = look.tokens()[measure.follows];
    const placed = token ? placeAura(measure, token, { ...look.grid, snapToGrid: look.map.cells }, look.settings, this.placed.get(measure.id) ?? null) : null;
    if (placed) this.placed.set(measure.id, placed);
    else this.placed.delete(measure.id);
    return placed;
  }

  /**
   * Where the handles of `measure` stand: an aura's around its token as it was last placed, its
   * badge on the rim of the token's space and its far handle on its outline, and none while it has
   * no place; any other measurement's where its points say.
   */
  handlesOf(measure: KeptMeasure): MeasureHandlePlace | null {
    if (!isAura(measure)) return handlesAtPoints(measure);
    const placed = this.placed.get(measure.id);
    return placed ? { origin: placed.handle, end: placed.end } : null;
  }

  /** What the far handle of the aura `measure` is dragged by; null while it has no place. */
  dragSetting(measure: KeptMeasure, { grid, map, settings }: MeasureLook): AuraDragSetting | null {
    const placed = this.placed.get(measure.id);
    return placed ? { placed, grid: { ...grid, snapToGrid: map.cells }, unitDistance: settings.unitDistance } : null;
  }

  /** Forgets the auras that are not among `ids`. */
  keep(ids: ReadonlySet<string>): void {
    for (const id of this.placed.keys()) {
      if (!ids.has(id)) this.placed.delete(id);
    }
  }
}
