import type { TokenEntity } from '../../../../src/app/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { app, atlasTab, png, present, switchScene, workspace, storedAccount } from './fakeTable.ts';
import { tableControlsStore } from '../../../../src/app/stores/tableControlsStore';
import { sceneState } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';
import type { PageMessage } from './playerPages.ts';
import { FakeRelay } from './fakeRelay.ts';

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

/** The scenes a player's page was sent, in order. */
const scenes = (relay: FakeRelay, player = ANA): unknown[] => relay.pages.of(player).all('scene').map(({ scene }) => scene);

/** A running table restored from `SAVED`, welcomed by the relay with Ana at it. */
async function running(): Promise<{ online: OnlineControl; relay: FakeRelay }> {
  const players = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
  const relay = new FakeRelay();
  const online = new OnlineControl(app, boundOwnership(players), fakeCampaigns(players), undefined, storedAccount(), undefined, undefined, relay.open);
  void online.resume(SAVED);
  await advance(0);
  relay.outbox.welcome([{ id: ANA, name: 'Ana' }]);
  await advance(500);
  return { online, relay };
}

/** How the table plays, as a player's page was told it, in order. */
const modes = (relay: FakeRelay, player = ANA): PageMessage[] => relay.pages.of(player).all('table-mode');

describe('the GM\'s controls over the online table', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    seen.notices.length = 0;
    workspace.leaves = [];
    workspace.presented = null;
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
    const { online, relay } = await running();
    expect(tableControlsStore.getState().online).toBe(true);
    const sent = relay.pages.of(ANA).inbox;
    expect(sent.findIndex((body) => body.t === 'table-mode')).toBeLessThan(sent.findIndex((body) => body.t === 'scene'));
    expect(modes(relay).at(-1)).toEqual({ t: 'table-mode', mode: 'table', curtain: false, paused: false });

    tableControlsStore.setState({ playMode: 'remote' });
    await advance(100);
    expect(modes(relay).at(-1)).toEqual({ t: 'table-mode', mode: 'remote', curtain: false, paused: false });

    relay.outbox.join({ id: BEN, name: 'Ben' });
    await advance(500);
    expect(modes(relay, BEN)).toEqual([{ t: 'table-mode', mode: 'remote', curtain: false, paused: false }]);
    online.stop();
    expect(tableControlsStore.getState().online).toBe(false);
  });

  it('sends no scene while the curtain is down, nothing the GM does behind it, and the scene again once it is lifted', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, relay } = await running();
    const shown = scenes(relay).at(-1);
    expect(shown).not.toBeNull();

    tableControlsStore.setState({ curtain: true });
    await advance(100);
    expect(modes(relay).at(-1)).toMatchObject({ curtain: true });
    expect(scenes(relay).at(-1)).toBeNull();
    const before = relay.outbox.told.length;
    switchScene(tab, cave(560));
    await advance(3_000);
    expect(JSON.stringify(relay.outbox.told.slice(before))).not.toContain('560');
    relay.outbox.join({ id: BEN, name: 'Ben' });
    await advance(500);
    expect(scenes(relay, BEN)).toEqual([null]);
    expect(seen.notices).toEqual([]);

    tableControlsStore.setState({ curtain: false });
    await advance(1_500);
    expect(modes(relay).at(-1)).toMatchObject({ curtain: false });
    expect(scenes(relay).at(-1)).not.toBeNull();
    expect(JSON.stringify(relay.outbox.told.slice(before))).toContain('560');
    online.stop();
  });

  it('refuses players\' moves while play is paused, saying so, and takes them again once it goes on', async () => {
    const tab = atlasTab(cave());
    workspace.leaves = [tab.leaf];
    present(tab);
    const { online, relay } = await running();
    online.give(['gm-ogre'], ANA);
    await advance(500);
    const ogre = relay.pages.of(ANA).tokens[0];
    const scene = (scenes(relay).at(-1) as { id: string }).id;
    if (ogre === undefined) throw new Error('no token list');

    tableControlsStore.setState({ paused: true });
    await advance(100);
    expect(modes(relay).at(-1)).toMatchObject({ paused: true });
    relay.outbox.from(ANA, { t: 'move', scene, id: ogre.id, x: 420, y: 140 });
    await advance(500);
    expect(relay.pages.of(ANA).last('move-refused')).toMatchObject({ x: 140, y: 140, reason: 'paused' });

    // The fake store takes no writes: a move taken is one that is not refused
    tableControlsStore.setState({ paused: false });
    await advance(100);
    const refusals = (): number => relay.pages.of(ANA).all('move-refused').length;
    const before = refusals();
    relay.outbox.from(ANA, { t: 'move', scene, id: ogre.id, x: 420, y: 140 });
    await advance(500);
    expect(refusals()).toBe(before);
    online.stop();
  });
});
