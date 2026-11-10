import { isPlayerCharacter, libraryTokenOf, type PlacedTokenSource } from '../characters/playerCharacters';
import type { TokenAsset } from '../services/AssetService';

/** A token placed on a scene, as far as a party's faces need it. */
export interface PlacedFace extends PlacedTokenSource {
  ringColor?: string;
}

/** A player character who stood on a scene: its library token, drawn as the scene drew it. */
export interface PartyMember {
  /** The library token's id. */
  id: string;
  name: string;
  /** The art to show: the record's thumbnail, else its image. */
  artPath: string;
  showRing: boolean;
  /** The ring colour of the first token placed from it on the scene. */
  ringColor?: string;
}

/**
 * The player characters among the tokens placed on a scene, once each, in the order they stand
 * there: each placed token is resolved to its library token (`libraryTokenOf`), and only the
 * players' characters (`isPlayerCharacter`) are kept.
 */
export function partyOf(placed: readonly PlacedFace[], tokens: readonly TokenAsset[]): PartyMember[] {
  const members = new Map<string, PartyMember>();
  for (const token of placed) {
    const record = libraryTokenOf(token, tokens);
    if (!record || !isPlayerCharacter(record) || members.has(record.id)) continue;
    members.set(record.id, {
      id: record.id,
      name: record.name,
      artPath: record.thumbnailPath ?? record.imagePath,
      showRing: record.showRing !== false,
      ...(token.ringColor !== undefined && { ringColor: token.ringColor }),
    });
  }
  return [...members.values()];
}
