// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, sheetBase, sheetItemKeys, type BookStatblock, type SheetRaw } from '../../../../src/app/online/protocol/index.ts';
import { BOOK_POLL_MS, REFUSAL_BOOK_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, cave, delivered, ofType, openTable, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { propertiesOf, StatblockNotes, templateOf } from './statblockNotes.ts';

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
const PATH = 'Characters/Brannoch.md';
const BODY = 'What only the GM reads of Brannoch.\n';
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'speed', label: 'Speed', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }] } },
];
const BLOCKS: TemplateBlock[] = [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }, { id: 'list0001', type: 'entries', field: 'actions' }];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, BLOCKS);
const NOTE = `---\nstatblock: true\natlas-template: ${TEMPLATE.id}\nname: Brannoch\nspeed: 30 ft.\nactions:\n  - name: Cleave\n    desc: Hits twice.\n---\n${BODY}`;

/** The statblocks a player was sent, as the page reads them. */
function statblocks(messages: readonly Delivered[], player: string): (BookStatblock | null)[] {
  return ofType(messages, 'book-statblock').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book-statblock') throw new Error('a statblock the page would not read');
    return read.statblock;
  });
}

const speedOf = (statblock: BookStatblock | null | undefined): string | undefined => {
  const node = statblock?.blocks.find((block) => block.k === 'value' && block.value.label === 'Speed');
  return node?.k === 'value' ? node.value.text.opening : undefined;
};

const kinds = (messages: readonly Delivered[], player: string): string[] => ofType(messages, 'book', 'book-statblock').filter(({ to }) => to === player).map(({ body }) => String(body.t));

describe('a player changing their own character\'s statblock at a running table', () => {
  let notes: StatblockNotes;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    notes = new StatblockNotes().install();
    notes.put(PATH, TEMPLATE, NOTE);
  });

  afterEach(() => {
    setStatblockGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function table(): Promise<Awaited<ReturnType<typeof openTable>>> {
    const opened = await openTable(new BookShelf(), PLAYERS);
    opened.tab.store.set(cave({ brannoch: { statblockPath: PATH } }));
    await advance(REFUSAL_BOOK_MS);
    return opened;
  }

  it('writes a value into the note and answers with the statblock that follows, to that player alone and never into the map\'s history', async () => {
    const { online, socket, tab, from } = await table();
    const scene = tab.store.getState();
    const since = delivered(socket).length;
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
    await advance(BOOK_POLL_MS);
    expect(notes.text(PATH)).toBe(NOTE.replace('speed: 30 ft.', 'speed: 40 ft.'));
    const after = delivered(socket).slice(since);
    expect(kinds(after, ANA)).toEqual(['book-statblock']);
    expect(speedOf(statblocks(after, ANA)[0])).toBe('40 ft.');
    expect(after.filter(({ to }) => to !== ANA)).toEqual([]);
    expect(tab.store.getState()).toBe(scene);
    online.stop();
  });

  it('takes two quick edits of one value, and an ability edited at once after it was added, before the note reads either back', async () => {
    const { online, socket, from } = await table();
    notes.lagging = true;
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('40 ft.'), value: '50 ft.' });
    await advance(BOOK_POLL_MS);
    expect(propertiesOf(notes.text(PATH))?.speed).toBe('50 ft.');

    // The page names the added ability as the GM will (`sheetItemKeys` over the list it expects).
    const added = { name: 'Healing Word', desc: 'Heals.', cost: 'Bonus action' };
    const key = sheetItemKeys([added, { name: 'Cleave', desc: 'Hits twice.' }] as SheetRaw[])[0];
    from(ANA, { t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: 'Healing Word', text: 'Heals.', parts: { cost: 'Bonus action' } } });
    from(ANA, { t: 'book-ability', op: 'edit', list: 'actions', key, entry: { name: 'Healing Word', text: 'Heals a lot.', parts: { cost: 'Action' } } });
    await advance(BOOK_POLL_MS);
    expect(propertiesOf(notes.text(PATH))?.actions).toEqual([{ name: 'Healing Word', desc: 'Heals a lot.', cost: 'Action' }, { name: 'Cleave', desc: 'Hits twice.' }]);
    expect(notes.text(PATH).endsWith(`---\n${BODY}`)).toBe(true);
    // Shown at once: the statblock that followed holds what was written, before the cache read it.
    const shown = statblocks(delivered(socket), ANA).at(-1);
    expect(speedOf(shown)).toBe('50 ft.');
    expect(shown?.abilities[0]?.tabs[0]?.entries.map((entry) => entry.name)).toEqual(['Healing Word', 'Cleave']);
    notes.settle();
    await advance(BOOK_POLL_MS);
    expect(speedOf(statblocks(delivered(socket), ANA).at(-1))).toBe('50 ft.');
    online.stop();
  });

  it('takes two quick edits while the note reads the first back, the cache keeping up', async () => {
    const { online, from } = await table();
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('40 ft.'), value: '50 ft.' });
    await advance(BOOK_POLL_MS);
    expect(notes.writes).toHaveLength(2);
    expect(propertiesOf(notes.text(PATH))?.speed).toBe('50 ft.');
    online.stop();
  });

  it('refuses an edit while the note is read again after a change from outside, and checks the next against what was read', async () => {
    const { online, socket, from } = await table();
    const edit = (value: string): void => from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value });
    // The GM hides Speed from players; the edit that arrives before the note is read again is refused.
    let since = delivered(socket).length;
    notes.put(PATH, { ...TEMPLATE, players: { speed: 'hidden' } }, NOTE);
    edit('40 ft.');
    await advance(BOOK_POLL_MS);
    expect(notes.writes).toEqual([]);
    expect(kinds(delivered(socket).slice(since), ANA)[0]).toBe('book');
    // Read: the template still hides it.
    await advance(REFUSAL_BOOK_MS);
    edit('40 ft.');
    await advance(REFUSAL_BOOK_MS);
    expect(notes.writes).toEqual([]);

    // Every note may read otherwise (a template saved): refused until read, taken once the template reads as before.
    notes.put(PATH, TEMPLATE, NOTE);
    await advance(REFUSAL_BOOK_MS);
    since = delivered(socket).length;
    notes.templatesChanged();
    edit('40 ft.');
    await advance(BOOK_POLL_MS);
    expect(notes.writes).toEqual([]);
    expect(kinds(delivered(socket).slice(since), ANA)[0]).toBe('book');
    await advance(REFUSAL_BOOK_MS);
    edit('45 ft.');
    await advance(BOOK_POLL_MS);
    expect(propertiesOf(notes.text(PATH))?.speed).toBe('45 ft.');
    online.stop();
  });

  it('answers an edit that is refused with the whole book, then the statblock as the note holds it', async () => {
    const { online, socket, from } = await table();
    let since = delivered(socket).length;
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('25 ft.'), value: '40 ft.' });
    await advance(BOOK_POLL_MS);
    expect(kinds(delivered(socket).slice(since), ANA)).toEqual(['book', 'book-statblock']);
    expect(speedOf(statblocks(delivered(socket).slice(since), ANA)[0])).toBe('30 ft.');
    expect(notes.writes).toEqual([]);

    // Ben plays Mira, who has no statblock: he changes nothing of Brannoch's.
    from(BEN, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '1 ft.' });
    await advance(REFUSAL_BOOK_MS);
    expect(notes.writes).toEqual([]);
    expect(notes.text(PATH)).toBe(NOTE);

    // The note changed since the cache read it: the writer finds another value and takes nothing.
    since = delivered(socket).length;
    notes.corrupt(PATH, NOTE.replace('30 ft.', '35 ft.'));
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
    await advance(BOOK_POLL_MS);
    expect(notes.writes).toHaveLength(1);
    expect(notes.text(PATH)).toBe(NOTE.replace('30 ft.', '35 ft.'));
    expect(kinds(delivered(socket).slice(since), ANA)).toEqual(['book', 'book-statblock']);
    online.stop();
  });

  it('writes nothing into a note whose properties have errors, and nothing where the template is missing or of a newer Atlas, or the note is Fantasy Statblocks\'', async () => {
    const { online, socket, from } = await table();
    const broken = NOTE.replace('speed: 30 ft.', 'speed: 30 ft.\nspeed: 35 ft.');
    notes.corrupt(PATH, broken);
    let since = delivered(socket).length;
    from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
    await advance(BOOK_POLL_MS);
    expect(notes.text(PATH)).toBe(broken);
    expect(kinds(delivered(socket).slice(since), ANA)).toEqual(['book', 'book-statblock']);

    for (const options of [{ status: 'missing' as const }, { status: 'newer' as const }, { kind: 'fs-frontmatter' as const }]) {
      notes.put(PATH, TEMPLATE, NOTE, options);
      // The second refusal of the step before is answered with one more book, once its time has come.
      await advance(REFUSAL_BOOK_MS * 2);
      since = delivered(socket).length;
      const writes = notes.writes.length;
      from(ANA, { t: 'book-field', key: 'speed', base: sheetBase('30 ft.'), value: '40 ft.' });
      from(ANA, { t: 'book-ability', op: 'add', list: 'actions', after: null, entry: { name: 'Dodge', text: '', parts: {} } });
      await advance(BOOK_POLL_MS);
      expect(notes.writes.length, JSON.stringify(options)).toBe(writes);
      expect(kinds(delivered(socket).slice(since), ANA)[0]).toBe('book');
    }
    online.stop();
  });
});
