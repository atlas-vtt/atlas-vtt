import type { TokenEntity } from '../../../../src/app/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership } from '../../../../src/app/online/gm/ownership.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, atlasTab, FakeSocket, png, present, switchScene, workspace, storedAccount } from './fakeTable.ts';
import { tableControlsStore } from '../../../../src/app/stores/tableControlsStore';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

const seen = vi.hoisted(() => ({ notices: [] as string[] }));

vi.mock('obsidian', () => ({
  Notice: class {
    constructor(text: string) {
      seen.notices.push(text);
    }
  },
  normalizePath: (file: string) => file,
  requestUrl: () => Promise.resolve({ status: 500, json: null }),
  PluginSettingTab: class {},
  Setting: class {},
  Platform: { isDesktopApp: true, isMobile: false, isPhone: false },
}));

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

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const CAVE = 'Scenes/Cave.atlasmap';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: CAVE, gate: { code: '483912', requireCode: true, askToJoin: true } };
const character = (id: string, name: string, x: number): TokenEntity => ({ id, kind: 'character', name, imagePath: 'art/ogre.png', x, y: 140 });
const cave = (x = 140): SceneState => sceneState({ mapPath: CAVE, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: { 'gm-ogre': character('gm-ogre', 'Ogre', x) } } });

type Body = { readonly t: string; readonly scene?: unknown; readonly id?: string; readonly tokens?: readonly { readonly id: string; readonly x: number }[] };
const bodies = (socket: FakeSocket, to?: string): Body[] => socket.frames().flatMap((frame) => (frame.t === 'send' && frame.body !== undefined && (to === undefined || frame.to === to) ? [frame.body as Body] : []));
const scenes = (socket: FakeSocket, to?: string): unknown[] => bodies(socket, to).filter((body) => body.t === 'scene').map((body) => body.scene);

/** A running table restored from `SAVED`, welcomed by the relay with Ana at it. */
async function running(): Promise<{ online: OnlineControl; socket: FakeSocket }> {
  const players = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
  const online = new OnlineControl(app, boundOwnership(players), fakeCampaigns(players), undefined, storedAccount());
  void online.resume(SAVED);
  await advance(0);
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  socket.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
  await advance(500);
  return { online, socket };
}

const modes = (socket: FakeSocket, to?: string): Body[] => bodies(socket, to).filter((body) => body.t === 'table-mode');

describe('the GM\'s controls over the online table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    seen.notices.length = 0;
    workspace.leaves = [];
    workspace.presented = null;
    workspace.shownElsewhere = 0;
    workspace.files = new Map([['maps/cave.png', png(700, 700)], ['art/ogre.png', png(4, 4)]]);
    tableControlsStore.setState({ curtain: false, paused: false, playMode: 'table', online: false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('tells every player how the table plays, before the scene, and each one who joins', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, socket } = await running();
    expect(tableControlsStore.getState().online).toBe(true);
    const sent = bodies(socket);
    expect(sent.findIndex((body) => body.t === 'table-mode')).toBeLessThan(sent.findIndex((body) => body.t === 'scene'));
    expect(modes(socket).at(-1)).toEqual({ t: 'table-mode', mode: 'table', curtain: false, paused: false });

    tableControlsStore.setState({ playMode: 'remote' });
    await advance(100);
    expect(modes(socket).at(-1)).toEqual({ t: 'table-mode', mode: 'remote', curtain: false, paused: false });

    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(500);
    expect(modes(socket, BEN)).toEqual([{ t: 'table-mode', mode: 'remote', curtain: false, paused: false }]);
    online.stop();
    expect(tableControlsStore.getState().online).toBe(false);
  });

  it('sends no scene while the curtain is down, nothing the GM does behind it, and the scene again once it is lifted', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, socket } = await running();
    const shown = scenes(socket).at(-1);
    expect(shown).not.toBeNull();

    tableControlsStore.setState({ curtain: true });
    await advance(100);
    expect(modes(socket).at(-1)).toMatchObject({ curtain: true });
    expect(scenes(socket).at(-1)).toBeNull();
    const before = socket.frames().length;
    switchScene(tab, cave(560));
    await advance(3_000);
    expect(JSON.stringify(socket.frames().slice(before))).not.toContain('560');
    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(500);
    expect(scenes(socket, BEN)).toEqual([null]);
    expect(seen.notices).toEqual([]);

    tableControlsStore.setState({ curtain: false });
    await advance(1_500);
    expect(modes(socket).at(-1)).toMatchObject({ curtain: false });
    expect(scenes(socket).at(-1)).not.toBeNull();
    expect(JSON.stringify(socket.frames().slice(before))).toContain('560');
    online.stop();
  });

  it('refuses players\' moves while play is paused, saying so, and takes them again once it goes on', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, socket } = await running();
    online.give(['gm-ogre'], ANA);
    await advance(500);
    const ogre = bodies(socket).filter((body) => body.t === 'tokens').at(-1)?.tokens?.[0];
    const scene = (scenes(socket).at(-1) as { id: string }).id;
    if (ogre === undefined) throw new Error('no token list');

    tableControlsStore.setState({ paused: true });
    await advance(100);
    expect(modes(socket).at(-1)).toMatchObject({ paused: true });
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene, id: ogre.id, x: 420, y: 140 } });
    await advance(500);
    expect(bodies(socket, ANA).at(-1)).toMatchObject({ t: 'move-refused', x: 140, y: 140, reason: 'paused' });

    // The fake store takes no writes: a move taken is one that is not refused
    tableControlsStore.setState({ paused: false });
    await advance(100);
    const refusals = (): number => bodies(socket, ANA).filter((body) => body.t === 'move-refused').length;
    const before = refusals();
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene, id: ogre.id, x: 420, y: 140 } });
    await advance(500);
    expect(refusals()).toBe(before);
    online.stop();
  });
});
