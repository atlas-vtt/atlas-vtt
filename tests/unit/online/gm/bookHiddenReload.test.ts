import { parseGmMessage, type PlayerBook } from '../../../../src/app/online/protocol/index.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { FakeSocket, workspace } from './fakeTable.ts';
import { ANA, BEN, BRANNOCH, cave, delivered, MIRA, openTable, type Delivered } from './bookTableHarness.ts';
import { advanceSettled as advance } from './settled.ts';

vi.mock('obsidian', () => ({ Notice: class {}, normalizePath: (path: string) => path, requestUrl: () => Promise.resolve({ status: 201, json: null }), PluginSettingTab: class {}, Setting: class {} }));
vi.mock('../../../../src/app/online/gm/gmMarks.ts', () => ({
  GmMarks: class {
    source(): null {
      return null;
    }
    showPlayers(): void {}
    showPlayerDrags(): void {}
    showPlayerCursors(): void {}
    showPlayerStrokes(): void {}
    dispose(): void {}
  },
}));
vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({ ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()), accentColour: () => '#112233' }));

const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];

/** The book a player holds after everything they were sent: the last whole one, with the sheets that followed it. */
function held(messages: readonly Delivered[], player: string): PlayerBook | null {
  return messages.filter(({ to }) => to === player).reduce<PlayerBook | null>((book, { body }) => {
    const read = parseGmMessage(JSON.parse(JSON.stringify(body)));
    if (read?.t === 'book') return read.book;
    return read?.t === 'book-sheet' && book !== null ? { ...book, character: read.character } : book;
  }, null);
}

describe('a character whose token the GM hides', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    workspace.leaves = [];
    workspace.presented = null;
  });

  afterEach(() => {
    workspace.assets = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays in its player\'s book when their page loads again, and when the page names another token of theirs it acts with', async () => {
    const { online, socket, tab, from } = await openTable(new BookShelf(), PLAYERS, { [BRANNOCH]: ANA, [MIRA]: ANA });
    expect(held(delivered(socket), ANA)?.character?.name).toBe('Brannoch');
    tab.store.set(cave({ brannoch: { isHidden: true } }));
    await advance(1_000);

    // Ana's page loads again: she leaves and comes back, and her page names the one token of hers it lists.
    socket.relay({ t: 'player-left', id: ANA });
    await advance(100);
    const since = delivered(socket).length;
    socket.relay({ t: 'player-joined', id: ANA, name: 'Ana' });
    await advance(1_000);
    expect(held(delivered(socket).slice(since), ANA)?.character?.name).toBe('Brannoch');
    const listed = delivered(socket).filter(({ to, body }) => (to === ANA || to === '') && body.t === 'tokens').at(-1)?.body as { scene: string; tokens: { id: string; name: string | null }[] } | undefined;
    const mira = listed?.tokens.find((token) => token.name === 'Mira');
    expect(mira).toBeDefined();
    from(ANA, { t: 'book-token', scene: listed?.scene, token: mira?.id });
    await advance(1_000);
    expect(held(delivered(socket), ANA)?.character?.name).toBe('Brannoch');
    online.stop();
  });
});
