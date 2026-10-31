import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { CampaignPlay } from '../../src/app/campaigns/campaignPlay';
import { QuestIndex } from '../../src/app/campaigns/quests/QuestIndex';
import { QUEST_ID } from '../../src/app/campaigns/quests/questProperties';
import { MAX_BOOK_QUESTS, MAX_MAP_TITLE, MAX_QUEST_BODY, parsePlayerBook } from '../../src/app/online/protocol/index.ts';
import type { HandedQuest } from '../../src/app/online/gm/book/questGate';
import { StoredQuests } from '../../src/app/online/gm/book/storedQuests';
import { fakeStoring } from './online/gm/fakeStoring';
import { campaignQuestGate } from '../../src/app/plugin/campaignQuestGate';
import { memoryCampaigns } from '../mocks/memoryCampaigns';
import { questVault, type QuestVault } from '../mocks/questVault';

const KEPT = '0123456789abcdef01234567';
const note = (properties: string, body = ''): string => `---\natlas-type: quest\n${properties}\n---\n${body}\n`;

const opened: App[] = [];

/** A vault with these notes, its quest index, two campaigns, and the gate players' books ask. */
function setUp(files: Record<string, string>, created: Record<string, number> = {}): { vault: QuestVault; play: CampaignPlay; quests: () => Promise<readonly HandedQuest[]>; gate: ReturnType<typeof campaignQuestGate> } {
  const vault = questVault(files, created);
  opened.push(vault.app);
  const index = QuestIndex.open(vault.app);
  const storage = memoryCampaigns([{ id: 'c-1', name: 'Blood Olms', createdAt: 1 }, { id: 'c-2', name: 'Witherwild', createdAt: 2 }]);
  const play = CampaignPlay.forApp(vault.app);
  const gate = campaignQuestGate(vault.app, () => play, () => storage, () => index);
  return { vault, play, quests: () => gate.quests(), gate };
}

afterEach(() => {
  for (const app of opened.splice(0)) QuestIndex.release(app);
});

describe('the quests players are sent', () => {
  it('are none while no campaign is played, and the played campaign\'s quest notes in the book\'s order', async () => {
    const { play, quests } = setUp({
      'Q/Crown.md': note(`campaign: Blood Olms\nkind: main\nstatus: active\nexperience: 300\nrewards: [Favour of the King]\nplace: { x: 0.25, y: 0.5 }\natlas-id: ${KEPT}`, 'Find the crown.'),
      'Q/Eggs.md': note('campaign: Blood Olms\nkind: side', 'Bring three eggs.'),
      'Q/Old.md': note('campaign: Blood Olms\nkind: main\nstatus: done'),
      'Q/Other.md': note('campaign: Witherwild'),
    });
    expect(await quests()).toEqual([]);
    play.play('c-1');
    const sent = await quests();
    expect(sent.map((quest) => [quest.title, quest.kind, quest.state])).toEqual([['Crown', 'main', 'active'], ['Eggs', 'side', 'open'], ['Old', 'main', 'done']]);
    expect(sent[0]).toEqual({ id: KEPT, kind: 'main', state: 'active', title: 'Crown', body: 'Find the crown.', place: null, xp: 300, rewards: ['Favour of the King'] });
    // The page reads them as they are.
    expect(parsePlayerBook({ character: null, worldMap: null, items: [], notes: [], pins: [], quests: sent, purse: [] })?.quests).toEqual(sent);
  });

  it('gives a note without an id one, written into its frontmatter once, and a copy of another note one of its own', async () => {
    const { vault, play, quests } = setUp({
      'Q/Crown.md': note(`campaign: Blood Olms\natlas-id: ${KEPT}`),
      'Q/Crown copy.md': note(`campaign: Blood Olms\natlas-id: ${KEPT}`),
      'Q/Eggs.md': note('campaign: Blood Olms'),
    }, { 'Q/Crown.md': 1, 'Q/Crown copy.md': 5, 'Q/Eggs.md': 2 });
    play.play('c-1');
    const first = await quests();
    const idOf = (title: string, list: readonly HandedQuest[]): string | undefined => list.find((quest) => quest.title === title)?.id;
    expect(idOf('Crown', first)).toBe(KEPT);
    expect(idOf('Crown copy', first)).toMatch(QUEST_ID);
    expect(idOf('Crown copy', first)).not.toBe(KEPT);
    expect(idOf('Eggs', first)).toMatch(QUEST_ID);
    expect(vault.files.get('Q/Eggs.md')).toContain(`atlas-id: ${idOf('Eggs', first)}`);
    expect(vault.files.get('Q/Crown.md')).toContain(`atlas-id: ${KEPT}`);

    // Asked again, every quest keeps its id and nothing is written.
    const process = vi.mocked(vault.app.fileManager.processFrontMatter);
    const writes = process.mock.calls.length;
    expect(await quests()).toEqual(first);
    expect(process.mock.calls.length).toBe(writes);
  });

  it('sends the text without the GM\'s comments, cuts what is longer than a book holds, and holds no more quests than a book', async () => {
    const files: Record<string, string> = {
      'Q/Long.md': note(`campaign: Blood Olms\nrewards:\n  - ${'Gold '.repeat(40)}\n  - Silver`, `Read this. %%The GM's secret.%%\n\n${'word '.repeat(1000)}`),
      [`Q/${'A very long title '.repeat(10)}.md`]: note('campaign: Blood Olms'),
    };
    for (let n = 0; n < MAX_BOOK_QUESTS + 5; n++) files[`Q/Many ${String(n).padStart(3, '0')}.md`] = note('campaign: Blood Olms\nkind: side\nstatus: done');
    const { play, quests, gate } = setUp(files);
    play.play('c-1');
    const sent = await quests();
    expect(sent).toHaveLength(MAX_BOOK_QUESTS);
    const long = sent.find((quest) => quest.title === 'Long');
    expect(long?.body.startsWith('Read this.\n\nword word')).toBe(true);
    expect(long?.body).not.toContain('secret');
    expect([...(long?.body ?? '')].length).toBeLessThanOrEqual(MAX_QUEST_BODY);
    expect([...(long?.body ?? '')].length).toBeGreaterThan(MAX_QUEST_BODY - 10);
    expect(long?.rewards).toHaveLength(2);
    expect([...(long?.rewards[0] ?? '')].length).toBeLessThanOrEqual(MAX_MAP_TITLE);
    expect(sent.some((quest) => quest.title.startsWith('A very long title') && [...quest.title].length <= MAX_MAP_TITLE)).toBe(true);
    const stored = await new StoredQuests(fakeStoring(), (hash) => gate.asset(hash)).of(sent);
    expect(parsePlayerBook({ character: null, worldMap: null, items: [], notes: [], pins: [], quests: stored, purse: [] })?.quests).toHaveLength(MAX_BOOK_QUESTS);
  });

  it('may be others once a quest note changes or another campaign is played', async () => {
    const { vault, play, quests, gate } = setUp({ 'Q/Crown.md': note(`campaign: Blood Olms\natlas-id: ${KEPT}`, 'Find the crown.') });
    const changed = vi.fn();
    const stop = gate.onChange(changed);
    play.play('c-1');
    expect(changed).toHaveBeenCalledTimes(1);
    vault.write('Q/Crown.md', note(`campaign: Blood Olms\natlas-id: ${KEPT}`, 'The crown is gone.'));
    expect(changed).toHaveBeenCalledTimes(2);
    expect((await quests())[0]?.body).toBe('The crown is gone.');
    play.play('c-2');
    expect(await quests()).toEqual([]);
    expect(changed).toHaveBeenCalledTimes(3);
    stop();
    play.stop();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('reads again only the notes that changed, and hands on the same list while none of the played campaign\'s quests changed', async () => {
    const { vault, play, quests } = setUp({
      'Q/Crown.md': note(`campaign: Blood Olms\natlas-id: ${KEPT}`, 'Find the crown.'),
      'Q/Eggs.md': note('campaign: Blood Olms\natlas-id: 0123456789abcdef0123456a', 'Bring three eggs.'),
      'Q/Other.md': note('campaign: Witherwild'),
    });
    play.play('c-1');
    const first = await quests();
    const read = vi.mocked(vault.app.vault.cachedRead);
    read.mockClear();
    vault.write('Q/Other.md', note('campaign: Witherwild', 'Elsewhere.'));
    expect(await quests()).toBe(first);
    expect(read).not.toHaveBeenCalled();

    vault.write('Q/Eggs.md', note('campaign: Blood Olms\natlas-id: 0123456789abcdef0123456a', 'Bring four eggs.'));
    const second = await quests();
    expect(second).not.toBe(first);
    expect(second.map((quest) => quest.body)).toEqual(['Find the crown.', 'Bring four eggs.']);
    expect(second[0]).toBe(first[0]);
    expect(read.mock.calls.map(([file]) => file.path)).toEqual(['Q/Eggs.md']);
  });
});
