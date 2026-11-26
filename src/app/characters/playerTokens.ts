import type { TokenEntity } from '../types';

/** What names a placed token to whoever knows whose it is. */
export type PlayerTokenRef = Partial<Pick<TokenEntity, 'id' | 'assetId' | 'imagePath'>>;

/**
 * Whoever knows which tokens are the players' by more than a token holds itself (the library's
 * player characters, what a campaign's players were given), and says when that changed.
 */
export interface PlayerTokenSource {
  isPlayers(token: PlayerTokenRef): boolean;
  subscribe(listener: () => void): () => void;
}

const listeners = new Set<() => void>();
let source: PlayerTokenSource | null = null;
let stopListening: (() => void) | null = null;
let revision = 0;

function changed(): void {
  revision++;
  for (const listener of [...listeners]) listener();
}

/** Names the source, or none: then no token is a player's by anything but what it holds itself. */
export function setPlayerTokenSource(next: PlayerTokenSource | null): void {
  stopListening?.();
  source = next;
  stopListening = next?.subscribe(changed) ?? null;
  changed();
}

/** Whether the token is a player's by what the source knows of it; without a source none is. */
export function isPlayersToken(token: PlayerTokenRef): boolean {
  return source?.isPlayers(token) ?? false;
}

/** A number that changes whenever the answers may have: what a list drawn from them is kept by. */
export function playerTokensRevision(): number {
  return revision;
}

export function subscribePlayerTokens(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
