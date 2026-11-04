import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignService } from '../../src/app/campaigns/CampaignService';
import { nameQuestCampaigns } from '../../src/app/campaigns/quests/nameQuestCampaigns';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { QUEST_ID } from '../../src/app/campaigns/quests/questProperties';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault, type QuestVault } from '../mocks/questVault';

const KEPT = '0123456789abcdef01234567';
const note = (campaign: string, more = ''): string => `---\natlas-type: quest\ncampaign: ${campaign}\n${more}---\nThe text.\n`;
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const opened: App[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) QuestIndex.release(app);
});

/** A vault with these notes, its quest index, campaigns kept in memory and the id writer, as the plugin opens them. */
function setUp(files: Record<string, string>, campaigns = [{ id: 'c-1', name: 'Blood Olms', createdAt: 1 }, { id: 'c-2', name: 'Witherwild', createdAt: 2 }]): { vault: QuestVault; service: CampaignService; index: QuestIndex; stop: () => void } {
  const vault = questVault(files);
  opened.push(vault.app);
  const storage = memoryCampaigns(campaigns);
  const index = QuestIndex.open(vault.app);
  const stop = nameQuestCampaigns(vault.app, storage, index);
  return { vault, service: new CampaignService(storage), index, stop };
}

describe('a quest note that names its campaign by name', () => {
  it('is given the campaign\'s id in its place, and an id of its own in the same write', async () => {
    const { vault, service, index } = setUp({
      'Notes/Eggs.md': note('"[[blood olms]]"'),
      'Notes/Crown.md': note('Blood Olms', `atlas-id: ${KEPT}\n`),
      'Notes/By id.md': note('c-2'),
    });
    await settle();
    expect(vault.files.get('Notes/Eggs.md')).toContain('campaign: c-1');
    expect(index.get('Notes/Eggs.md')?.id).toMatch(QUEST_ID);
    expect(vault.files.get('Notes/Eggs.md')).toContain('The text.');
    expect(vault.files.get('Notes/Crown.md')).toContain(`atlas-id: ${KEPT}`);
    expect(vault.files.get('Notes/Crown.md')).toContain('campaign: c-1');
    expect(vault.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
    const olms = service.get('c-1');
    if (olms === undefined) throw new Error('no campaign');
    expect(index.of(olms, service.list()).map((quest) => quest.title).sort()).toEqual(['Crown', 'Eggs']);
  });

  it('stays as it is while its name is no campaign\'s, or several\'s, and belongs to none until it is', async () => {
    const twins = [{ id: 'c-1', name: 'Blood Olms', createdAt: 1 }, { id: 'c-3', name: 'blood olms', createdAt: 3 }];
    const { vault, service, index } = setUp({ 'Notes/Moor.md': note('The Moor'), 'Notes/Twin.md': note('Blood Olms') }, twins);
    await settle();
    expect(vault.app.fileManager.processFrontMatter).not.toHaveBeenCalled();
    expect(vault.files.get('Notes/Twin.md')).toContain('campaign: Blood Olms');
    const list = service.list();
    for (const campaign of list) expect(index.of(campaign, list)).toEqual([]);

    // A campaign made later under the name the note names takes it.
    service.create('The Moor', 4);
    await settle();
    const moor = service.list().find((campaign) => campaign.name === 'The Moor');
    expect(vault.files.get('Notes/Moor.md')).toContain(`campaign: ${moor?.id ?? ''}`);
  });

  it('is never touched by a campaign\'s rename once it names the campaign by id', async () => {
    const { vault, service, index } = setUp({ 'Notes/Eggs.md': note('Blood Olms') });
    await settle();
    const writes = vi.mocked(vault.app.fileManager.processFrontMatter).mock.calls.length;
    service.rename('c-1', 'Rise of the Blood Olms');
    await settle();
    expect(vi.mocked(vault.app.fileManager.processFrontMatter).mock.calls.length).toBe(writes);
    const list = service.list();
    const olms = list.find((campaign) => campaign.id === 'c-1');
    if (olms === undefined) throw new Error('no campaign');
    expect(index.of(olms, list).map((quest) => quest.title)).toEqual(['Eggs']);
  });

  it('is tried once per version of the note: a write that fails waits for the note to change', async () => {
    const { vault, stop } = setUp({});
    const process = vi.mocked(vault.app.fileManager.processFrontMatter);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    process.mockRejectedValueOnce(new Error('locked'));
    vault.write('Notes/Eggs.md', note('Blood Olms'));
    await settle();
    expect(process).toHaveBeenCalledTimes(1);
    vault.write('Notes/Other.md', note('Witherwild', `atlas-id: ${KEPT}\n`));
    await settle();
    expect(process.mock.calls.filter(([file]) => file.path === 'Notes/Eggs.md')).toHaveLength(1);
    vault.write('Notes/Eggs.md', note('Blood Olms', 'kind: side\n'));
    await settle();
    expect(vault.files.get('Notes/Eggs.md')).toContain('campaign: c-1');
    stop();
    error.mockRestore();
  });
});
