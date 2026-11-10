import type { App } from 'obsidian';
import { isPlayerCharacter } from '../../../characters/playerCharacters';
import { characterRest } from '../../../recovery/characterRest';
import type { AllyRests } from '../../../recovery/restWrites';
import { AssetService, type TokenAsset } from '../../../services/AssetService';

/** Another player character an action may be taken for: its library token id and name. */
export interface PaneAlly {
  readonly id: string;
  readonly name: string;
}

/** The player characters a rest from the note panel may reach, and how to read each one when the rest is written. */
export interface PaneAllies {
  /** By name. */
  readonly list: readonly PaneAlly[];
  /** The ids of `list`, for `checkRest`. */
  readonly ids: ReadonlySet<string>;
  /** Each ally ready to rest, read afresh; null for anyone not in `list` or no longer readable. */
  readonly rests: AllyRests;
}

/** The character a note is, ready to rest, where it is a native note (`characterRest`). */
function restOf(app: App, notePath: string): ReturnType<AllyRests> {
  return characterRest(app, notePath);
}

/**
 * The other player characters of `resting`'s collection whose statblock is a native note, one per
 * note (a character's forms are one character, `characterOf`), as the asset index and the notes
 * hold them now: whom the GM's note panel offers an action taken "for another" to.
 */
export function paneAllies(app: App, resting: TokenAsset): PaneAllies {
  const notes = new Set(AssetService.getInstance(app).loadedTokenAssets().flatMap((asset) => (
    isPlayerCharacter(asset) && asset.collection === resting.collection && asset.statblockPath !== undefined && asset.statblockPath !== resting.statblockPath
      ? [asset.statblockPath] : []
  )));
  const allies = [...notes].flatMap((path) => {
    const rest = restOf(app, path);
    return rest && rest.asset.id !== resting.id ? [{ path, asset: rest.asset }] : [];
  }).sort((a, b) => a.asset.name.localeCompare(b.asset.name) || a.asset.id.localeCompare(b.asset.id));
  const byId = new Map(allies.map((ally) => [ally.asset.id, ally.path]));
  return {
    list: allies.map(({ asset }) => ({ id: asset.id, name: asset.name })),
    ids: new Set(byId.keys()),
    rests: (id) => {
      const path = byId.get(id);
      return path === undefined ? null : restOf(app, path);
    },
  };
}
