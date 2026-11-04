import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignFiles } from '../../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../../src/app/campaigns/campaignPaths';
import { CampaignPlayers } from '../../../src/app/campaigns/players/CampaignPlayers';
import { emptyPlayers, withPlayer } from '../../../src/app/campaigns/players/playersFile';
import { readTokenAssignments, withCarriedAssignments, withPlayerTokens, withTokenOwners } from '../../../src/app/campaigns/players/tokenAssignments';
import { carryAssignmentsOver, readLegacyAssignments } from '../../../src/app/online/gm/legacyAssignments';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const MAP = 'Scenes/Cave.atlasmap';
const FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
const campaignText = `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`;

describe('the tokens a campaign\'s players file assigns', () => {
  it('are written beside the players, who stay as they were, and an empty field is left out', () => {
    const file = withPlayer(emptyPlayers('c1'), { id: ANA, name: 'Ana', code: '123456', characters: ['hero'] }, 1);
    const given = withPlayerTokens(withTokenOwners(file, ['gm-1', 'gm-2'], ANA), MAP, ['gm-1'], true);
    expect(given).toMatchObject({ players: file.players, tokenOwners: { 'gm-1': ANA, 'gm-2': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } });
    const taken = withTokenOwners(given, ['gm-1', 'gm-2'], null);
    expect(taken).not.toHaveProperty('tokenOwners');
    expect(readTokenAssignments(taken)).toEqual({ owners: {}, playerTokens: { [MAP]: { 'gm-1': true } } });
  });

  it('are read only where they can be trusted', () => {
    const file = {
      ...emptyPlayers('c1'),
      tokenOwners: { 'gm-1': ANA, 'gm-2': 'nobody', 'gm-3': 7, ['x'.repeat(300)]: ANA },
      playerTokens: { [MAP]: { 'gm-1': true, 'gm-2': 'yes', ['x'.repeat(300)]: true }, 'Scenes/Empty.atlasmap': { 'gm-3': 1 }, ['p'.repeat(1001)]: { 'gm-4': true }, 'Scenes/Bad.atlasmap': [] },
    };
    expect(readTokenAssignments(file)).toEqual({ owners: { 'gm-1': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } });
    expect(readTokenAssignments({ ...emptyPlayers('c1'), tokenOwners: 'garbage', playerTokens: 3 })).toEqual({ owners: {}, playerTokens: {} });
  });

  it('are never written into a file of a later format', () => {
    const newer = { ...emptyPlayers('c1'), format: 99 };
    expect(withTokenOwners(newer, ['gm-1'], ANA)).toBe(newer);
    expect(withPlayerTokens(newer, MAP, ['gm-1'], true)).toBe(newer);
  });

  it('take carried ones in only where the file assigns nothing yet', () => {
    const file = withPlayerTokens(withTokenOwners(emptyPlayers('c1'), ['gm-1'], ANA), MAP, ['gm-1'], false);
    const carried = withCarriedAssignments(file, { owners: { 'gm-1': BEN, 'gm-2': BEN }, playerTokens: { [MAP]: { 'gm-1': true, 'gm-2': true } } });
    expect(readTokenAssignments(carried)).toEqual({ owners: { 'gm-1': ANA, 'gm-2': BEN }, playerTokens: { [MAP]: { 'gm-1': false, 'gm-2': true } } });
  });
});

describe('the token owners and player tokens an older Atlas kept on this device', () => {
  const opened: ReturnType<typeof createInMemoryApp>[] = [];
  afterEach(() => {
    for (const vault of opened.splice(0)) {
      CampaignPlayers.release(vault.app);
      CampaignFiles.release(vault.app);
    }
    vi.restoreAllMocks();
  });

  async function players(): Promise<{ vault: ReturnType<typeof createInMemoryApp>; files: CampaignPlayers }> {
    const vault = createInMemoryApp({ files: { [`${FOLDER}/campaign.json`]: campaignText } });
    opened.push(vault);
    await CampaignFiles.open(vault.app).load();
    const files = CampaignPlayers.open(vault.app);
    await files.whenLoaded();
    return { vault, files };
  }

  it('are read from the data file, without the players and characters versions before them kept there', () => {
    expect(readLegacyAssignments({ players: { [ANA]: { name: 'Ana' } }, characters: { hero: ANA }, owners: { 'gm-1': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } }))
      .toEqual({ owners: { 'gm-1': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } });
  });

  it('go into the campaign\'s players file, which is written with them', async () => {
    const { vault, files } = await players();
    const old = readLegacyAssignments({ owners: { 'gm-1': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } });
    expect(await carryAssignmentsOver(old, files, 'c1')).toBe(true);
    expect(JSON.parse(vault.files.get(`${FOLDER}/players.json`) ?? '{}')).toMatchObject({ campaignId: 'c1', tokenOwners: { 'gm-1': ANA }, playerTokens: { [MAP]: { 'gm-1': true } } });
  });

  it('stay on the device when the campaign\'s file was not written', async () => {
    const { vault, files } = await players();
    vi.spyOn(vault.app.vault, 'create').mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await carryAssignmentsOver(readLegacyAssignments({ owners: { 'gm-1': ANA } }), files, 'c1')).toBe(false);
  });
});
