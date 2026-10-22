import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, type BookStatblock, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { PartySync } from '../../../../src/app/campaigns/partyValues/PartySync';
import { BOOK_POLL_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import { app, FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, cave, delivered, MIRA, ofType, openTable, type OpenTable } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import { StatblockNotes, templateOf } from './statblockNotes.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
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
const NOTE_ID = 'abcdefabcdefabcdefabcdef';
const TEMPLATE = templateOf([{ key: 'name', label: 'Name', type: 'text' }, { key: 'speed', label: 'Speed', type: 'text' }], [{ id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' }]);
const statblockNote = (name: string, speed: string): string => ['---', 'statblock: true', `atlas-template: ${TEMPLATE.id}`, `name: ${name}`, `speed: ${speed}`, '---', ''].join('\n');

/** The statblock a player's page holds now: the last one sent since their last book, null for none. */
function statblockOf(table: OpenTable, player: string): BookStatblock | null {
  let held: BookStatblock | null = null;
  for (const { to, body } of ofType(delivered(table.socket), 'book', 'book-statblock')) {
    if (to !== player) continue;
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    held = read?.t === 'book-statblock' ? read.statblock : null;
  }
  return held;
}

/** The book a player's page holds after everything sent so far: the last whole book, with the sheets that followed. */
function bookOf(table: OpenTable, player: string): PlayerBook | undefined {
  let book: PlayerBook | undefined;
  for (const { to, body } of delivered(table.socket)) {
    if (to !== player) continue;
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'book') book = read.book;
    else if (read?.t === 'book-sheet' && book !== undefined) book = { ...book, character: read.character };
  }
  return book;
}

/** The shared scene's id and the id players know a token by, read from what the players were sent. */
function listed(table: OpenTable, tokenId: string): { readonly scene: string; readonly token: string } {
  const scene = delivered(table.socket).flatMap(({ body }) => (body.t === 'scene' ? [(body.scene as { id: string }).id] : [])).at(-1);
  const name = table.tab.store.getState().objects.tokens[tokenId]?.name;
  const token = delivered(table.socket).flatMap(({ body }) => (body.t === 'tokens' && Array.isArray(body.tokens) ? (body.tokens as { id: string; name?: string }[]) : [])).find((entry) => entry.name === name)?.id;
  if (scene === undefined || token === undefined) throw new Error(`${tokenId} is not listed`);
  return { scene, token };
}

describe('a player\'s book follows the token they act with', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    setStatblockGate(null);
    PartySync.release(app);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('switches to another token of theirs with its own sheet and pages, and back', async () => {
    const table = await openTable(new BookShelf(), PLAYERS, { [BRANNOCH]: ANA, [MIRA]: ANA });
    expect(bookOf(table, ANA)?.character?.name).toBe('Brannoch');

    table.from(ANA, { t: 'book-token', ...listed(table, MIRA) });
    await advance(100);
    expect(bookOf(table, ANA)?.character?.name).toBe('Mira');
    table.from(ANA, { t: 'book-note', note: { id: NOTE_ID, title: 'Mira\'s', body: 'kept in her book' } });
    await advance(100);

    table.from(ANA, { t: 'book-token', ...listed(table, BRANNOCH) });
    await advance(100);
    expect(bookOf(table, ANA)?.character?.name).toBe('Brannoch');
    expect(bookOf(table, ANA)?.notes).toEqual([]);

    table.from(ANA, { t: 'book-token', ...listed(table, MIRA) });
    await advance(100);
    expect(bookOf(table, ANA)?.character?.name).toBe('Mira');
    expect(bookOf(table, ANA)?.notes.map((note) => note.title)).toEqual(['Mira\'s']);
    // Another reading of the scene keeps the choice.
    await advance(2_000);
    expect(bookOf(table, ANA)?.character?.name).toBe('Mira');
    table.online.stop();
  });

  it('sends the statblock of the chosen token\'s character, never the other one\'s', async () => {
    const notes = new StatblockNotes().install();
    notes.put('Characters/Brannoch.md', TEMPLATE, statblockNote('Brannoch', '30 ft.'));
    notes.put('Characters/Mira.md', TEMPLATE, statblockNote('Mira', '40 ft.'));
    const table = await openTable(new BookShelf(), PLAYERS, { [BRANNOCH]: ANA, [MIRA]: ANA });
    table.tab.store.set(cave({ brannoch: { statblockPath: 'Characters/Brannoch.md' }, mira: { statblockPath: 'Characters/Mira.md' } }));
    await advance(BOOK_POLL_MS);
    expect(statblockOf(table, ANA)?.displayName).toBe('Brannoch');

    table.from(ANA, { t: 'book-token', ...listed(table, MIRA) });
    await advance(BOOK_POLL_MS);
    expect(bookOf(table, ANA)?.character?.name).toBe('Mira');
    expect(statblockOf(table, ANA)?.displayName).toBe('Mira');

    table.from(ANA, { t: 'book-token', ...listed(table, BRANNOCH) });
    await advance(BOOK_POLL_MS);
    expect(statblockOf(table, ANA)?.displayName).toBe('Brannoch');
    table.online.stop();
  });

  it('passes over a token that is not theirs, a token of another list and a malformed choice: nobody reads another player\'s character', async () => {
    const table = await openTable(new BookShelf(), PLAYERS);
    const mira = listed(table, MIRA);
    table.from(ANA, { t: 'book-token', ...mira });
    table.from(ANA, { t: 'book-token', scene: 'another scene', token: listed(table, BRANNOCH).token });
    table.from(ANA, { t: 'book-token', scene: mira.scene, token: 'not a token' });
    await advance(2_000);
    expect(bookOf(table, ANA)?.character?.name).toBe('Brannoch');
    expect(bookOf(table, BEN)?.character?.name).toBe('Mira');
    const toAna = delivered(table.socket).filter(({ to }) => to === ANA).map(({ body }) => JSON.stringify(body)).join('\n');
    expect(toAna).not.toContain('"name":"Mira"');
    table.online.stop();
  });
});
