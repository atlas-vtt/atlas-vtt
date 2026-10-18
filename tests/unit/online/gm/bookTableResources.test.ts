// @vitest-environment node
import { produce } from 'immer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALL_PLAYERS, parseGmMessage, type BookCharacter } from '../../../../src/app/online/protocol/index.ts';
import { PartySync } from '../../../../src/app/campaigns/partyValues/PartySync';
import type { PartyValue } from '../../../../src/app/campaigns/partyValues/partyKeys';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { BOOK_BURST } from '../../../../src/app/online/gm/book/BookShare.ts';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { app, FakeSocket, workspace, type FakeTab } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, BRANNOCH_ART, cave, delivered, DOOM, MIRA, ofType, openTable, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
// The GM's marks draw with PIXI over Atlas's canvas, which a table of books has no use for.
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
const CAMPAIGN = 'campaign-of-the-cave';

/** Atlas's store writes the scene as Atlas's own middleware would, so the GM's state follows a player's edit. */
function writable(tab: FakeTab): void {
  Object.assign(tab.store, { setState: (recipe: (draft: SceneState) => void) => tab.store.set(produce(tab.store.getState(), recipe)) });
}

/** The character a player's page holds after what it was sent since `from`: the last book's, with the sheets that followed. */
function character(messages: readonly Delivered[], player: string): BookCharacter | null | undefined {
  let held: BookCharacter | null | undefined;
  for (const { to, body } of messages) {
    if (to !== player) continue;
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'book') held = read.book.character;
    else if (read?.t === 'book-sheet') held = read.character;
  }
  return held;
}

const hpOf = (tab: FakeTab, tokenId: string): unknown => tab.store.getState().objects.tokens[tokenId]?.resources?.hp;

describe('players editing their characters\' resources at a running table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    PartySync.release(app);
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes a player\'s edit to their own character\'s token, clamped, and sends them the sheet that follows it, and nobody else anything', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    expect(character(delivered(socket), ANA)?.resources).toEqual([
      { key: 'hp', name: 'Hit Points', colour: '#cc3333', direction: 'drains', current: 7, max: 12, editable: true },
      { key: 'doom', name: 'Doom Track', colour: '#333333', direction: 'fills', current: DOOM, max: 99999, editable: true },
    ]);

    let since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'hp', current: 3 });
    await advance(100);
    expect(hpOf(tab, BRANNOCH)).toEqual({ current: 3, max: 12 });
    expect(hpOf(tab, MIRA)).toEqual({ current: 4, max: 12 });
    const after = delivered(socket).slice(since);
    expect(ofType(after, 'book', 'book-sheet')).toMatchObject([{ to: ANA, body: { t: 'book-sheet' } }]);
    expect(character(after, ANA)?.resources).toMatchObject([{ key: 'hp', current: 3, max: 12 }, { key: 'doom' }]);
    // Everyone's picture of the table draws Brannoch's bar at the new value, as for any write of the GM's.
    expect(JSON.stringify(after.filter(({ to, body }) => to === ALL_PLAYERS && body.t !== 'book-sheet'))).toContain('"current":3,"max":12');

    // A value beyond the range is the range's end, and the sheet says so even where the token already held it.
    since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'hp', current: 500 });
    await advance(100);
    expect(hpOf(tab, BRANNOCH)).toEqual({ current: 12, max: 12 });
    from(ANA, { t: 'book-resource', key: 'hp', current: 600 });
    await advance(100);
    expect(ofType(delivered(socket).slice(since), 'book-sheet').filter(({ to }) => to === ANA)).toHaveLength(2);
    expect(character(delivered(socket).slice(since), ANA)?.resources).toMatchObject([{ current: 12 }, { key: 'doom' }]);

    // Ben's edit names the same key, and changes his own character alone.
    from(BEN, { t: 'book-resource', key: 'hp', current: 1 });
    await advance(100);
    expect(hpOf(tab, MIRA)).toEqual({ current: 1, max: 12 });
    expect(hpOf(tab, BRANNOCH)).toEqual({ current: 12, max: 12 });
    online.stop();
  });

  it('takes an edit of a resource hidden from players, which is the player\'s own, and shows it to nobody else', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    const since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'doom', current: 5 });
    await advance(100);
    expect(tab.store.getState().objects.tokens[BRANNOCH]?.resources?.doom).toEqual({ current: 5, max: 99999 });
    const after = delivered(socket).slice(since);
    expect(character(after, ANA)?.resources).toMatchObject([{ key: 'hp' }, { key: 'doom', current: 5 }]);
    expect(JSON.stringify(after.filter(({ to }) => to !== ANA))).not.toContain('Doom');
    online.stop();
  });

  it('answers an edit of a resource the sheet does not name, or a malformed one, with the whole book, and changes nothing', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    const before = tab.store.getState();
    const since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'mana', current: 1 });
    from(ANA, { t: 'book-resource', key: 'hp', current: Number.NaN });
    await advance(6_000);
    expect(tab.store.getState()).toBe(before);
    const books = ofType(delivered(socket).slice(since), 'book');
    expect(books.length).toBeGreaterThan(0);
    expect(books.every(({ to }) => to === ANA)).toBe(true);
    expect(JSON.stringify(delivered(socket).filter(({ to }) => to !== ANA))).not.toContain(String(DOOM));
    online.stop();
  });

  it('takes a burst of edits and then the book\'s rate, refusing the rest', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    const since = delivered(socket).length;
    for (let count = 0; count <= BOOK_BURST; count += 1) from(ANA, { t: 'book-resource', key: 'hp', current: count % 12 });
    // A refusal is answered with the book once its last one is old enough.
    await advance(6_000);
    expect(hpOf(tab, BRANNOCH)).toEqual({ current: (BOOK_BURST - 1) % 12, max: 12 });
    expect(ofType(delivered(socket).slice(since), 'book').filter(({ to }) => to === ANA)).toHaveLength(1);
    online.stop();
  });

  it('refuses an edit while the scene holds no token of the character and no campaign is played', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    const scene = cave();
    const tokens = { ...scene.objects.tokens };
    delete tokens[BRANNOCH];
    tab.store.set({ ...scene, objects: { ...scene.objects, tokens } });
    await advance(1_000);
    const since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'hp', current: 2 });
    await advance(6_000);
    expect(ofType(delivered(socket).slice(since), 'book')).toMatchObject([{ to: ANA, body: { book: { character: { name: 'Brannoch' } } } }]);
    online.stop();
  });

  it('writes an edit into the played campaign\'s values while the scene holds no token of the character, with no step, and sends the sheet that follows', async () => {
    const values = new Map<string, PartyValue>([['lib-brannoch\nhp', { current: 9, max: 10 }]]);
    const written: unknown[] = [];
    const sync = {
      characterOf: (placed: { imagePath: string }) => (placed.imagePath === BRANNOCH_ART ? 'lib-brannoch' : null),
      value: (campaignId: string, characterId: string, key: string) => (campaignId === CAMPAIGN ? values.get(`${characterId}\n${key}`) : undefined),
      setValue: (...args: unknown[]) => written.push(args) > 0,
      destroy: () => undefined,
    };
    Object.assign(app, { loadLocalStorage: () => CAMPAIGN, saveLocalStorage: () => undefined });
    PartySync.register(app, sync as unknown as PartySync);
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS);
    writable(tab);
    const scene = cave();
    const tokens = { ...scene.objects.tokens };
    delete tokens[BRANNOCH];
    tab.store.set({ ...scene, objects: { ...scene.objects, tokens } });
    await advance(1_000);

    const since = delivered(socket).length;
    from(ANA, { t: 'book-resource', key: 'hp', current: 40 });
    await advance(100);
    expect(written).toEqual([[CAMPAIGN, 'lib-brannoch', 'hp', { current: 10, max: 10 }]]);
    expect(ofType(delivered(socket).slice(since), 'book', 'book-sheet')).toMatchObject([{ to: ANA, body: { t: 'book-sheet' } }]);
    expect(character(delivered(socket).slice(since), ANA)?.resources).toMatchObject([{ key: 'hp', current: 10 }, { key: 'doom' }]);
    online.stop();
  });
});
