import type { TokenEntity } from '../../types';
import { computeTokenPixelSize } from '../token-renderer/tokenSizing';
import type { TokenPerception } from '../../vision/tokenPerception';

/** A token the players do not see now, for the GM's mark on it. */
export interface SightMark {
  tokenId: string;
  /** `unseen`: not perceived at all. `sensed`: the players see only its outline. */
  kind: 'unseen' | 'sensed';
  /** Where the mark sits: on the token's edge, up and to the right. */
  x: number;
  y: number;
}

const CORNER = Math.SQRT1_2;

/**
 * The marks of a lit scene: one for every token the players do not see. A hidden token has none:
 * it carries its own mark, and the players never see it whatever the sight.
 */
export function sightMarks(tokens: Record<string, TokenEntity>, perception: TokenPerception, cellSize: number): SightMark[] {
  const marks: SightMark[] = [];
  for (const token of Object.values(tokens)) {
    if (token.isHidden) continue;
    const perceived = perception(token.id);
    if (perceived === 'seen') continue;
    const radius = computeTokenPixelSize(cellSize, token.size || 1) / 2;
    marks.push({ tokenId: token.id, kind: perceived, x: token.x + radius * CORNER, y: token.y - radius * CORNER });
  }
  return marks;
}
