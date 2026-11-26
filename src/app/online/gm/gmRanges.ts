import { MAX_MARK_RANGE_RINGS, MAX_RANGE_REACH, MAX_RANGE_TEXT, type RangeMarksState, type RangePlace, type RangeRingState } from '../protocol/index.ts';
import type { RangeOrigin } from '../../measure/rangeOutline';
import type { RangeMarksShown } from '../../pixi/measure/measurements';
import { originKept, playersSeeMeasure, type MeasureOrigin, type TokenSeen } from '../../vision/measureOrigin';

const placeOf = ({ x, y, size }: RangeOrigin): RangePlace => (size === undefined ? { x, y } : { x, y, size });

/** The text of a ring or the check as players are told it, cut to what the words allow. */
const cut = (text: string): string => text.slice(0, MAX_RANGE_TEXT);

/**
 * The GM's range marks (the rings of Ranges, the range check) as the players' picture shows them,
 * by the rule a measurement is shown by (`playersSeeMeasure`): never while the GM measures for
 * themselves, and a mark that stands on tokens only while the players see every one of them, and
 * never one first shown while they did not. What a mark stands on is taken when it is first shown
 * on those tokens, by what these players see then.
 */
export class GmRanges {
  private marks: RangeMarksShown | null = null;
  /** What the rings and the check stood on when they were first shown on their tokens. */
  private rings: MeasureOrigin | null = null;
  private check: MeasureOrigin | null = null;

  /** Takes the marks as they stand; `seen` says which tokens the players see now, asked only of marks on other tokens. */
  follow(marks: RangeMarksShown | null | undefined, seen: () => TokenSeen): void {
    this.marks = marks ?? null;
    const { rings, check } = this.marks ?? {};
    this.rings = rings ? originKept(this.rings, rings.tokenIds, seen) : null;
    this.check = check ? originKept(this.check, check.tokenIds, seen) : null;
  }

  /** What the players are told of the marks now, by `seen`; undefined where they see none. */
  shown(seen: TokenSeen): RangeMarksState | undefined {
    const marks = this.marks;
    if (marks === null || marks.hidden) return undefined;
    const sees = (origin: MeasureOrigin | null): boolean => origin !== null && playersSeeMeasure({ origin }, seen);
    const { rings, check } = marks;
    const told: RangeRingState[] = rings && sees(this.rings)
      ? rings.rings.slice(0, MAX_MARK_RANGE_RINGS).filter((ring) => ring.reach > 0 && ring.reach <= MAX_RANGE_REACH)
        .map((ring) => ({ reach: ring.reach, label: cut(ring.label), ...(ring.color !== null && { color: ring.color }) }))
      : [];
    const shownRings = rings && told.length > 0 ? { at: placeOf(rings.at), rings: told } : undefined;
    const shownCheck = check && sees(this.check) ? { from: placeOf(check.from), to: placeOf(check.to), text: cut(check.text) } : undefined;
    if (shownRings === undefined && shownCheck === undefined) return undefined;
    return { ...(shownRings && { rings: shownRings }), ...(shownCheck && { check: shownCheck }), ...(marks.loose && { loose: true }) };
  }

  /** Forgets every mark: another scene. */
  reset(): void {
    this.marks = null;
    this.rings = null;
    this.check = null;
  }
}
