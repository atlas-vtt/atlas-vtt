import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type App } from 'obsidian';
import { CampaignFiles } from '../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER, isCampaignPath } from '../../src/app/campaigns/campaignPaths';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { MAX_USED_SCENES, withScenePlayed } from '../../src/app/campaigns/campaignUsage';
import { parseCampaign } from '../../src/app/campaigns/campaignValidation';
import { readCampaignSystem } from '../../src/app/campaigns/campaignSystem';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const FOLDER = CAMPAIGNS_FOLDER;
const fileText = (entry: Record<string, unknown>): string => `${JSON.stringify({ format: 1, ...entry }, null, 2)}\n`;

type Handler = (...args: unknown[]) => void;

/** An in-memory vault whose events the test sends, as a sync delivering another device's change would. */
function vault(seed: Record<string, string> = {}): { app: App; files: Map<string, string>; campaigns: CampaignFiles; service: CampaignService; emit: (name: string, ...args: unknown[]) => void } {
  const { app, files } = createInMemoryApp({ files: seed });
  const handlers = new Map<string, Handler[]>();
  vi.mocked(app.vault.on).mockImplementation((name: string, handler: Handler) => {
    handlers.set(name, [...(handlers.get(name) ?? []), handler]);
    return {};
  });
  opened.push(app);
  const campaigns = CampaignFiles.open(app);
  return { app, files, campaigns, service: new CampaignService(campaigns), emit: (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); } };
}

const opened: App[] = [];
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  for (const app of opened.splice(0)) CampaignFiles.release(app);
  vi.restoreAllMocks();
});

describe('campaign paths', () => {
  it('are campaign.json directly in a campaign\'s folder, nothing deeper or beside it', () => {
    expect(isCampaignPath(`${FOLDER}/Witherwild/campaign.json`)).toBe(true);
    expect(isCampaignPath(`${FOLDER}/campaign.json`)).toBe(false);
    expect(isCampaignPath(`${FOLDER}/Witherwild/sessions/campaign.json`)).toBe(false);
    expect(isCampaignPath(`${FOLDER}/Witherwild/party.json`)).toBe(false);
    expect(isCampaignPath('atlas-vtt/collections/Witherwild/campaign.json')).toBe(false);
  });
});

describe('reading a campaign', () => {
  it('keeps what it can read and leaves the rest unset, and marks a later format read-only', () => {
    expect(parseCampaign({ id: 'c1', name: '  The Witherwild ', createdAt: 5, worldMap: 'map-1', playtime: 3600 }))
      .toEqual({ id: 'c1', name: 'The Witherwild', createdAt: 5, worldMap: 'map-1', playtime: 3600 });
    expect(parseCampaign({ id: 'c1', name: 'X', createdAt: 'yesterday', lastPlayed: -1, description: 7 })).toEqual({ id: 'c1', name: 'X', createdAt: 0 });
    expect(parseCampaign({ id: 'c1', name: '' })).toBeNull();
    expect(parseCampaign({ id: 'c1', name: 'X', format: 9 })?.readOnly).toBe(true);
  });
});

describe('CampaignFiles', () => {
  it('writes each campaign into a folder of its own, named after it, and lists the most recently played first', async () => {
    const { campaigns, files, service } = vault();
    const first = service.create('The Witherwild', 1);
    const second = service.create('Blue Mouth: Caves', 2);
    await campaigns.flush();
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).toEqual({ format: 1, id: first.id, name: 'The Witherwild', createdAt: 1 });
    expect(JSON.parse(files.get(`${FOLDER}/Blue Mouth- Caves/campaign.json`)!)).toMatchObject({ id: second.id });
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Blue Mouth: Caves', 'The Witherwild']);
  });

  it('reads the campaigns there are, leaving out files that hold none, and lets the lower path hold a duplicated id', async () => {
    const { campaigns, service } = vault({
      [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }),
      [`${FOLDER}/Witherwild (conflicted copy)/campaign.json`]: fileText({ id: 'c1', name: 'Copy', createdAt: 1 }),
      [`${FOLDER}/Broken/campaign.json`]: '{ not json',
      [`${FOLDER}/Notes/readme.md`]: 'Not a campaign.',
    });
    await campaigns.load();
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Witherwild']);
  });

  it('renames the folder with the campaign, keeps fields a newer Atlas wrote, and edits only its own', async () => {
    const { campaigns, files, service } = vault({ [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, party: ['kept'] }) });
    await campaigns.load();
    service.rename('c1', 'The Witherwild');
    service.update('c1', { description: 'Hex crawl', worldMap: 'map-1' });
    await campaigns.flush();
    expect(files.has(`${FOLDER}/Witherwild/campaign.json`)).toBe(false);
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).toEqual({ format: 1, id: 'c1', name: 'The Witherwild', createdAt: 1, party: ['kept'], description: 'Hex crawl', worldMap: 'map-1' });
    service.update('c1', { description: undefined, worldMap: '' });
    await campaigns.flush();
    expect(JSON.parse(files.get(`${FOLDER}/The Witherwild/campaign.json`)!)).not.toHaveProperty('description');
    expect(service.get('c1')).not.toHaveProperty('worldMap');
  });

  it('applies an edit to what the file holds then, so another device\'s field survives', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }) });
    await campaigns.load();
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, worldMap: 'map-from-elsewhere' }));
    service.update('c1', { description: 'Hex crawl' });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).toMatchObject({ worldMap: 'map-from-elsewhere', description: 'Hex crawl' });
  });

  it('leaves a next session day older versions wrote in the file, unread, when other fields are written', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, nextSession: '2026-10-19' }) });
    await campaigns.load();
    expect(service.get('c1')).not.toHaveProperty('nextSession');
    service.update('c1', { description: 'Hex crawl' });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).toMatchObject({ description: 'Hex crawl', nextSession: '2026-10-19' });
  });

  it('follows another device: a campaign arriving, changed, its folder renamed, and deleted', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service, emit } = vault();
    await campaigns.load();
    const heard: number[] = [];
    service.onChange(() => heard.push(heard.length));
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }));
    emit('create', new TFile(path));
    await settle();
    expect(service.list().map((campaign) => campaign.name)).toEqual(['Witherwild']);
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, description: 'Hex crawl' }));
    emit('modify', new TFile(path));
    await settle();
    expect(service.get('c1')?.description).toBe('Hex crawl');
    emit('rename', new TFolder(`${FOLDER}/Moor`), `${FOLDER}/Witherwild`);
    expect(campaigns.pathOf('c1')).toBe(`${FOLDER}/Moor/campaign.json`);
    emit('delete', new TFolder(`${FOLDER}/Moor`));
    expect(service.list()).toEqual([]);
    expect(heard.length).toBeGreaterThanOrEqual(4);
  });

  it('trashes a deleted campaign\'s whole folder, and leaves a later format\'s campaign alone', async () => {
    const { app, campaigns, files, service } = vault({
      [`${FOLDER}/Witherwild/campaign.json`]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }),
      [`${FOLDER}/Witherwild/sessions/001.md`]: 'Recap.',
      [`${FOLDER}/Future/campaign.json`]: fileText({ id: 'c2', name: 'Future', createdAt: 1, format: 7 }),
    });
    await campaigns.load();
    service.delete('c1');
    await campaigns.flush();
    expect(vi.mocked(app.fileManager.trashFile).mock.calls.map(([file]) => file.path)).toEqual([`${FOLDER}/Witherwild`]);
    expect([...files.keys()].some((path) => path.startsWith(`${FOLDER}/Witherwild`))).toBe(false);
    expect(() => service.rename('c2', 'Past')).toThrow();
    service.delete('c2');
    await campaigns.flush();
    expect(files.has(`${FOLDER}/Future/campaign.json`)).toBe(true);
  });

  it('names a campaign uniquely, in any letter case', async () => {
    const { campaigns, service } = vault();
    service.create('Witherwild');
    await campaigns.flush();
    expect(service.nameError('witherwild')).not.toBeNull();
    expect(service.nameError('  ')).not.toBeNull();
    expect(service.nameError('x'.repeat(121))).not.toBeNull();
    expect(service.nameError('Moor')).toBeNull();
  });
});

describe('recording what was played', () => {
  it('reads the last scene and the scenes used, leaving out what cannot be read', () => {
    expect(parseCampaign({
      id: 'c1', name: 'X', createdAt: 1, lastScene: 's1',
      used: { scenes: { s1: { first: 1, last: 5 }, s2: { first: 9, last: 2 }, s3: { first: 'then', last: 3 }, ['x'.repeat(201)]: { first: 1, last: 1 } }, tokens: ['kept'] },
    })).toEqual({ id: 'c1', name: 'X', createdAt: 1, lastScene: 's1', used: { scenes: { s1: { first: 1, last: 5 } } } });
    expect(parseCampaign({ id: 'c1', name: 'X', createdAt: 1, lastScene: 7, used: { scenes: [] } })).toEqual({ id: 'c1', name: 'X', createdAt: 1 });
    expect(parseCampaign({ id: 'c1', name: 'X', createdAt: 1, lastScene: '', used: 'all' })).toEqual({ id: 'c1', name: 'X', createdAt: 1 });
  });

  it('reads no more scenes than it remembers, and forgets the one used longest ago to make room', () => {
    const scenes = Object.fromEntries(Array.from({ length: MAX_USED_SCENES }, (_, index) => [`s${index}`, { first: index + 10, last: index + 10 }]));
    expect(Object.keys(parseCampaign({ id: 'c1', name: 'X', used: { scenes: { ...scenes, extra: { first: 1, last: 1 } } } })!.used!.scenes)).toHaveLength(MAX_USED_SCENES);
    const next = withScenePlayed({ id: 'c1', name: 'X', used: { scenes } }, 'new', 99_999);
    const kept = (next.used as { scenes: Record<string, unknown> }).scenes;
    expect(Object.keys(kept)).toHaveLength(MAX_USED_SCENES);
    expect(kept).not.toHaveProperty('s0');
    expect(kept.new).toEqual({ first: 99_999, last: 99_999 });
  });

  it('writes the scene, when it was first and last played, and the last scene, keeping every other field', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, used: { tokens: { t1: {} }, scenes: { s0: { first: 2, last: 3 } } } }) });
    await campaigns.load();
    expect(service.recordScene('c1', 's1', 100)).toBe(true);
    expect(service.recordScene('c1', 's2', 200)).toBe(true);
    expect(service.recordScene('c1', 's1', 300)).toBe(true);
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).toEqual({
      format: 1, id: 'c1', name: 'Witherwild', createdAt: 1, lastScene: 's1', lastPlayed: 300,
      used: { tokens: { t1: {} }, scenes: { s0: { first: 2, last: 3 }, s1: { first: 100, last: 300 }, s2: { first: 200, last: 200 } } },
    });
    expect(service.get('c1')).toMatchObject({ lastScene: 's1', lastPlayed: 300 });
  });

  it('keeps the last scene another device played later, and still notes the scene', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }) });
    await campaigns.load();
    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, lastScene: 'laptop', lastPlayed: 500, used: 'broken' }));
    service.recordScene('c1', 's1', 400);
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).toMatchObject({ lastScene: 'laptop', lastPlayed: 500, used: { scenes: { s1: { first: 400, last: 400 } } } });
  });

  it('never writes a campaign a newer Atlas saved, or one that is gone', async () => {
    const path = `${FOLDER}/Future/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c2', name: 'Future', createdAt: 1, format: 2 }) });
    await campaigns.load();
    const before = files.get(path);
    expect(service.recordScene('c2', 's1', 100)).toBe(false);
    expect(service.recordScene('gone', 's1', 100)).toBe(false);
    expect(service.recordScene('c2', '', 100)).toBe(false);
    await campaigns.flush();
    expect(files.get(path)).toBe(before);
    expect(withScenePlayed({ id: 'c2', name: 'Future', format: 2 }, 's1', 1)).toEqual({ id: 'c2', name: 'Future', format: 2 });
  });
});

describe('a campaign\'s game system', () => {
  const GRID = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' } as const;
  const SYSTEM = {
    systemPresetId: 'builtin:cairn',
    gridDefaults: GRID,
    conditions: [{ id: 'deprived', name: 'Deprived', color: '#aa5500' }],
    dice: { defaultRoll: '1d20', crit: 'roll-under' },
    resources: [{ key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#22c55e', visibleToPlayers: true }],
  };

  it('is read as a collection\'s rules are, field by field, and left unset where it holds none that can be used', () => {
    expect(readCampaignSystem(SYSTEM)).toMatchObject({ systemPresetId: 'builtin:cairn', conditions: [...SYSTEM.conditions, { id: 'cairn-dead', name: 'Dead', effect: 'no-vision' }], dice: SYSTEM.dice, resources: [{ key: 'hp' }] });
    expect(readCampaignSystem({ ...SYSTEM, dice: { defaultRoll: 'banana', crit: 'never' }, senses: 'all', systemPresetId: 7 })).not.toHaveProperty('dice');
    expect(readCampaignSystem({ ...SYSTEM, senses: 'all', systemPresetId: 7 })).not.toHaveProperty('systemPresetId');
    // An empty list is a system without resources; no list reads its preset's.
    expect(readCampaignSystem({ ...SYSTEM, resources: [] })?.resources).toEqual([]);
    expect(readCampaignSystem({ ...SYSTEM, resources: undefined })).not.toHaveProperty('resources');
    // Default vision keeps the senses it names: which the system knows is decided where it is read.
    expect(readCampaignSystem({ ...SYSTEM, defaultTokenVision: { range: 60, senses: [{ id: 'homebrew-sense' }] } })?.defaultTokenVision).toEqual({ range: 60, senses: [{ id: 'homebrew-sense' }] });
    for (const unusable of [{ ...SYSTEM, gridDefaults: undefined }, { ...SYSTEM, conditions: 'none' }, 'cairn', null]) expect(readCampaignSystem(unusable)).toBeUndefined();
    expect(parseCampaign({ id: 'c1', name: 'X', system: { conditions: [] } })).not.toHaveProperty('system');
  });

  it('is written into the campaign\'s file, changed field by field, keeps what a newer Atlas added, and is removed as a whole', async () => {
    const path = `${FOLDER}/Witherwild/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c1', name: 'Witherwild', createdAt: 1 }) });
    await campaigns.load();
    service.update('c1', { system: SYSTEM as never });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!).system).toEqual(SYSTEM);
    expect(service.get('c1')?.system?.systemPresetId).toBe('builtin:cairn');

    files.set(path, fileText({ id: 'c1', name: 'Witherwild', createdAt: 1, system: { ...SYSTEM, weather: 'from a newer Atlas' } }));
    service.update('c1', { system: { dice: { defaultRoll: '2d6', crit: 'none' }, initiative: undefined } });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!).system).toEqual({ ...SYSTEM, dice: { defaultRoll: '2d6', crit: 'none' }, weather: 'from a newer Atlas' });

    expect(() => service.update('c1', { system: { gridDefaults: undefined } })).toThrow();
    service.update('c1', { system: undefined, description: 'Hex crawl' });
    await campaigns.flush();
    expect(JSON.parse(files.get(path)!)).not.toHaveProperty('system');
    expect(JSON.parse(files.get(path)!)).toMatchObject({ description: 'Hex crawl' });
  });

  it('of a campaign a newer Atlas saved is read and never changed', async () => {
    const path = `${FOLDER}/Future/campaign.json`;
    const { campaigns, files, service } = vault({ [path]: fileText({ id: 'c2', name: 'Future', createdAt: 1, format: 2, system: SYSTEM }) });
    await campaigns.load();
    const before = files.get(path);
    expect(service.get('c2')).toMatchObject({ readOnly: true, system: { systemPresetId: 'builtin:cairn' } });
    expect(() => service.update('c2', { system: undefined })).toThrow();
    expect(() => service.update('c2', { system: { dice: { defaultRoll: '2d6', crit: 'none' } } })).toThrow();
    await campaigns.flush();
    expect(files.get(path)).toBe(before);
  });
});
