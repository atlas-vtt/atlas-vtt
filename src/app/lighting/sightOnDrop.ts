import { shallow } from 'zustand/vanilla/shallow';
import type { ViewState } from '../types/viewState';
import type { HeldTokens } from '../types/viewUIState';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import { sightOnDropOn } from './sceneLightingOptions';

interface HeldTokenSource {
  getState(): Pick<ViewState, 'objects' | 'heldTokens'> & { setHeldTokens: (held: HeldTokens) => void };
}

/**
 * Notes the tokens the pointer holds (pressed or dragged), or none once it lets go. A token
 * held before keeps the place it was taken from; a new one is noted where it stands now.
 */
export function holdTokens(store: HeldTokenSource, tokenIds: readonly string[]): void {
  const { heldTokens, objects, setHeldTokens } = store.getState();
  const before = Object.keys(heldTokens);
  if (before.length === tokenIds.length && tokenIds.every((id) => heldTokens[id])) return;
  const held: Record<string, Point> = {};
  for (const id of tokenIds) {
    const token = objects.tokens[id];
    const start = heldTokens[id] ?? (token && { x: token.x, y: token.y });
    if (start) held[id] = start;
  }
  setHeldTokens(held);
}

type SceneTokens = { objects: Pick<ViewState['objects'], 'tokens'> } & Pick<ViewState, 'lighting' | 'heldTokens'>;
type Tokens = Record<string, TokenEntity>;

const NONE: HeldTokens = {};

/** The held tokens whose sight and light wait for the drop: all of them, or none with the scene's sight on drop off. */
export function heldForSight({ lighting, heldTokens }: Pick<ViewState, 'lighting' | 'heldTokens'>): HeldTokens {
  return sightOnDropOn(lighting) ? heldTokens : NONE;
}

/** Whether the pointer has moved `token` from the place it was taken at. */
export function movedWhileHeld(token: Pick<TokenEntity, 'id' | 'x' | 'y'>, held: HeldTokens): boolean {
  const start = held[token.id];
  return !!start && (token.x !== start.x || token.y !== start.y);
}

/**
 * The tokens of a scene as its sight and light read them. With sight on drop (`sightOnDropOn`),
 * a token the pointer has moved counts as standing where it was taken: nothing along the way
 * of a drag is seen, lit or remembered, and letting go shows its new place at once. Every move
 * that is not a drag is read as the store holds it.
 *
 * Every held token is read so, also one that neither sees nor carries a light: while only held
 * tokens move, `read` returns the same record, so a view that compares records works nothing
 * out during a drag.
 */
export class SightTokens {
  private last: Tokens | null = null;

  read(state: SceneTokens): Tokens {
    const tokens = this.withHeldAtStart(state.objects.tokens, heldForSight(state));
    this.last = tokens;
    return tokens;
  }

  private withHeldAtStart(tokens: Tokens, held: HeldTokens): Tokens {
    let result = tokens;
    for (const [id, start] of Object.entries(held)) {
      const token = tokens[id];
      if (!token || !movedWhileHeld(token, held)) continue;
      const atStart = { ...token, x: start.x, y: start.y };
      const before = this.last?.[id];
      if (result === tokens) result = { ...tokens };
      // The token as last read is kept while nothing but its place changed, so the record stays the same too.
      result[id] = before && shallow(before, atStart) ? before : atStart;
    }
    return result !== tokens && this.last && sameEntries(this.last, result) ? this.last : result;
  }
}

function sameEntries(a: Tokens, b: Tokens): boolean {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => a[id] === b[id]);
}
