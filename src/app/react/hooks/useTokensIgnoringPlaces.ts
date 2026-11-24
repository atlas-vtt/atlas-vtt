import { useState } from 'react';
import type { ViewAtlasState } from '../../storeFactory';
import type { TokenEntity } from '../../types';
import { useAtlasStore } from '../ViewStoreContext';

type Tokens = Record<string, TokenEntity>;

const NO_TOKENS: Tokens = {};

/** Whether `next` holds the tokens of `previous` and differs from it in nothing but where they stand (`x`, `y`). */
export function onlyPlacesDiffer(previous: Readonly<Tokens>, next: Readonly<Tokens>): boolean {
  const ids = Object.keys(next);
  if (ids.length !== Object.keys(previous).length) return false;
  for (const id of ids) {
    const before = previous[id];
    const after = next[id];
    if (before === after) continue;
    if (!before || !after) return false;
    // Immer keeps the order of a token's fields; fields in another order count as a change.
    const was: [string, unknown][] = Object.entries(before);
    const now: [string, unknown][] = Object.entries(after);
    if (was.length !== now.length) return false;
    for (let i = 0; i < now.length; i++) {
      const [key, value] = now[i]!;
      const [keyBefore, valueBefore] = was[i]!;
      if (key !== keyBefore || (value !== valueBefore && key !== 'x' && key !== 'y')) return false;
    }
  }
  return true;
}

/**
 * The scene's tokens for what never shows where they stand (the initiative tracker and its cards): the record last
 * handed out for as long as only places changed since, so a token dragged on the map renders none of it at each step.
 * Where a token stands is stale in it. With `enabled` off it reads nothing and gives an empty record.
 */
export function useTokensIgnoringPlaces(enabled = true): Tokens {
  const [select] = useState(() => {
    let last: Tokens | null = null;
    return (state: ViewAtlasState): Tokens => {
      const next = state.objects?.tokens ?? NO_TOKENS;
      if (last !== null && last !== next && onlyPlacesDiffer(last, next)) return last;
      last = next;
      return next;
    };
  });
  return useAtlasStore((state) => (enabled ? select(state) : NO_TOKENS));
}
