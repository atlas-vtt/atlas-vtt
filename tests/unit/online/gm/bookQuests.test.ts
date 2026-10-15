// @vitest-environment node
import { parseGmMessage, type BookQuest, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { applyBookMessage, EMPTY_BOOK, readBooks } from '../../../../src/app/online/gm/book/bookStore.ts';
import { setQuestGate, type QuestAsset } from '../../../../src/app/online/gm/book/questGate.ts';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { FakeSocket, png, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH_ART, CAL, delivered, MIRA_ART, nameWorldMap, nameWorldMapTree, ofType, openTable, WORLD_MAP, type OpenTable } from './bookTableHarness.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';
import { advanceSettled as advance } from './settled.ts';

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

const id = (count: number): string => count.toString(16).padStart(24, '0');
const quest = (count: number, parts: Partial<BookQuest> = {}): BookQuest => ({ id: id(count), kind: 'main', state: 'open', title: `Quest ${count}`, body: 'Find the crown.', place: null, xp: 300, rewards: ['Favour of the King'], ...parts });

/** The quests Atlas answers from the played campaign's notes, and a way to change them as an edit of a note would. */
let quests: readonly BookQuest[] = [];
/** What Atlas serves the quests' assets from, by hash. */
let questAssets = new Map<string, QuestAsset>();
const questListeners = new Set<() => void>();
function writeQuests(next: readonly BookQuest[]): void {
  quests = next;
  for (const listener of [...questListeners]) listener();
}

describe('quests in a book as the GM keeps it', () => {
  it('takes a player\'s note on a quest they are sent, and on the quest it named before that quest went; never on one they are not sent', () => {
    const sent = new Set([id(1)]);
    const onQuest = applyBookMessage(EMPTY_BOOK, { t: 'book-note', note: { id: id(50), title: '', body: 'The sexton lies.', quest: id(1) } }, 7, sent);
    expect(onQuest?.notes).toEqual([{ id: id(50), title: '', body: 'The sexton lies.', quest: id(1), at: 7 }]);
    expect(applyBookMessage(EMPTY_BOOK, { t: 'book-note', note: { id: id(51), title: '', body: 'Elsewhere.', quest: id(9) } }, 7, sent)).toBeNull();
    if (onQuest === null) throw new Error('refused');
    expect(applyBookMessage(onQuest, { t: 'book-note', note: { id: id(50), title: '', body: 'Still lies.', quest: id(1) } }, 8, new Set())?.notes[0]?.body).toBe('Still lies.');
    expect(applyBookMessage(onQuest, { t: 'book-note', note: { id: id(52), title: '', body: 'New.', quest: id(1) } }, 8, new Set())).toBeNull();
  });

  it('keeps no quests on the shelf: those an older Atlas kept there are dropped, the notes on them kept', () => {
    const saved = { Cairn: { 'art/brannoch.png': { quests: [quest(1)], notes: [{ id: id(50), title: '', body: 'Mine.', quest: id(1), at: 3 }] }, 'art/x.png': { quests: [quest(3)] } } };
    const read = readBooks(saved);
    expect(read.Cairn?.['art/brannoch.png']).not.toHaveProperty('quests');
    expect(read.Cairn?.['art/brannoch.png']?.notes).toHaveLength(1);
    expect(read.Cairn?.['art/x.png']).toBeUndefined();
  });
});

describe('quests at a running table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
    quests = [];
    questAssets = new Map();
    setQuestGate({
      quests: () => Promise.resolve(quests),
      asset: (hash) => questAssets.get(hash),
      onChange: (listener) => {
        questListeners.add(listener);
        return () => void questListeners.delete(listener);
      },
    });
  });

  afterEach(() => {
    setQuestGate(null);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The last book each player was sent, as their page reads it. */
  function lastBook(table: OpenTable, player: string): PlayerBook | undefined {
    return ofType(delivered(table.socket), 'book').filter(({ to }) => to === player).map(({ body }) => {
      const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
      if (read?.t !== 'book') throw new Error('a book the page would not read');
      return read.book;
    }).at(-1);
  }

  it('sends the played campaign\'s quests to every player, and again once a quest note changes', async () => {
    quests = [quest(1, { title: 'The crown under the root', body: 'Ask the **abbot**. See [[Olm eggs]].' })];
    const table = await openTable(new BookShelf(), [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    expect(lastBook(table, ANA)?.quests).toEqual(quests);
    expect(lastBook(table, BEN)?.quests).toEqual(quests);

    writeQuests([quest(1, { state: 'done', title: 'The crown under the root' }), quest(2, { kind: 'side', title: 'Olm eggs' })]);
    await advance(100);
    expect(lastBook(table, ANA)?.quests.map((kept) => [kept.title, kept.state])).toEqual([['The crown under the root', 'done'], ['Olm eggs', 'open']]);
    expect(lastBook(table, BEN)?.quests).toHaveLength(2);
    const books = ofType(delivered(table.socket), 'book').length;
    // The same quests again (Atlas hands on the same list while no quest changed) send nothing.
    writeQuests(quests);
    await advance(100);
    expect(ofType(delivered(table.socket), 'book')).toHaveLength(books);
    table.online.stop();
  });

  it('sends a page that reads its book in parts a changed quest list or world map alone, and any other page its whole book', async () => {
    quests = [quest(1)];
    const table = await openTable(new BookShelf(), [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    table.from(ANA, { t: 'book-parts' });
    await advance(100);
    const books = (player: string): number => ofType(delivered(table.socket), 'book').filter(({ to }) => to === player).length;
    const before = { ana: books(ANA), ben: books(BEN) };
    const part = (type: string): unknown => ofType(delivered(table.socket), type).filter(({ to }) => to === ANA).map(({ body }) => parseGmMessage(JSON.parse(JSON.stringify(body)))).at(-1);

    writeQuests([quest(1, { state: 'done' })]);
    await advance(100);
    expect(part('book-quests')).toEqual({ t: 'book-quests', quests: [quest(1, { state: 'done' })] });
    workspace.files.set('maps/other world.png', png(640, 480));
    nameWorldMap('maps/other world.png');
    await advance(100);
    expect(part('book-map')).toMatchObject({ t: 'book-map', worldMap: { width: 640, height: 480 } });
    expect(books(ANA)).toBe(before.ana);
    expect(books(BEN)).toBe(before.ben + 2);
    table.online.stop();
  });

  it('places an active quest where the GM\'s pin on the world map stands, and a quest told, done or failed nowhere', async () => {
    quests = [quest(1, { state: 'active' }), quest(2), quest(3, { state: 'active' })];
    const table = await openTable(new BookShelf(), [{ id: ANA, name: 'Ana' }]);
    // The world map is 1200 by 800: a quest's first pin places it, a pin beyond the image places nothing.
    const pins = [{ x: 300, y: 400, id: id(1) }, { x: 900, y: 200, id: id(1) }, { x: 600, y: 400, id: id(2) }, { x: 5000, y: 0, id: id(3) }];
    nameWorldMapTree({ root: 'world', levels: [{ key: 'world', title: 'World', image: WORLD_MAP, stretch: NO_STRETCH, entrances: [], quests: pins }] });
    await advance(200);
    expect(lastBook(table, ANA)?.quests.map((sent) => sent.place)).toEqual([{ x: 0.25, y: 0.5 }, null, null]);

    writeQuests([quest(1, { state: 'done' }), quest(2, { state: 'active' }), quest(3, { state: 'active' })]);
    await advance(200);
    expect(lastBook(table, ANA)?.quests.map((sent) => sent.place)).toEqual([null, { x: 0.5, y: 0.5 }, null]);
    const books = ofType(delivered(table.socket), 'book').length;
    // The same quests and the same pins read again send nothing.
    writeQuests(quests);
    nameWorldMapTree({ root: 'world', levels: [{ key: 'world', title: 'World', image: WORLD_MAP, stretch: NO_STRETCH, entrances: [], quests: pins }] });
    await advance(200);
    expect(ofType(delivered(table.socket), 'book')).toHaveLength(books);
    table.online.stop();
  });

  it('keeps a player\'s notes on a quest, answers a note on a quest they are not sent with their book, and takes no quest text from a player', async () => {
    quests = [quest(1, { title: 'The crown under the root' })];
    const shelf = new BookShelf();
    const table = await openTable(shelf, [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
    table.from(ANA, { t: 'book-note', note: { id: id(60), title: '', body: 'Ask the abbot.', quest: id(1) } });
    await advance(100);
    expect(shelf.of('Cairn', BRANNOCH_ART).notes).toMatchObject([{ id: id(60), quest: id(1), body: 'Ask the abbot.' }]);

    const before = ofType(delivered(table.socket), 'book').filter(({ to }) => to === ANA).length;
    table.from(ANA, { t: 'book-note', note: { id: id(61), title: '', body: 'Not mine.', quest: id(9) } });
    // Answered with the whole book, at most one in five seconds.
    await advance(6_000);
    expect(shelf.of('Cairn', BRANNOCH_ART).notes.map((note) => note.id)).toEqual([id(60)]);
    expect(ofType(delivered(table.socket), 'book').filter(({ to }) => to === ANA).length).toBe(before + 1);
    expect(shelf.of('Cairn', MIRA_ART).notes).toEqual([]);

    // A quest written by a player, in any shape, changes nothing.
    for (const body of [{ t: 'book-quest', quest: quest(1, { body: 'Rewritten.' }) }, { t: 'book-note', note: { ...quest(1, { body: 'Rewritten.' }), quest: id(1) } }]) table.from(BEN, body);
    await advance(6_000);
    expect(lastBook(table, ANA)?.quests).toEqual(quests);
    expect(lastBook(table, BEN)?.quests).toEqual(quests);
    expect(shelf.toData().Cairn?.[MIRA_ART]).not.toHaveProperty('quests');
    table.online.stop();
  });

  it('sends the quests to a player without a character too, and takes no note on one from them', async () => {
    quests = [quest(1, { title: 'The crown under the root' })];
    const shelf = new BookShelf();
    const table = await openTable(shelf, [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }]);
    expect(lastBook(table, CAL)?.character).toBeNull();
    expect(lastBook(table, CAL)?.quests).toEqual(quests);

    writeQuests([quest(1, { state: 'active', title: 'The crown under the root' })]);
    await advance(100);
    expect(lastBook(table, CAL)?.quests.map((kept) => kept.state)).toEqual(['active']);

    const before = ofType(delivered(table.socket), 'book').filter(({ to }) => to === CAL).length;
    table.from(CAL, { t: 'book-note', note: { id: id(70), title: '', body: 'Mine?', quest: id(1) } });
    await advance(6_000);
    expect(ofType(delivered(table.socket), 'book').filter(({ to }) => to === CAL).length).toBe(before + 1);
    expect(lastBook(table, CAL)?.notes).toEqual([]);
    expect(JSON.stringify(shelf.toData())).not.toContain('Mine?');
    table.online.stop();
  });

  it('serves a quest\'s whole text and its images to the players sent the quest, and to nobody else', async () => {
    const text = new TextEncoder().encode(`${'Über dem Fluss 🐸 '.repeat(12_000)}![[cellar.png|300]]`).slice();
    const cellar = png(8, 8);
    const [textHash, cellarHash, otherHash] = await Promise.all([sha256Hex(text), sha256Hex(cellar as Uint8Array<ArrayBuffer>), sha256Hex(png(9, 9) as Uint8Array<ArrayBuffer>)]);
    questAssets = new Map<string, QuestAsset>([[textHash, { bytes: text }], [cellarHash, { path: 'Quests/cellar.png' }], [otherHash, { path: 'Quests/secret.png' }]]);
    quests = [quest(1, {
      text: { hash: textHash, size: text.length, mime: 'text/markdown' },
      images: [{ target: 'cellar.png', width: 300, height: null, image: { hash: cellarHash, size: cellar.length, mime: 'image/png' } }],
    })];
    const table = await openTable(new BookShelf(), [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }]);
    workspace.files.set('Quests/cellar.png', cellar);
    workspace.files.set('Quests/secret.png', png(9, 9));
    expect(lastBook(table, ANA)?.quests).toEqual(quests);
    expect(lastBook(table, CAL)?.quests).toEqual(quests);

    const since = delivered(table.socket).length;
    for (const player of [ANA, BEN, CAL]) for (const hash of [textHash, cellarHash, otherHash]) table.from(player, { t: 'asset-request', hash });
    await advance(500);
    const sent = delivered(table.socket).slice(since);
    const answered = (hash: string): { served: string[]; refused: string[] } => {
      const of = (type: string): string[] => [...new Set(ofType(sent, type).filter(({ body }) => body.hash === hash).map(({ to }) => to))].sort();
      return { served: of('asset-chunk'), refused: of('asset-refused') };
    };
    expect(answered(textHash)).toEqual({ served: [ANA, BEN, CAL], refused: [] });
    expect(answered(cellarHash)).toEqual({ served: [ANA, BEN, CAL], refused: [] });
    // An asset Atlas could serve but no quest a player was sent names is nobody's.
    expect(answered(otherHash)).toEqual({ served: [], refused: [ANA, BEN, CAL] });
    // The whole text arrives in chunks and is the text, byte for byte.
    const chunks = ofType(sent, 'asset-chunk').filter(({ body, to }) => body.hash === textHash && to === ANA).map(({ body }) => Buffer.from(String(body.data), 'base64'));
    expect(chunks.length).toBeGreaterThan(1);
    expect(new Uint8Array(Buffer.concat(chunks))).toEqual(text);
    table.online.stop();
  });
});
