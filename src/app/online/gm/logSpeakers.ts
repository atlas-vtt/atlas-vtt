import { GM_AUTHOR, MAX_SPEAKER_NAME, shownLine, type AssetRef } from '../protocol/index.ts';
import type { TokenEntity } from '../../types';
import { ASSET_USES, type AssetStoring } from './assets/assetUses.ts';
import { tokenLabel } from './atlasView.ts';
import type { SpokenAs } from './log/TableLog.ts';
import { ringColour } from './scenePicture.ts';
import type { VaultImage } from './TokenShare.ts';

/** What a speaker is looked up in: the shared scene's tokens and the list players were last sent. */
export interface SpeakerScene {
  readonly tokens: Readonly<Record<string, TokenEntity>>;
  /** The GM id of a token in that list, by the id players know it by. */
  listedToken(alias: string): string | undefined;
  /** The id players know a token by, while it is in that list. */
  listedAlias(tokenId: string): string | undefined;
  ownerOf(tokenId: string): string | undefined;
}

/** The longest artwork path a speaker keeps. */
const MAX_ART_PATH = 1000;

/**
 * The tokens authors speak as in the log. The GM may speak as any token of the shared scene (an NPC
 * players do not see too: a whisper as it is the GM's choice), by its id; a player only as a token of
 * theirs in the list they were sent, not hidden now, by the id players know it by. A speaker is named
 * as the token's nameplate reads, and carries its artwork by its stored id, read and hashed once per path.
 */
export class LogSpeakers {
  private readonly art = new Map<string, Promise<AssetRef | null>>();

  constructor(private readonly readImage: (path: string) => Promise<VaultImage | null>, private readonly stored?: AssetStoring) {}

  async speaker(who: string, key: string, scene: SpeakerScene): Promise<SpokenAs | null> {
    const tokenId = who === GM_AUTHOR ? (Object.hasOwn(scene.tokens, key) ? key : undefined) : scene.listedToken(key);
    const token = tokenId === undefined ? undefined : scene.tokens[tokenId];
    if (tokenId === undefined || token === undefined) return null;
    if (who !== GM_AUTHOR && (token.isHidden === true || scene.ownerOf(tokenId) !== who)) return null;
    const name = shownLine(tokenLabel(token), MAX_SPEAKER_NAME);
    if (name === null) return null;
    const path = token.imagePath !== undefined && token.imagePath !== '' && token.imagePath.length <= MAX_ART_PATH ? token.imagePath : null;
    const art = path === null ? null : await this.refOf(path);
    return {
      speaker: { name, token: scene.listedAlias(tokenId) ?? null, art, ring: token.showRing === true ? ringColour(token.ringColor) : null },
      art: art === null ? null : path,
    };
  }

  /** Forgets every artwork: a new scene reads it afresh. */
  clear(): void {
    this.art.clear();
  }

  private refOf(path: string): Promise<AssetRef | null> {
    let ref = this.art.get(path);
    if (ref === undefined) {
      ref = this.readImage(path).then((image) => (image === null || this.stored === undefined ? null : this.stored.refOf(image.bytes, image.mime, ASSET_USES.art, path))).catch(() => null);
      this.art.set(path, ref);
    }
    return ref;
  }
}
