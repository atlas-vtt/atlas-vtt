import { tokenLabel, type WorkScene } from './atlasView.ts';
import type { KnownPlayer, Ownership } from './ownership.ts';
import { seeAsPlayers } from './playerTokenVision.ts';

/** A player token of a scene, or a token a player was given there, as the GM's panels list it. */
export interface PlayerTokenRow {
  readonly tokenId: string;
  /** What the GM calls the token. */
  readonly label: string;
  /** The player the GM gave it to, or null while the GM gave it to nobody. */
  readonly owner: KnownPlayer | null;
}

/** The player tokens of a scene, with who has each. */
export function playerTokenRows(ownership: Ownership, scene: WorkScene | null): PlayerTokenRow[] {
  if (scene === null) return [];
  const { tokens } = scene.store.getState().objects;
  return ownership.seats(scene.mapPath, tokens).flatMap(({ tokenId, owner }) => {
    const token = tokens[tokenId];
    return token === undefined ? [] : [{ tokenId, label: tokenLabel(token), owner }];
  });
}

/** Makes tokens of a scene player tokens, or the GM's own; a token that becomes a player token sees from then on (`seeAsPlayers`). */
export function markTokens(ownership: Ownership, scene: WorkScene | null, tokenIds: readonly string[], player: boolean): void {
  if (scene === null || tokenIds.length === 0 || !ownership.canMark()) return;
  if (player) seeAsPlayers(scene.store, tokenIds, (id, token) => !ownership.isPlayerToken(scene.mapPath, id, token));
  ownership.markPlayerTokens(scene.mapPath, tokenIds, scene.store.getState().objects.tokens, player);
}

/** Gives tokens of a scene to a player, or takes them back (null); a token nobody had sees from then on (`seeAsPlayers`). */
export function giveTokens(ownership: Ownership, scene: WorkScene | null, tokenIds: readonly string[], playerId: string | null): void {
  if (scene !== null && playerId !== null && ownership.nameOf(playerId) !== null) seeAsPlayers(scene.store, tokenIds, (id, token) => ownership.ownerOf(id, token) === undefined);
  ownership.give(tokenIds, scene?.store.getState().objects.tokens ?? {}, playerId);
}
