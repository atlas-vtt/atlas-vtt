import { placeAura, type PlacedAura } from '../../measure/auraArea';
import { isAura } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import type { MeasureLook } from './DrawnMeasure';
import { handlesAtPoints, measureEndHandlePoint, type MeasureHandlePlace } from './measureHandle';
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
   * Where the handles of `measure` stand. Its badge stands on the rim of the token it lies on
   * (`rims`, by `rimSpots`: the token an aura follows, the token another measurement starts on),
   * so that the token's middle stays the token's; on its origin where it lies on none. An aura's
   * far handle stands on its outline, around its token as it was last placed, and it has no
   * handles while it has no place; any other measurement's far handle stands where its points say.
   */
  handlesOf(measure: KeptMeasure, rims: ReadonlyMap<string, Point>): MeasureHandlePlace | null {
    const rim = rims.get(measure.id);
    if (!isAura(measure)) return rim ? { origin: rim, end: measureEndHandlePoint(measure) } : handlesAtPoints(measure);
    const placed = this.placed.get(measure.id);
    return placed ? { origin: rim ?? placed.handle, end: placed.end } : null;
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
