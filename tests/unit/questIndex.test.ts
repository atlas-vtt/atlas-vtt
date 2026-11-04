import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { createQuestNote, setQuestStatus } from '../../src/app/campaigns/quests/questNotes';
import { QUEST_ID, readQuest } from '../../src/app/campaigns/quests/questProperties';
import { questBody } from '../../src/app/campaigns/quests/questText';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault } from '../mocks/questVault';

const ID = '0123456789abcdef01234567';
const FILE = { path: 'Quests/Crown.md', basename: 'Crown', created: 1, modified: 2 };

const note = (properties: string, body = 'Find the crown under the root.'): string => `---\n${properties}\n---\n${body}\n`;
const crown = note(`atlas-type: quest\ncampaign: Blood Olms\nkind: main\nstatus: active\nexperience: 300\nrewards:\n  - Favour of the King\nplace:\n  x: 0.25\n  y: 0.5\natlas-id: ${ID}`);

const opened: App[] = [];
function open(app: App): QuestIndex {
  opened.push(app);
  return QuestIndex.open(app);
}

afterEach(() => {
  for (const app of opened.splice(0)) QuestIndex.release(app);
});

const OLMS = { id: 'c-1', name: 'Blood Olms' };
const WITHERWILD = { id: 'c-2', name: 'Witherwild' };
const CAMPAIGNS = [OLMS, WITHERWILD];
const titlesOf = (index: QuestIndex, campaign: { id: string; name: string } = OLMS): string[] => index.of(campaign, CAMPAIGNS).map((quest) => quest.title);

describe('reading a quest note', () => {
  it('reads every property of a quest note, and no place: a pin on the world map places a quest', () => {
    const quest = readQuest(FILE, { 'atlas-type': 'quest', campaign: ' Blood Olms ', kind: 'main', status: 'active', experience: 300, rewards: ['Favour of the King'], place: { x: 0.25, y: 0.5 }, 'atlas-id': ID });
    expect(quest).toEqual({ path: FILE.path, title: 'Crown', campaign: 'Blood Olms', id: ID, kind: 'main', status: 'active', experience: 300, rewards: ['Favour of the King'], created: 1, modified: 2 });
  });

  it('is no quest without the type or a campaign', () => {
    expect(readQuest(FILE, { campaign: 'Blood Olms' })).toBeNull();
    expect(readQuest(FILE, { 'atlas-type': 'statblock', campaign: 'Blood Olms' })).toBeNull();
    expect(readQuest(FILE, { 'atlas-type': 'quest' })).toBeNull();
    expect(readQuest(FILE, { 'atlas-type': 'quest', campaign: ['Blood Olms'] })).toBeNull();
    expect(readQuest(FILE, undefined)).toBeNull();
  });

  it('reads an unknown status as open and leaves every other value it cannot read unset', () => {
    const quest = readQuest(FILE, {
      'atlas-type': 'Quest', campaign: '[[Blood Olms|the olms]]', kind: 'urgent', status: 'abandoned', experience: -5,
      rewards: ['Gold', { a: 1 }, '', 12, ...Array.from({ length: 20 }, (_, n) => `Gem ${n}`)], place: { x: 2, y: 0.5 }, 'atlas-id': 'not-an-id',
    });
    expect(quest).toMatchObject({ campaign: 'Blood Olms', status: 'open', rewards: ['Gold', '12', 'Gem 0', 'Gem 1', 'Gem 2', 'Gem 3', 'Gem 4', 'Gem 5'] });
    expect(quest).not.toHaveProperty('kind');
    expect(quest).not.toHaveProperty('experience');
    expect(quest).not.toHaveProperty('place');
    expect(quest).not.toHaveProperty('id');
    expect(readQuest(FILE, { 'atlas-type': 'quest', campaign: 'X', experience: '1200', rewards: 'One prize' })).toMatchObject({ experience: 1200, rewards: ['One prize'] });
    expect(readQuest(FILE, { 'atlas-type': 'quest', campaign: 'X', experience: 1.5 })).not.toHaveProperty('experience');
  });

  it('reads a frontmatter value that holds itself without walking it', () => {
    const looped: Record<string, unknown> = { x: 0.5 };
    looped.y = looped;
    const rewards: unknown[] = ['A'];
    rewards.push(rewards);
    expect(readQuest(FILE, { 'atlas-type': 'quest', campaign: 'X', place: looped, rewards })).toMatchObject({ rewards: ['A'] });
  });

  it('gives players the text without frontmatter and without the comments the GM wrote for themselves', () => {
    expect(questBody(note('atlas-type: quest', 'The crown lies %%behind the false wall%% under the root.\n\n<!-- the abbot lies -->Ask the [[Abbot]].'))).toBe('The crown lies  under the root.\n\nAsk the [[Abbot]].');
    expect(questBody('No frontmatter.\n%% the rest is the GM\'s')).toBe('No frontmatter.');
  });
});

describe('the quest index', () => {
  it('finds quest notes anywhere in the vault and gives each campaign its own, by name in any case or by id', () => {
    const { app } = questVault({
      'Quests/Crown.md': crown,
      'Elsewhere/Olm eggs.md': note('atlas-type: quest\ncampaign: blood olms\nkind: side'),
      'Elsewhere/By id.md': note('atlas-type: quest\ncampaign: c-1'),
      'Elsewhere/Other.md': note('atlas-type: quest\ncampaign: Witherwild'),
      'Elsewhere/Plain note.md': note('tags: [quest]'),
    });
    const index = open(app);
    expect(titlesOf(index)).toEqual(['Crown', 'By id', 'Olm eggs']);
    expect(titlesOf(index, WITHERWILD)).toEqual(['Other']);
  });

  it('takes in the notes Obsidian loads after Atlas, whose metadata it had cached and reports as created only', () => {
    const vault = questVault({});
    const index = open(vault.app);
    const heard = vi.fn();
    index.onChange(heard);
    expect(titlesOf(index)).toEqual([]);
    vault.files.set('Quests/Crown.md', crown);
    vault.emit('create', vault.app.vault.getAbstractFileByPath('Quests/Crown.md'));
    expect(titlesOf(index)).toEqual(['Crown']);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('reads a name only while it is the name of exactly one campaign', () => {
    const { app } = questVault({ 'Q/Crown.md': crown, 'Q/Moor.md': note('atlas-type: quest\ncampaign: The Moor') });
    const index = open(app);
    const olms = { id: 'c-1', name: 'Rise of the Blood Olms' };
    expect(index.of(olms, [olms]).map((quest) => quest.title)).toEqual([]);
    const moor = { id: 'c-3', name: 'the moor' };
    expect(index.of(moor, [olms, moor]).map((quest) => quest.title)).toEqual(['Moor']);
    const twin = { id: 'c-4', name: 'The Moor' };
    expect(index.of(moor, [olms, moor, twin])).toEqual([]);
  });

  it('follows frontmatter edits, notes made by hand or by sync, renames, folder moves and deletions', async () => {
    const vault = questVault({ 'Quests/Crown.md': crown });
    const index = open(vault.app);
    const changes = vi.fn();
    index.onChange(changes);
    const titles = (): string[] => index.of(OLMS, CAMPAIGNS).map((quest) => `${quest.title}:${quest.status}`);

    vault.write('Quests/Crown.md', crown.replace('status: active', 'status: done'));
    expect(titles()).toEqual(['Crown:done']);
    vault.write('Quests/Eggs.md', note('atlas-type: quest\ncampaign: Blood Olms'));
    expect(titles()).toEqual(['Crown:done', 'Eggs:open']);
    // A body edit is a change too: players read the text. A quest that did not change keeps its object.
    const crownBefore = index.get('Quests/Crown.md');
    const before = changes.mock.calls.length;
    vault.write('Quests/Eggs.md', note('atlas-type: quest\ncampaign: Blood Olms', 'Other words.'));
    expect(changes.mock.calls.length).toBe(before + 1);
    expect(index.get('Quests/Crown.md')).toBe(crownBefore);

    await vault.move('Quests/Eggs.md', 'Quests/Olm eggs.md');
    expect(titles()).toEqual(['Crown:done', 'Olm eggs:open']);
    await vault.move('Quests', 'Archive');
    expect(index.all().map((quest) => quest.path)).toEqual(['Archive/Crown.md', 'Archive/Olm eggs.md']);
    vault.remove('Archive/Crown.md');
    expect(titles()).toEqual(['Olm eggs:open']);
    vault.write('Archive/Olm eggs.md', note('atlas-type: note\ncampaign: Blood Olms'));
    expect(titles()).toEqual([]);
  });

  it('keeps a moved quest while the metadata cache does not know it at its new place yet', async () => {
    const vault = questVault({ 'Quests/Crown.md': crown });
    const index = open(vault.app);
    const getFileCache = vi.mocked(vault.app.metadataCache.getFileCache);
    const real = getFileCache.getMockImplementation()!;
    getFileCache.mockImplementation(() => null);
    await vault.move('Quests', 'Archive');
    expect(index.get('Archive/Crown.md')).toMatchObject({ title: 'Crown', status: 'active', campaign: 'Blood Olms' });
    getFileCache.mockImplementation(real);
    vault.write('Archive/Crown.md', crown.replace('status: active', 'status: done'));
    expect(index.get('Archive/Crown.md')?.status).toBe('done');
  });

  it('reads once at start, and once more only the notes the metadata cache had not read then', () => {
    const vault = questVault({ 'Quests/Crown.md': crown, 'Quests/Eggs.md': note('atlas-type: quest\ncampaign: Blood Olms') });
    const getFileCache = vi.mocked(vault.app.metadataCache.getFileCache);
    const real = getFileCache.getMockImplementation()!;
    getFileCache.mockImplementation((file) => (file.path === 'Quests/Crown.md' ? null : real(file)));
    const index = open(vault.app);
    expect(index.all().map((quest) => quest.title)).toEqual(['Eggs']);
    getFileCache.mockImplementation(real);
    getFileCache.mockClear();
    vault.resolve();
    expect(getFileCache.mock.calls.map(([file]) => file.path)).toEqual(['Quests/Crown.md']);
    expect(index.all().map((quest) => quest.title)).toEqual(['Crown', 'Eggs']);
    getFileCache.mockClear();
    vault.resolve();
    expect(getFileCache).not.toHaveBeenCalled();
  });

  it('writes the status through the note\'s frontmatter, and creates a quest note with an id in the campaign\'s folder', async () => {
    const vault = questVault({ 'Quests/Crown.md': crown });
    const index = open(vault.app);
    await setQuestStatus(vault.app, 'Quests/Crown.md', 'failed');
    expect(index.get('Quests/Crown.md')).toMatchObject({ status: 'failed' });
    expect(vault.files.get('Quests/Crown.md')).toContain('Find the crown under the root.');

    const folder = 'atlas-vtt/campaigns/Blood Olms';
    await createQuestNote(vault.app, folder, 'c-1', 'The sexton: a liar?', 'side');
    const second = await createQuestNote(vault.app, folder, 'c-1', 'The sexton: a liar?', 'main');
    expect(second.path).toBe(`${folder}/quests/The sexton- a liar- 2.md`);
    const made = index.of(OLMS, CAMPAIGNS).filter((quest) => quest.path.startsWith(folder));
    expect(made.map((quest) => [quest.title, quest.kind, quest.status])).toEqual([['The sexton- a liar- 2', 'main', 'open'], ['The sexton- a liar-', 'side', 'open']]);
    for (const quest of made) expect(quest.id).toMatch(QUEST_ID);
    expect(made[0]?.id).not.toBe(made[1]?.id);
  });
});
