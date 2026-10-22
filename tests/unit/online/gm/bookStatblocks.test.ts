import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PLAYERS, parseGmMessage, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import { BOOK_POLL_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, CAL, cave, delivered, MIRA_ART, ofType, openTable, traffic, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { StatblockNotes, templateOf } from './statblockNotes.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
// The GM's marks draw with PIXI over Atlas's canvas, which a table of books has no use for.
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
/** The campaign also has Cal, who joins the table later. */
const WITH_CAL = [...PLAYERS, { id: CAL, name: 'Cal' }];
const BRANNOCH_NOTE = 'Characters/Brannoch.md';
const MIRA_NOTE = 'Characters/Mira.md';
const SECRET = 'The idol lies under the altar';
const BODY = 'What only the GM reads of Brannoch.';
const STORY = `Brannoch grew up by the sea. ${'He sailed, and he fought, and he sailed again. '.repeat(20)}The end.`;

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'speed', label: 'Speed', type: 'text' },
  { key: 'story', label: 'Story', type: 'markdown' },
  { key: 'secret', label: 'Secret', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }] } },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' },
  { id: 'story001', type: 'text', field: 'story' },
  { id: 'secret01', type: 'stat', field: 'secret', look: 'run-in' },
  { id: 'list0001', type: 'entries', field: 'actions' },
];
const TEMPLATE: StatblockTemplate = { ...templateOf(FIELDS, BLOCKS), players: { secret: 'hidden' } };

const note = (name: string, speed: string): string => [
  '---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, `name: ${name}`, `speed: ${speed}`, `story: ${JSON.stringify(STORY)}`, `secret: ${SECRET}`,
  'actions:', '  - name: Cleave', '    desc: Hits twice.', '    cost: Action', '---', BODY, '',
].join('\n');

/** The statblocks a player's page was sent, as it reads them, in order: null where one cleared it. */
function statblocks(messages: readonly Delivered[], player: string): (BookStatblock | null)[] {
  return ofType(messages, 'book-statblock').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book-statblock') throw new Error('a statblock the page would not read');
    return read.statblock;
  });
}

/** The speed a statblock shows. */
const speedOf = (statblock: BookStatblock | null | undefined): string | undefined => {
  const node = statblock?.blocks.find((block) => block.k === 'value' && block.value.label === 'Speed');
  return node?.k === 'value' ? node.value.text.opening : undefined;
};

/** The order of book and statblock messages a player was sent. */
const kinds = (messages: readonly Delivered[], player: string): string[] => ofType(messages, 'book', 'book-statblock').filter(({ to }) => to === player).map(({ body }) => String(body.t));

describe('a player\'s own character\'s statblock at a running table', () => {
  let notes: StatblockNotes;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    notes = new StatblockNotes().install();
    notes.put(BRANNOCH_NOTE, TEMPLATE, note('Brannoch', '30 ft.'));
  });

  afterEach(() => {
    setStatblockGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A table where Brannoch's token links his note. */
  async function linkedTable(): Promise<Awaited<ReturnType<typeof openTable>>> {
    const table = await openTable(new BookShelf(), PLAYERS);
    table.tab.store.set(cave({ brannoch: { statblockPath: BRANNOCH_NOTE } }));
    await advance(BOOK_POLL_MS);
    return table;
  }

  it('is sent to the character\'s player alone, after their book, with nothing of what players may not see', async () => {
    const { online, socket } = await linkedTable();
    const all = delivered(socket);
    const ana = statblocks(all, ANA);
    expect(ana).toHaveLength(1);
    expect(ana[0]).toMatchObject({ editable: true, displayName: 'Brannoch', abilities: [{ name: 'Actions', tabs: [{ list: 'actions', entries: [{ name: 'Cleave' }] }] }] });
    expect(speedOf(ana[0])).toBe('30 ft.');
    // Ben plays Mira, who has no statblock: he is sent none, and nothing of Brannoch's.
    expect(statblocks(all, BEN)).toEqual([]);
    expect(ofType(all, 'book-statblock').filter(({ to }) => to !== ANA)).toEqual([]);
    const toBen = traffic(all.filter(({ to }) => to === BEN || to === ALL_PLAYERS));
    for (const his of ['Cleave', '30 ft.', 'sailed']) expect(toBen).not.toContain(his);
    for (const secret of [SECRET, BODY, BRANNOCH_NOTE, 'atlas-template']) expect(traffic(all)).not.toContain(secret);
    online.stop();
  });

  it('follows a change of its note and of its template within one poll, and is cleared when its note is unlinked', async () => {
    const { online, socket, tab } = await linkedTable();
    let since = delivered(socket).length;
    notes.edit(BRANNOCH_NOTE, note('Brannoch', '40 ft.'));
    await advance(BOOK_POLL_MS);
    let sent = statblocks(delivered(socket).slice(since), ANA);
    expect(sent.map(speedOf)).toEqual(['40 ft.']);
    expect(kinds(delivered(socket).slice(since), ANA)).toEqual(['book-statblock']);

    // The GM hides the speed from players in the template.
    since = delivered(socket).length;
    const entry = notes.notes.get(BRANNOCH_NOTE);
    if (entry !== undefined) entry.template = { ...TEMPLATE, players: { secret: 'hidden', speed: 'hidden' } };
    notes.templatesChanged();
    await advance(BOOK_POLL_MS);
    sent = statblocks(delivered(socket).slice(since), ANA);
    expect(sent).toHaveLength(1);
    expect(speedOf(sent[0])).toBeUndefined();
    expect(traffic(delivered(socket).slice(since))).not.toContain('40 ft.');

    // Nothing changed: the poll sends nothing.
    since = delivered(socket).length;
    await advance(BOOK_POLL_MS * 5);
    expect(ofType(delivered(socket).slice(since), 'book', 'book-statblock')).toEqual([]);

    // The GM unlinks the note: the page's statblock is cleared.
    tab.store.set(cave());
    await advance(BOOK_POLL_MS);
    expect(statblocks(delivered(socket).slice(since), ANA)).toEqual([null]);
    online.stop();
  });

  it('is sent again after the book when the player comes back, and taken away when the GM gives the character to someone else', async () => {
    const { online, ownership, socket } = await linkedTable();
    let since = delivered(socket).length;
    socket.relay({ t: 'player-left', id: ANA });
    await advance(100);
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    await advance(1_000);
    expect(kinds(delivered(socket).slice(since), ANA)).toEqual(['book', 'book-statblock']);
    expect(speedOf(statblocks(delivered(socket).slice(since), ANA)[0])).toBe('30 ft.');

    since = delivered(socket).length;
    ownership.give([BRANNOCH], {}, BEN);
    await advance(BOOK_POLL_MS);
    const after = delivered(socket).slice(since);
    // Ana's book is empty and comes without a statblock (the page clears it with every book); Ben's is Brannoch's.
    expect(kinds(after, ANA)).toEqual(['book']);
    expect(kinds(after, BEN)).toEqual(['book', 'book-statblock']);
    expect(statblocks(after, BEN)[0]).toMatchObject({ displayName: 'Brannoch' });
    online.stop();
  });

  it('is the library token\'s note where the token links none, and nothing while a player has no character', async () => {
    notes.library.set(MIRA_ART, MIRA_NOTE);
    notes.put(MIRA_NOTE, TEMPLATE, note('Mira', '25 ft.'));
    const { online, socket } = await openTable(new BookShelf(), PLAYERS, undefined, WITH_CAL);
    socket.relay({ t: 'player-joined', id: CAL, name: 'Cal' });
    await advance(1_000);
    const all = delivered(socket);
    expect(statblocks(all, BEN).map(speedOf)).toEqual(['25 ft.']);
    expect(statblocks(all, ANA)).toEqual([]);
    expect(kinds(all, CAL)).toEqual(['book']);
    online.stop();
  });

  it('serves the whole text of a long value to its player and refuses it to anyone else', async () => {
    const { online, socket, from } = await linkedTable();
    const story = statblocks(delivered(socket), ANA)[0]?.blocks.find((block) => block.k === 'value' && block.value.look === 'markdown');
    const hash = story?.k === 'value' ? story.value.text.whole?.hash : undefined;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const since = delivered(socket).length;
    from(BEN, { t: 'asset-request', hash });
    from(ANA, { t: 'asset-request', hash });
    await advance(500);
    const sent = delivered(socket).slice(since);
    const of = (type: string): string[] => [...new Set(ofType(sent, type).filter(({ body }) => body.hash === hash).map(({ to }) => to))];
    expect(of('asset-chunk')).toEqual([ANA]);
    expect(of('asset-refused')).toEqual([BEN]);
    const bytes = Buffer.concat(ofType(sent, 'asset-chunk').map(({ body }) => Buffer.from(String(body.data), 'base64'))).toString('utf8');
    expect(bytes).toBe(STORY);
    online.stop();
  });
});
