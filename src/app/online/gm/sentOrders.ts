import { MAX_ANNOTATION_ORDER } from '../protocol/index.ts';

/** The least room between two numbers that a new one is still put between; with less, every number is given anew. */
const LEAST_GAP = 1e-6;

/**
 * The places in the one order of drawings and texts as one audience is told them: numbers of
 * their own, never the GM's. The GM's numbers count what players are not told too (what the GM
 * keeps to themselves, what fog covers, what lies in rooms nobody has seen), so a gap in them
 * says that something was made there.
 *
 * Here what is told is numbered by itself, in the GM's order: 1, 2, 3 and on. An entry keeps its
 * number for as long as it is told, since a page draws an entry anew whose number is another; one
 * that comes on top gets the next whole number, and one that comes in between (shown after it
 * was hidden, uncovered, moved in the order) a number between its neighbours'. Only where those
 * leave no room is everything numbered anew.
 */
export class SentOrders {
  private known = new Map<string, number>();

  /** The number each of `ids` is told with; `ids` in the GM's order, lowest first. */
  of(ids: readonly string[]): number[] {
    const had = ids.map((id) => this.known.get(id));
    const kept = longestRising(had);
    const numbers = new Array<number>(ids.length);
    let fits = true;
    for (let from = 0; from < ids.length;) {
      if (kept[from]) {
        numbers[from] = had[from]!;
        from += 1;
        continue;
      }
      let to = from;
      while (to < ids.length && !kept[to]) to += 1;
      const below = from > 0 ? numbers[from - 1] : undefined;
      const above = to < ids.length ? had[to] : undefined;
      const count = to - from;
      for (let index = 0; index < count; index += 1) {
        if (above === undefined) numbers[from + index] = Math.floor(below ?? 0) + 1 + index;
        else if (below === undefined) numbers[from + index] = Math.ceil(above) - count + index;
        else numbers[from + index] = below + ((above - below) * (index + 1)) / (count + 1);
      }
      if (below !== undefined && above !== undefined && (above - below) / (count + 1) < LEAST_GAP) fits = false;
      from = to;
    }
    const given = fits && numbers.every((number) => Math.abs(number) <= MAX_ANNOTATION_ORDER) ? numbers : ids.map((_, index) => index + 1);
    this.known = new Map(ids.map((id, index) => [id, given[index]!]));
    return given;
  }

  clear(): void {
    this.known.clear();
  }
}

/** Which of `values` belong to one longest run of numbers that only rise (those without a number never do): the entries that keep theirs. */
function longestRising(values: readonly (number | undefined)[]): boolean[] {
  /** The index of the last entry of the best run of each length, and for each entry the one before it in its run. */
  const ends: number[] = [];
  const before = new Array<number>(values.length).fill(-1);
  values.forEach((value, index) => {
    if (value === undefined) return;
    let low = 0;
    let high = ends.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (values[ends[middle]!]! < value) low = middle + 1;
      else high = middle;
    }
    before[index] = low > 0 ? ends[low - 1]! : -1;
    ends[low] = index;
  });
  const kept = new Array<boolean>(values.length).fill(false);
  for (let index = ends.length > 0 ? ends[ends.length - 1]! : -1; index >= 0; index = before[index]!) kept[index] = true;
  return kept;
}
