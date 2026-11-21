import type { Container } from 'pixi.js';
import type { RangeRing } from '../../measure/rangeRings';
import type { TokenGrid } from '../../measure/tokenDistance';
import type { MeasureLook } from '../../pixi/measure/DrawnMeasure';
import { RangeCheck } from '../../pixi/measure/RangeCheck';
import { RangeRings } from '../../pixi/measure/RangeRings';
import type { MeasureInkLayer } from '../../pixi/utils/measureInk';
import type { RangeMarksState } from '../protocol/index.ts';
import type { RemoteMeasure } from './remoteMeasurePorts.ts';
import { colourNumber } from './toldMeasures.ts';

/** One sender's range marks, and what each was last drawn from: told again the same, it is not drawn anew. */
interface Drawn {
  readonly rings: RangeRings;
  readonly check: RangeCheck;
  ringsKey: string;
  checkKey: string;
  /** What the rings were shaped by: other rules shape them anew, a new zoom only inks them again. */
  shapedBy: Pick<MeasureLook, 'grid' | 'settings'> | null;
  told: RangeMarksState;
  colour: number;
}

/** Whether `drawn` was shaped by the rules `look` has. */
const shapedAlike = ({ shapedBy }: Drawn, look: MeasureLook): boolean => shapedBy?.grid === look.grid && shapedBy.settings === look.settings;

/** The grid a sender's marks are measured on: tokens stand anywhere where it says so. */
const gridOf = (told: RangeMarksState, look: MeasureLook): TokenGrid => ({ ...look.grid, ...(told.loose && { snapToGrid: false }) });

/**
 * The range marks a sender tells beside its measurements (the GM's: the rings of Ranges and the
 * range check), drawn as Atlas draws its own (`RangeRings`, `RangeCheck`): rings in their own
 * colours or the sender's, the check in the sender's with the distance it was told. Rings are
 * shaped by the map's rules as the reader knows them, round where tokens stand anywhere.
 */
export class RemoteRanges {
  private readonly drawn = new Map<string, Drawn>();

  /** Their lines go onto `shapes`, their labels into `labels`. */
  constructor(private readonly shapes: MeasureInkLayer, private readonly labels: Container) {}

  /** Every sender's range marks as they stand now; a sender that tells none has none. `look` null: the rules are not known, and nothing shows. */
  update(measures: readonly RemoteMeasure[], look: MeasureLook | null): void {
    const told = look === null ? [] : measures.flatMap(({ who, color, ranges }) => (ranges ? [{ who, colour: colourNumber(color), ranges }] : []));
    const present = new Set(told.map((entry) => entry.who));
    for (const [who, drawn] of this.drawn) if (!present.has(who)) this.remove(who, drawn);
    if (look === null) return;
    for (const { who, colour, ranges } of told) {
      const drawn = this.drawn.get(who) ?? this.add(who, ranges, colour);
      // Another colour or other rules draw both anew.
      const anew = drawn.colour !== colour || !shapedAlike(drawn, look);
      drawn.told = ranges;
      drawn.colour = colour;
      const inColour: MeasureLook = { ...look, accent: colour };
      const ringsKey = JSON.stringify([ranges.rings ?? null, ranges.loose === true]);
      if (anew || ringsKey !== drawn.ringsKey) this.shapeRings(drawn, inColour, ringsKey);
      const checkKey = JSON.stringify([ranges.check ?? null, ranges.loose === true]);
      if (anew || checkKey !== drawn.checkKey) {
        drawn.checkKey = checkKey;
        if (ranges.check) drawn.check.show(ranges.check, gridOf(ranges, look), inColour, ranges.check.text);
        else drawn.check.clear();
      }
    }
  }

  /** The zoom or the rules changed: every mark is inked again as told, lines and labels at their size on screen; rings are shaped anew only by other rules. */
  rescale(look: MeasureLook | null): void {
    if (look === null) return;
    for (const drawn of this.drawn.values()) {
      const inColour: MeasureLook = { ...look, accent: drawn.colour };
      if (!shapedAlike(drawn, look)) this.shapeRings(drawn, inColour, drawn.ringsKey);
      else drawn.rings.redraw(inColour);
      drawn.check.redraw(gridOf(drawn.told, look), inColour);
    }
  }

  clear(): void {
    for (const [who, drawn] of this.drawn) this.remove(who, drawn);
  }

  private add(who: string, told: RangeMarksState, colour: number): Drawn {
    const drawn: Drawn = { rings: new RangeRings(this.shapes, this.labels), check: new RangeCheck(this.shapes, this.labels), ringsKey: '', checkKey: '', shapedBy: null, told, colour };
    this.drawn.set(who, drawn);
    return drawn;
  }

  /** Works the rings out around their place as told, by the rules of `look`. */
  private shapeRings(drawn: Drawn, look: MeasureLook, key: string): void {
    const { told, rings } = drawn;
    drawn.ringsKey = key;
    drawn.shapedBy = { grid: look.grid, settings: look.settings };
    if (!told.rings) {
      rings.clear();
      return;
    }
    const each: RangeRing[] = told.rings.rings.map(({ reach, label, color }) => ({ name: label, label, reach, color: color ?? null }));
    rings.show(told.rings.at, each, gridOf(told, look), look);
  }

  private remove(who: string, drawn: Drawn): void {
    this.drawn.delete(who);
    drawn.rings.destroy();
    drawn.check.destroy();
  }
}
