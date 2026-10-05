import type { TokenEntity } from '../types';

/** The GM's sight shading and selected-token range rings include hidden vision tokens. */
export function gmSightSource(token: TokenEntity): boolean {
  return !!token.vision?.enabled;
}

/** A source of sight, and an always-shown footprint, in the local player picture. */
export function tableSightSource(token: TokenEntity): boolean {
  return !token.isHidden && gmSightSource(token);
}
