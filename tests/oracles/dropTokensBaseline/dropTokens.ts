// Frozen from 8b3ddf049d7ad45e70beac62500d80e8bead30fd src/app/storeFactory.ts:770-781 (the dropTokens recipe, as a free function). Only the signature and import paths are adapted.
import { raiseTokens } from '../../../src/app/stores/tokenStacking';
import type { TokenEntity } from '../../../src/app/types';

export interface DropState {
  objects: { tokens: Record<string, TokenEntity> };
  heldTokens: Record<string, { x: number; y: number }>;
  _audioDirty: boolean;
}

export function dropTokens(draft: DropState, positions: readonly { id: string; x: number; y: number }[]): void {
  for (const { id, x, y } of positions) {
    const token = draft.objects.tokens[id];
    if (token) {
      token.x = x;
      token.y = y;
    }
  }
  raiseTokens(draft.objects.tokens, positions.map(({ id }) => id));
  if (Object.keys(draft.heldTokens).length > 0) draft.heldTokens = {};
  draft._audioDirty = true;
}
