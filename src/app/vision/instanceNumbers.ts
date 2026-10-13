/** A token a picture shows, with what groups it (its art) and what orders it among the tokens that come into view together. */
export interface TokenInView {
  readonly id: string;
  readonly art: string;
  readonly rank: number;
}

/** Which number each token in view shows, and how many tokens of each art are in view. */
export interface InstanceNumbers {
  readonly numbers: ReadonlyMap<string, { readonly art: string; readonly number: number }>;
  readonly counts: ReadonlyMap<string, number>;
}

/** No token in view. */
export const NO_INSTANCE_NUMBERS: InstanceNumbers = Object.freeze({ numbers: new Map(), counts: new Map() });

/** Finite ranks first, smallest first; the others after them. Ties keep the list's order (a stable sort). */
function byRank(a: TokenInView, b: TokenInView): number {
  const finiteA = Number.isFinite(a.rank);
  const finiteB = Number.isFinite(b.rank);
  if (finiteA && finiteB) return a.rank - b.rank;
  return finiteA === finiteB ? 0 : finiteA ? -1 : 1;
}

/** The entries of `inView`, the first of each id only. */
function firstOfEachId(inView: readonly TokenInView[]): TokenInView[] {
  const listed = new Set<string>();
  const tokens: TokenInView[] = [];
  for (const token of inView) {
    if (listed.has(token.id)) continue;
    listed.add(token.id);
    tokens.push(token);
  }
  return tokens;
}

function sameTokensInView(previous: InstanceNumbers, inView: readonly TokenInView[]): boolean {
  return inView.length === previous.numbers.size && inView.every(({ id, art }) => previous.numbers.get(id)?.art === art);
}

/**
 * Numbers the tokens a picture shows. `inView` lists only those; a token the picture only outlines is
 * not in it and holds no number. A token that was in `previous` with the same art keeps its number. Any
 * other, one that was not shown in the previous pass (whatever it was in between) or whose art changed,
 * takes the smallest number free among the tokens of its art, by rank, then input order. `art` is
 * compared exactly: tokens with the same string, `''` included, are one group. Returns `previous` itself
 * while the same tokens with the same art are in view.
 */
export function numberTokensInView(previous: InstanceNumbers, inView: readonly TokenInView[]): InstanceNumbers {
  const tokens = firstOfEachId(inView);
  if (sameTokensInView(previous, tokens)) return previous;
  const taken = new Map<string, Set<number>>();
  const entries = new Map<string, { readonly art: string; readonly number: number }>();
  const newcomers: TokenInView[] = [];
  for (const token of tokens) {
    const before = previous.numbers.get(token.id);
    if (before?.art !== token.art) {
      newcomers.push(token);
      continue;
    }
    entries.set(token.id, before);
    taken.set(token.art, (taken.get(token.art) ?? new Set()).add(before.number));
  }
  for (const { id, art } of newcomers.sort(byRank)) {
    const held = taken.get(art) ?? new Set<number>();
    let number = 1;
    while (held.has(number)) number++;
    entries.set(id, { art, number });
    taken.set(art, held.add(number));
  }
  const numbers = new Map<string, { readonly art: string; readonly number: number }>();
  const counts = new Map<string, number>();
  for (const { id, art } of tokens) {
    const entry = entries.get(id);
    if (!entry) continue;
    numbers.set(id, entry);
    counts.set(art, (counts.get(art) ?? 0) + 1);
  }
  return { numbers, counts };
}

/** The number a token's badge shows: none unless badges are on and two or more tokens of its art are in view. */
export function badgeNumberInView(numbers: InstanceNumbers, tokenId: string, badgesOn: boolean): number | null {
  const entry = numbers.numbers.get(tokenId);
  if (!badgesOn || !entry || (numbers.counts.get(entry.art) ?? 0) < 2) return null;
  return entry.number;
}
