import type { PlacedAura } from '../../measure/auraArea';
import { isAura, isFollower } from '../../measure/keptMeasures';
import type { KeptMeasure } from '../../measure/measureTypes';
import type { Point } from '../../types/visionTypes';
import { cssColorToHexNumber } from '../utils/colorUtils';
import { DrawnMeasure, type MeasureLook, type MeasureSurfaces } from './DrawnMeasure';
import { MeasureMorph } from './measureMorph';
import { MeasurePresence } from './measurePresence';

export const colorOf = (color: string | null | undefined): number | null => (color ? cssColorToHexNumber(color) : null);

/**
 * One kept measurement on the map with the motion it is drawn with: how far it is on the map
 * (`presence`, as it comes and goes), and, carried by an undo or redo, its way from the points it
 * showed to its own (`MeasureMorph`). One that goes with a token (an aura, a grouped measurement)
 * never morphs: it is drawn with its token (`DrawnMeasure.shift`), which shows its own way.
 */
export class KeptDrawing {
  readonly drawn: DrawnMeasure;
  readonly presence: MeasurePresence;
  private readonly morph: MeasureMorph;
  private kept: KeptMeasure | null = null;
  private placed: PlacedAura | null = null;

  /** `look` is read at every frame of a morph, after which `painted` hears of it. */
  constructor(surfaces: MeasureSurfaces, private readonly look: () => MeasureLook, painted: (drawn: DrawnMeasure) => void) {
    this.drawn = new DrawnMeasure(surfaces);
    this.presence = new MeasurePresence((presence) => this.drawn.present(presence));
    this.morph = new MeasureMorph((points) => {
      this.paint(points, this.look());
      painted(this.drawn);
    });
  }

  /** The measurement drawn; null before the first `draw`. */
  get measure(): KeptMeasure | null {
    return this.kept;
  }

  /** Where it lies around its token, an aura; null for every other measurement. */
  get aura(): PlacedAura | null {
    return this.placed;
  }

  /** The points it is drawn at on its way to its own (`MeasureMorph`); null while it stands where it is. */
  get wayPoints(): readonly Point[] | null {
    return this.morph.points;
  }

  /** The token it goes with, as an aura or grouped with it; null for every other measurement. */
  get token(): string | null {
    const measure = this.kept;
    return measure && (isAura(measure) || isFollower(measure)) ? measure.follows : null;
  }

  /**
   * Draws `measure`, an aura lying where `aura` places it. `travelled`: an undo or redo carried it
   * here, and a measurement of its own moves there from where it was drawn.
   */
  draw(measure: KeptMeasure, aura: PlacedAura | null, look: MeasureLook, travelled: boolean): void {
    const before = this.morph.points ?? this.kept?.points ?? null;
    this.morph.stop();
    this.kept = measure;
    this.placed = aura;
    this.paint(measure.points, look);
    if (travelled && before && this.token === null) this.morph.start(before, measure.points);
  }

  /** Fades out; `gone` once it has. */
  leave(gone: () => void): void {
    this.morph.stop();
    this.presence.exit(gone);
  }

  destroy(): void {
    this.morph.stop();
    this.presence.stop();
    this.drawn.destroy();
  }

  private paint(points: readonly Point[], look: MeasureLook): void {
    const measure = this.kept;
    if (!measure) return;
    const shown = points === measure.points ? measure : { ...measure, points: [...points] };
    this.drawn.draw(shown, colorOf(measure.color), look, measure.walls !== false, this.placed, measure.effect ? { effect: measure.effect, seed: measure.id } : null);
  }
}
