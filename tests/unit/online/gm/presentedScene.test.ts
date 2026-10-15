// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TokenEntity } from '../../../../src/app/types';
import type { App, WorkspaceLeaf } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { Ownership, readOwnership } from '../../../../src/app/online/gm/ownership.ts';
import { findPresentedTab, PRESENT_COMMAND, presentedScene, readPresented, showPresentedElsewhere } from '../../../../src/app/online/gm/presentedScene.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, atlasTab, FakeSocket, FakeTabs, png, present, switchScene, workspace } from './fakeTable.ts';
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
}));

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

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const CAVE = 'Scenes/Cave.atlasmap';
const HALL = 'Scenes/Hall.atlasmap';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, mapPath: CAVE, gate: { code: '483912', requireCode: true, askToJoin: true } };
const character = (id: string, name: string, x: number): TokenEntity => ({ id, kind: 'character', name, imagePath: 'art/ogre.png', x, y: 140 });
const cave = (x = 140): SceneState => sceneState({ mapPath: CAVE, background: 'maps/cave.png', objects: { ...sceneState().objects, tokens: { 'gm-ogre': character('gm-ogre', 'Ogre', x) } } });
const hall = (): SceneState => sceneState({ mapPath: HALL, background: 'maps/hall.png', objects: { ...sceneState().objects, tokens: { 'gm-goblin': character('gm-goblin', 'Goblin', 700) } } });

type Body = { readonly t: string; readonly scene?: unknown; readonly id?: string; readonly tokens?: readonly { readonly id: string; readonly x: number }[] };
const bodies = (socket: FakeSocket, to?: string): Body[] => socket.frames().flatMap((frame) => (frame.t === 'send' && frame.body !== undefined && (to === undefined || frame.to === to) ? [frame.body as Body] : []));
const scenes = (socket: FakeSocket, to?: string): unknown[] => bodies(socket, to).filter((body) => body.t === 'scene').map((body) => body.scene);
const mapHash = (scene: unknown): unknown => (scene as { map?: { hash?: string } } | null)?.map?.hash;

/** A running table restored from `SAVED`, welcomed by the relay with Ana at it. */
async function running(ownership = new Ownership(readOwnership(undefined), () => undefined)): Promise<{ online: OnlineControl; socket: FakeSocket }> {
  const online = new OnlineControl(app, ownership);
  online.resume(SAVED);
  await advance(0);
  const socket = FakeSocket.all.at(-1);
  if (socket === undefined) throw new Error('no socket');
  socket.relay({ t: 'welcome', role: 'gm', players: [{ id: ANA, name: 'Ana' }] });
  await advance(500);
  return { online, socket };
}

describe('the scene players see', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('WebSocket', FakeSocket);
    FakeSocket.all = [];
    seen.notices.length = 0;
    workspace.leaves = [];
    workspace.presented = null;
    workspace.shownElsewhere = 0;
    workspace.files = new Map([['maps/cave.png', png(700, 700)], ['maps/hall.png', png(350, 350)], ['art/ogre.png', png(4, 4)]]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('stays the presented scene while the GM opens another map in its view, and changes only when Atlas presents another', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, socket } = await running();
    const shown = scenes(socket).at(-1);
    expect(mapHash(shown)).toBeDefined();
    online.give(['gm-ogre'], ANA);
    await advance(500);
    const ogre = bodies(socket, undefined).filter((body) => body.t === 'tokens').at(-1)?.tokens?.[0];
    if (ogre === undefined) throw new Error('no token list');

    // The GM opens the Hall in the same view: players are sent nothing of it, nothing at all.
    const before = socket.frames().length;
    switchScene(tab, hall());
    await advance(3_000);
    expect(socket.frames().slice(before)).toEqual([]);

    // Ana's move of her ogre is refused at the place players see, her release is not taken; Ben, joining now, gets the held Cave.
    const scene = (shown as { id: string }).id;
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene, id: ogre.id, x: 420, y: 140 } });
    socket.relay({ t: 'game', from: ANA, body: { t: 'release', scene, id: ogre.id } });
    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(500);
    expect(bodies(socket, ANA).at(-1)).toMatchObject({ t: 'move-refused', x: 140, y: 140 });
    expect(online.ownership.ownerOf('gm-ogre', undefined)).toBe(ANA);
    expect(scenes(socket, BEN)).toEqual([shown]);
    expect(bodies(socket, BEN).find((body) => body.t === 'tokens')?.tokens).toMatchObject([{ id: ogre.id, x: 140 }]);
    expect(JSON.stringify(socket.frames().slice(before))).not.toMatch(/Goblin|hall\.png|Hall/);

    // Back on the presented Cave, players follow it live again: no new scene, the moved ogre.
    switchScene(tab, cave(560));
    await advance(1_500);
    expect(scenes(socket).at(-1)).toEqual(shown);
    expect(JSON.stringify(socket.frames().slice(before))).toContain('560');

    // The GM presents the Hall with the eye: players switch to it.
    switchScene(tab, hall());
    present(tab);
    await advance(1_500);
    expect(mapHash(scenes(socket).at(-1))).not.toBe(mapHash(shown));
    expect(scenes(socket).at(-1)).not.toBeNull();
    online.stop();
  });

  it('keeps a player\'s character theirs on the next scene the GM presents, as Foundry keeps an actor\'s tokens its owner\'s', async () => {
    const hero = (id: string, x: number): TokenEntity => ({ ...character(id, 'Hero', x), assetId: 'library-hero' });
    const scene = (mapPath: string, background: string, tokens: Record<string, TokenEntity>): SceneState => sceneState({ mapPath, background, objects: { ...sceneState().objects, tokens } });
    const tab = atlasTab(scene(CAVE, 'maps/cave.png', { 'cave-hero': hero('cave-hero', 140), 'gm-ogre': character('gm-ogre', 'Ogre', 300) }));
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, socket } = await running();
    online.give(['cave-hero'], ANA);
    await advance(500);

    // The Hall holds another token of the same library character, and a goblin nobody was given.
    switchScene(tab, scene(HALL, 'maps/hall.png', { 'hall-hero': hero('hall-hero', 200), 'gm-goblin': character('gm-goblin', 'Goblin', 700) }));
    present(tab);
    await advance(1_500);
    const listed = bodies(socket).filter((body) => body.t === 'tokens').at(-1)?.tokens ?? [];
    const hallHero = listed.find((entry) => entry.x === 200)?.id;
    const mine = bodies(socket, ANA).filter((body) => body.t === 'mine').at(-1) as { tokens?: readonly string[] } | undefined;
    expect(hallHero).toBeDefined();
    expect(mine?.tokens).toEqual([hallHero]);
    expect(online.playerTokens().map(({ tokenId, owner }) => [tokenId, owner?.name])).toEqual([['hall-hero', 'Ana']]);

    // Ana moves her hero on the Hall: taken, while her move of the goblin is refused.
    const hallScene = (scenes(socket).at(-1) as { id: string }).id;
    const goblin = listed.find((entry) => entry.x === 700)?.id;
    const before = bodies(socket, ANA).length;
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene: hallScene, id: hallHero, x: 260, y: 140 } });
    socket.relay({ t: 'game', from: ANA, body: { t: 'move', scene: hallScene, id: goblin, x: 640, y: 140 } });
    await advance(500);
    expect(bodies(socket, ANA).slice(before).filter((body) => body.t === 'move-refused').map((body) => body.id)).toEqual([goblin]);
    online.stop();
  });

  it('tells Atlas that players see its presented scene online while a table runs, also after Atlas reloads', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    expect(workspace.shownElsewhere).toBe(0);
    const { online, socket } = await running();
    expect(workspace.shownElsewhere).toBe(1);

    // A reloaded Atlas has a presented scene of its own, which is told at the next change
    const atlas = (app as unknown as { plugins: { plugins: Record<string, { presentedScene: object }> } }).plugins.plugins['atlas-vtt'];
    if (atlas === undefined) throw new Error('no Atlas');
    const before = atlas.presentedScene;
    const reloaded = { ...before };
    atlas.presentedScene = reloaded;
    socket.relay({ t: 'player-joined', id: BEN, name: 'Ben' });
    await advance(500);
    expect(workspace.shownElsewhere).toBe(1);

    online.stop();
    await advance(500);
    expect(workspace.shownElsewhere).toBe(0);
    atlas.presentedScene = before;
  });

  it('is none while Atlas presents nothing, and none again once it presents nothing', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    const { online, socket } = await running();
    expect(scenes(socket)).toEqual([null]);
    expect(bodies(socket).some((body) => body.t === 'tokens')).toBe(false);

    present(tab);
    await advance(1_500);
    expect(mapHash(scenes(socket).at(-1))).toBeDefined();

    workspace.presented = null;
    await advance(1_500);
    expect(scenes(socket).at(-1)).toBeNull();
    expect(seen.notices.some((text) => text.includes('Atlas presents no map'))).toBe(true);
    online.stop();
  });

  it('moves to another view once that view shows the presented tab; until then players keep the scene they had', async () => {
    const first = atlasTab(cave());
    const second = atlasTab(hall());
    second.view.tabMetaStore.activate(CAVE);
    workspace.leaves = [first.leaf, second.leaf];
    present(first);
    const { online, socket } = await running();
    const shown = scenes(socket).at(-1);

    // Atlas presents the Hall tab of the second view, which shows the Cave now: players keep the first view's Cave.
    workspace.presented = { tabId: FakeTabs.idOf(HALL), filePath: HALL };
    const before = socket.frames().length;
    await advance(1_500);
    expect(socket.frames().slice(before)).toEqual([]);
    second.view.tabMetaStore.activate(HALL);
    await advance(1_500);
    expect(mapHash(scenes(socket).at(-1))).not.toBe(mapHash(shown));
    expect(online.table?.sharedTab).toBe(second.leaf);
    online.stop();
  });
});

describe('what Atlas presents', () => {
  const tabsLeaf = (tabs: FakeTabs, isPlayerView = false): WorkspaceLeaf => ({ view: { tabMetaStore: tabs, atlasStore: { getState: () => ({ isPlayerView }) } } }) as unknown as WorkspaceLeaf;

  it('is read from Atlas\'s presented scene, with or without its player window, by tab id, else by file', () => {
    const atlas = (presented: unknown): App => ({ plugins: { plugins: { 'atlas-vtt': { presentedScene: { get: () => presented, onChange: () => () => undefined } } } } }) as unknown as App;
    expect(presentedScene(atlas({ tabId: 't1', filePath: CAVE }))).toEqual({ tabId: 't1', filePath: CAVE });
    expect(presentedScene(atlas(null))).toBeNull();
    // An Atlas without the accessor presents nothing the companion can read
    expect(presentedScene({ plugins: { plugins: { 'atlas-vtt': {} } } } as unknown as App)).toBeNull();
    expect(readPresented({ tabId: 't1', filePath: CAVE, frozen: false })).toEqual({ tabId: 't1', filePath: CAVE });
    for (const state of [undefined, null, {}, { tabId: '', filePath: CAVE }, { tabId: 't1' }, { tabId: 1, filePath: CAVE }]) expect(readPresented(state)).toBeNull();
    const caveTabs = new FakeTabs(CAVE);
    const both = new FakeTabs(HALL);
    both.activate(CAVE);
    const leaves = [tabsLeaf(new FakeTabs(CAVE), true), tabsLeaf(caveTabs), tabsLeaf(both)];
    expect(findPresentedTab(leaves, { tabId: FakeTabs.idOf(HALL), filePath: HALL })?.leaf).toBe(leaves[2]);
    // Tab ids made anew: the first view with the file, never a player view.
    expect(findPresentedTab(leaves, { tabId: 'gone', filePath: CAVE })).toMatchObject({ leaf: leaves[1], tabId: FakeTabs.idOf(CAVE) });
    expect(findPresentedTab(leaves, null)).toBeNull();
    expect(findPresentedTab(leaves, { tabId: 'gone', filePath: 'Scenes/None.atlasmap' })).toBeNull();
  });

  it('tells Atlas it shows the presented scene, and tells nothing to an Atlas without the call', () => {
    const shown = vi.fn();
    const stop = vi.fn();
    const presentedSceneOf = (source: object): App => ({ plugins: { plugins: { 'atlas-vtt': { presentedScene: source } } } }) as unknown as App;
    const atlasNow = presentedSceneOf({ get: () => null, onChange: () => () => undefined, showElsewhere: () => { shown(); return stop; } });
    const told = showPresentedElsewhere(atlasNow);
    expect(shown).toHaveBeenCalledOnce();
    told?.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(showPresentedElsewhere(presentedSceneOf({ get: () => null, onChange: () => () => undefined }))).toBeNull();
    expect(showPresentedElsewhere({ plugins: { plugins: {} } } as unknown as App)).toBeNull();
  });

  it('is named as Atlas names its accessor and its command', () => {
    const vendor = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
    const read = (file: string): string => fs.readFileSync(path.join(vendor, file), 'utf8');
    expect(read('main.ts')).toMatch(/get presentedScene\(\): PresentedSceneSource \{\s*return presentedSceneOf\(this\.app\);/);
    const [plugin, command] = PRESENT_COMMAND.split(':');
    expect(JSON.parse(read('manifest.json'))).toMatchObject({ id: plugin });
    expect(read('src/app/plugin/registerCommands.ts')).toMatch(new RegExp(`id: '${command ?? ''}',[^}]*presentActiveTab\\(`));
  });
});
