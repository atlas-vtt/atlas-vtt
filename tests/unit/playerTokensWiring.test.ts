import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { CampaignPlayers } from '../../src/app/campaigns/players/CampaignPlayers';
import { withPlayer } from '../../src/app/campaigns/players/playersFile';
import { sideOf } from '../../src/app/initiative/sides';
import { registerPlayerTokens } from '../../src/app/plugin/playerTokens';
import { AssetService } from '../../src/app/services/AssetService';
import { RECORD_KEY } from '../../src/app/services/library/recordFile';
import type { TokenEntity } from '../../src/app/types';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const FEN = 'atlas-vtt/collections/Fen';
const CAMPAIGN = `${CAMPAIGNS_FOLDER}/Witherwild`;
const record = (id: string): Record<string, unknown> => ({
  format: 1, id, type: 'token', name: id, imagePath: `${FEN}/tokens/${id}.webp`, tags: [], collection: 'Fen', createdAt: 1, modifiedAt: 1,
});
const placed = (id: string): TokenEntity => ({ id: `placed-${id}`, kind: 'token', x: 0, y: 0, imagePath: `${FEN}/tokens/${id}.webp`, assetId: id });
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

const unloads: (() => void)[] = [];

/** A vault with two library tokens and a campaign, wired as the plugin wires it at start. */
async function plugin(): Promise<{ app: Plugin['app']; assets: AssetService; players: CampaignPlayers; refreshAssets: () => void; unload: () => void }> {
  AssetService.resetInstance();
  const vault = createInMemoryApp({
    files: {
      'atlas-vtt/library.json': JSON.stringify({ defaultCollectionId: 'Fen', vaultId: 'vault-a' }),
      [`${FEN}/collection.json`]: JSON.stringify({ uid: 'uid-fen', version: 1, tags: {}, settings: {}, createdAt: 1, modifiedAt: 1 }),
      ...Object.fromEntries(['ranger', 'wolf'].flatMap((id) => [
        [`${FEN}/tokens/${id}.webp`, 'IMG'],
        [`${FEN}/tokens/${id}.json`, JSON.stringify({ [RECORD_KEY]: record(id) })],
      ])),
      [`${CAMPAIGN}/campaign.json`]: `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`,
    },
    folders: ['atlas-vtt/collections'],
  });
  const { app } = vault;
  const campaigns = CampaignFiles.open(app);
  const players = CampaignPlayers.open(app);
  const cleanups: (() => void)[] = [];
  const events = new Map<string, () => void>();
  vi.mocked(app.workspace.on).mockImplementation(((name: string, callback: () => void) => {
    events.set(name, callback);
    return {};
  }) as never);
  const read = campaigns.load().then(() => players.whenLoaded());
  registerPlayerTokens({ app, registerEvent: () => undefined, register: (cleanup: () => void) => cleanups.push(cleanup) } as unknown as Plugin, players, read);
  await read;
  await settle();
  const unload = (): void => {
    for (const cleanup of cleanups.splice(0)) cleanup();
    CampaignPlay.forApp(app).stop();
    CampaignPlayers.release(app);
    CampaignFiles.release(app);
  };
  unloads.push(unload);
  return { app, assets: AssetService.getInstance(app), players, refreshAssets: () => events.get('atlas-vtt:refresh-assets')?.(), unload };
}

afterEach(() => {
  for (const unload of unloads.splice(0)) unload();
  AssetService.resetInstance();
});

describe('the players\' tokens as the plugin knows them', () => {
  it('takes a token for the players\' once its library token is made a player character, until Atlas unloads', async () => {
    const { assets, refreshAssets, unload } = await plugin();
    expect(sideOf(placed('ranger'))).toBe('opponents');

    await assets.setPlayerCharacters(['ranger'], true);
    refreshAssets();
    expect([sideOf(placed('ranger')), sideOf(placed('wolf'))]).toEqual(['players', 'opponents']);

    await assets.setPlayerCharacters(['ranger'], false);
    refreshAssets();
    expect(sideOf(placed('ranger'))).toBe('opponents');

    await assets.setPlayerCharacters(['ranger'], true);
    refreshAssets();
    unload();
    expect(sideOf(placed('ranger'))).toBe('opponents');
  });

  it('takes a character given to a player of the campaign this device plays, on every scene, while it plays it', async () => {
    const { app, players } = await plugin();
    players.change('c1', (stored) => withPlayer(stored, { id: 'abcdefghijklmnopqrst', name: 'Mira', code: '123456', characters: ['wolf'] }, 5));
    expect(sideOf(placed('wolf'))).toBe('opponents');

    CampaignPlay.forApp(app).play('c1');
    expect([sideOf(placed('wolf')), sideOf(placed('ranger'))]).toEqual(['players', 'opponents']);

    CampaignPlay.forApp(app).stop();
    expect(sideOf(placed('wolf'))).toBe('opponents');
  });
});
