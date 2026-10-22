import { afterEach, describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { CampaignFiles } from '../../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../../src/app/campaigns/campaignPaths';
import { CampaignPlayers } from '../../../src/app/campaigns/players/CampaignPlayers';
import { withLink, withPlayer } from '../../../src/app/campaigns/players/playersFile';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
const campaignText = `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`;
const ID = 'abcdefghijklmnopqrst';
const MIRA = { id: ID, name: 'Mira', code: '123456', characters: ['tok1'] };

const opened: ReturnType<typeof createInMemoryApp>[] = [];
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

async function device(files: Record<string, string> = { [`${FOLDER}/campaign.json`]: campaignText }): Promise<{ vault: ReturnType<typeof createInMemoryApp>; players: CampaignPlayers }> {
  const vault = createInMemoryApp({ files });
  opened.push(vault);
  await CampaignFiles.open(vault.app).load();
  const players = CampaignPlayers.open(vault.app);
  await players.whenLoaded();
  return { vault, players };
}

afterEach(() => {
  for (const vault of opened.splice(0)) {
    CampaignPlayers.release(vault.app);
    CampaignFiles.release(vault.app);
  }
});

describe('CampaignPlayers', () => {
  it('creates players.json in the campaign\'s folder when a change finds none', async () => {
    const { vault, players } = await device();
    expect(players.of('c1')).toEqual({ link: null, players: [], writable: true });
    expect(players.change('c1', (stored) => withPlayer(stored, MIRA, 5))).toBe(true);
    await players.flush();
    expect(JSON.parse(vault.files.get(`${FOLDER}/players.json`)!)).toMatchObject({ format: 1, campaignId: 'c1', players: { [ID]: { name: 'Mira', code: '123456', characters: ['tok1'], addedAt: 5 } } });
    expect(players.of('c1').players).toEqual([MIRA]);
  });

  it('changes the file it has, keeping what it holds', async () => {
    const { vault, players } = await device();
    players.change('c1', (stored) => withLink(stored, 'a'.repeat(26)));
    players.change('c1', (stored) => withPlayer(stored, MIRA, 5));
    await players.flush();
    expect(JSON.parse(vault.files.get(`${FOLDER}/players.json`)!)).toMatchObject({ link: 'a'.repeat(26), players: { [ID]: { name: 'Mira' } } });
    expect(players.of('c1').link).toBe('a'.repeat(26));
  });

  it('reads a file that was already there, and says a later format is not writable', async () => {
    const later = `${JSON.stringify({ format: 2, campaignId: 'c1', players: {} })}\n`;
    const { vault, players } = await device({ [`${FOLDER}/campaign.json`]: campaignText, [`${FOLDER}/players.json`]: later });
    expect(players.of('c1').writable).toBe(false);
    expect(players.change('c1', (stored) => withPlayer(stored, MIRA))).toBe(false);
    await players.flush();
    expect(vault.files.get(`${FOLDER}/players.json`)).toBe(later);
  });

  it('refuses a campaign that has no folder', async () => {
    const { vault, players } = await device();
    expect(players.change('nowhere', (stored) => withPlayer(stored, MIRA))).toBe(false);
    await players.flush();
    expect([...vault.files.keys()].some((path) => path.endsWith('players.json'))).toBe(false);
  });

  it('follows the campaign\'s folder when it is renamed', async () => {
    const { vault, players } = await device();
    players.change('c1', (stored) => withPlayer(stored, MIRA, 5));
    await players.flush();
    const moved = `${CAMPAIGNS_FOLDER}/Witherwild Moor`;
    await vault.app.vault.adapter.rename(FOLDER, moved);
    vault.emit('rename', new TFolder(moved), FOLDER);
    await settle();
    expect(players.of('c1').players).toEqual([MIRA]);
    players.change('c1', (stored) => withLink(stored, 'b'.repeat(26)));
    await players.flush();
    expect(JSON.parse(vault.files.get(`${moved}/players.json`)!).link).toBe('b'.repeat(26));
    expect(vault.files.has(`${FOLDER}/players.json`)).toBe(false);
  });
});
