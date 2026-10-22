import { TFile } from 'obsidian';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { CharacterFiles } from '../../src/app/campaigns/partyValues/CharacterFiles';
import { partyKey } from '../../src/app/campaigns/partyValues/partyKeys';
import { PartySync } from '../../src/app/campaigns/partyValues/PartySync';
import { resourceUpdate } from '../../src/app/resources/resourceValues';
import type { TokenAsset } from '../../src/app/services/AssetService';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import type { TokenInput } from '../../src/app/types/viewState';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

/** A campaign and the folder it lives in, as the party tests use them. */
export const CAMPAIGN = 'c1';
export const CAMPAIGN_FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
export const CHARACTERS_PATH = `${CAMPAIGN_FOLDER}/characters.json`;

export const campaignFile = (extra: Record<string, unknown> = {}): string =>
  `${JSON.stringify({ format: 1, id: CAMPAIGN, name: 'Witherwild', createdAt: 1, ...extra }, null, 2)}\n`;

/** Library tokens: two player characters (Ayla with a second form) and a monster. */
export const LIBRARY = [
  { id: 'pc-ayla', type: 'token', name: 'Ayla', imagePath: 'tokens/ayla.png', playerCharacter: true, statblockPath: 'Party/Ayla.md', createdAt: 1 },
  // Another form of Ayla: a player character linking her note, made later
  { id: 'pc-ayla-bear', type: 'token', name: 'Ayla (bear)', imagePath: 'tokens/ayla-bear.png', playerCharacter: true, statblockPath: 'Party/Ayla.md', createdAt: 2 },
  { id: 'pc-bram', type: 'token', name: 'Bram', imagePath: 'tokens/bram.png', playerCharacter: true },
  { id: 'goblin', type: 'token', name: 'Goblin', imagePath: 'tokens/goblin.png' },
] as unknown as TokenAsset[];

export const hpKey = (character: string): string => partyKey(CAMPAIGN, character, 'hp');

/** A token placed from a library token with the given hit points. */
export const placed = (assetId: string, hp: number, x = 0): TokenInput => ({
  kind: 'character', x, y: 0, imagePath: `tokens/${assetId.replace('pc-', '')}.png`, assetId, name: assetId,
  resources: { hp: { current: hp, max: 20 } },
} as TokenInput);

export interface PartyDevice {
  vault: InMemoryApp;
  campaigns: CampaignFiles;
  characters: CharacterFiles;
  sync: PartySync;
  play: CampaignPlay;
  stores: ViewAtlasStore[];
  /** Opens a view store that joins the sync. */
  openView(): ViewAtlasStore;
  /** Sets a token's hit points as the GM's edit. */
  setHp(store: ViewAtlasStore, tokenId: string, hp: number): void;
  /** Settles once the sync has read the files. */
  ready: Promise<void>;
  release(): void;
}

/** A device: its vault with the campaign, the campaign played, and the sync over it. */
export function partyDevice(files: Record<string, string> = { [`${CAMPAIGN_FOLDER}/campaign.json`]: campaignFile() }, playing: string | null = CAMPAIGN): PartyDevice {
  const vault = createInMemoryApp({ files });
  const { app } = vault;
  const campaigns = CampaignFiles.open(app);
  const characters = new CharacterFiles(app);
  const play = CampaignPlay.forApp(app);
  if (playing !== null) play.play(playing);
  const ready = campaigns.load().then(() => characters.load());
  const sync = new PartySync({ app, campaigns, play, characters, tokens: () => LIBRARY, ready });
  const stores: ViewAtlasStore[] = [];
  return {
    vault, campaigns, characters, sync, play, stores, ready,
    openView: () => {
      const store = createViewAtlasStore(app, `party-view-${stores.length}-${Math.random()}`);
      stores.push(store);
      sync.registerStore(`view-${stores.length}`, store);
      return store;
    },
    setHp: (store, tokenId, hp) => {
      const token = store.getState().objects.tokens[tokenId]!;
      store.getState().updateToken(tokenId, resourceUpdate(token, 'hp', { current: hp, max: token.resources?.hp?.max ?? 20 }, false));
    },
    release: () => {
      sync.destroy();
      characters.destroy();
      CampaignFiles.release(app);
    },
  };
}

/** Tells the device's vault that a file changed, as Obsidian does when a sync wrote it. */
export function fileChanged(device: PartyDevice, path: string): void {
  device.vault.emit('modify', new TFile(path));
}

/** Lets queued reads and writes of the vault run. */
export const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
