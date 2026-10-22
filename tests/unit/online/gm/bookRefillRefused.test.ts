import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGmMessage, type BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import { REFUSAL_BOOK_MS } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { setStatblockGate } from '../../../../src/app/online/gm/book/statblockGate.ts';
import type { StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, CAL, cave, delivered, keptBooks, ofType, openTable, type Delivered } from './bookTableHarness.ts';
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

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }];
const PATH = 'Characters/Brannoch.md';
/** What template files of earlier builds hold: refills, which recovery buttons replaced and nothing reads. */
const EARLIER_KEYS = { refills: [{ name: 'Short rest' }, { name: 'Long rest', includes: ['Short rest'] }] };
const TEMPLATE: StatblockTemplate = {
  ...templateOf(
    [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'slots', label: 'Spell slots', type: 'counters' },
    ],
    [{ id: 'slots001', type: 'counters', field: 'slots' }],
  ),
  ...EARLIER_KEYS,
};
const NOTE = `---
statblock: true
atlas-template: ${TEMPLATE.id}
name: Brannoch
slots:
  - name: Ki
    max: 2
    used: 2
    reset: Short rest
---
Brannoch's own words.
`;

/** The statblocks a player was sent, as the page reads them. */
function statblocks(messages: readonly Delivered[], player: string): (BookStatblock | null)[] {
  return ofType(messages, 'book-statblock').filter(({ to }) => to === player).map(({ body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t !== 'book-statblock') throw new Error('a statblock the page would not read');
    return read.statblock;
  });
}

describe('a page of an earlier Atlas asking for a refill at a running table', () => {
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

  async function table(shelf = new BookShelf()): Promise<Awaited<ReturnType<typeof openTable>>> {
    const opened = await openTable(shelf, PLAYERS);
    opened.tab.store.set(cave({ brannoch: { statblockPath: PATH } }));
    await advance(REFUSAL_BOOK_MS);
    return opened;
  }

  it('is sent a sheet that offers no refills, whatever the template file still holds', async () => {
    const { online, socket } = await table();
    const sent = statblocks(delivered(socket), ANA).at(-1);
    expect(sent?.blocks.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(ofType(delivered(socket), 'book-statblock').at(-1)?.body))).not.toHaveProperty('statblock.refills');
    online.stop();
  });

  it('changes neither the shelf nor any note', async () => {
    const source = keptBooks();
    const shelf = new BookShelf(source);
    const { online, from } = await table(shelf);
    const books = source.dump();
    for (const player of [ANA, BEN, CAL]) {
      from(player, { t: 'book-refill', refill: 'Long rest' });
      await advance(REFUSAL_BOOK_MS);
    }
    expect(notes.writes).toEqual([]);
    expect(notes.text(PATH)).toBe(NOTE);
    expect(source.dump()).toBe(books);
    expect(source.writes).toBe(0);
    online.stop();
  });
});
