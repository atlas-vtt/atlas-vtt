import type { BookQuest } from '../../protocol/index.ts';
import type { PictureAssets } from '../assetAnswers.ts';
import type { PlayedCharacter } from './characters.ts';
import type { QuestAsset } from './questGate.ts';
import type { WorldMapFile } from './worldMapLevels.ts';

/** What one player's book names that they may fetch by hash. */
export interface NamedAssets {
  readonly worldMap: WorldMapFile | null;
  readonly character: PlayedCharacter | null;
  /** The quests the player was last sent. */
  readonly quests: readonly BookQuest[];
  /** A whole text of the statblock the player was last sent, by hash. */
  readonly statblockText?: (hash: string) => Uint8Array<ArrayBuffer> | undefined;
}

/** What a quest's asset is served from, while one of `quests` names it as what it is: its whole text, or an image of its text. */
function questAssetOf(hash: string, quests: readonly BookQuest[], served: (hash: string) => QuestAsset | undefined): QuestAsset | undefined {
  const text = quests.some((quest) => quest.text?.hash === hash);
  const image = quests.some((quest) => quest.images?.some((embedded) => embedded.image.hash === hash) === true);
  if (!text && !image) return undefined;
  const asset = served(hash);
  return asset !== undefined && ('path' in asset ? image : text) ? asset : undefined;
}

/**
 * What an asset only this player's book names is served from, by hash: the world map or a map it
 * leads into, their own character's artwork, a whole text of their own character's statblock as they
 * were last sent it, or the whole text or an image of a quest they were sent. Nothing else.
 */
export function bookAssetOf(hash: string, named: NamedAssets, served: (hash: string) => QuestAsset | undefined): QuestAsset | undefined {
  const map = named.worldMap?.paths.get(hash);
  if (map !== undefined) return { path: map };
  if (named.character !== null && named.character.sheet.art?.hash === hash) return { path: named.character.imagePath };
  const text = named.statblockText?.(hash);
  if (text !== undefined) return { bytes: text };
  return questAssetOf(hash, named.quests, served);
}

/** A book's assets as `AssetAnswers` asks for them: no map or explored memory, its paths as artwork, its bytes as texts. */
export function bookPicture(assetOf: (hash: string, player: string) => QuestAsset | undefined): PictureAssets {
  return {
    map: () => null,
    explored: () => undefined,
    artPath: (hash, player) => {
      const asset = assetOf(hash, player);
      return asset !== undefined && 'path' in asset ? asset.path : undefined;
    },
    text: (hash, player) => {
      const asset = assetOf(hash, player);
      return asset !== undefined && 'bytes' in asset ? asset.bytes : undefined;
    },
  };
}
