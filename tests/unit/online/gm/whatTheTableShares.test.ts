import { createHash } from 'node:crypto';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIGHTING_REFUSAL } from '../../../../src/app/online/gm/atlasLighting.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { fakeAtlasTab } from './fakeAtlasTab.ts';
import { FakeRelay } from './fakeRelay.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { app, atlasTab, png, present, storedAccount, switchScene, workspace, type FakeTab } from './fakeTable.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import type { PlayerPages } from './playerPages.ts';
import { advanceSettled as advance } from './settled.ts';
import { GRID_SIZE, sceneState, token } from './shareHarness.ts';

/*
 * What a running table hands each page of the scene Atlas presents, read from the GM's tab as Atlas draws it: a lit
 * scene, an unlit one, a lit scene whose upper floor has a roof, a scene being loaded, a lit scene whose tab has
 * no lighting to read, and a tab without a renderer. The last two fail closed: players see nothing of the scene.
 */

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

const notices = vi.hoisted((): string[] => []);
vi.mock('../../../../src/app/ui/notice', async (original) => ({
  ...(await original<typeof import('../../../../src/app/ui/notice')>()),
  showNotice: (text: string) => void notices.push(text),
}));

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const CAVE = 'Scenes/Cave.atlasmap';
const MAP = { width: 1400, height: 1400 };
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: CAVE, gate: { code: '483912', requireCode: false, askToJoin: false } };
const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }];
const ASSIGNMENTS = { owners: { ana: ANA, ben: BEN }, playerTokens: {} };
/** Sight, and a sense that reaches through walls. */
const VISION = { enabled: true, senses: [{ id: 'tremorsense', range: 60 }] } as TokenEntity['vision'];

/** How the GM's tab draws the scene: its lighting read through the renderer, a renderer without lighting, or none at all. */
type Renderer = 'lit' | 'no lighting' | 'none';

/**
 * A bright scene with a wall down the middle and a closed door in it. Ana's character, who senses through walls, and an
 * ogre stand west of the wall, a goblin east of it; with `floors`, Ben's character stands on an upper floor whose map has a roof over it.
 */
function cave(lit: boolean, floors = false): SceneState {
  const characters = (id: string, name: string, place: Partial<TokenEntity>): TokenEntity => ({ ...token(id, place), kind: 'character', name } as TokenEntity);
  const tokens: Record<string, TokenEntity> = {
    ana: characters('ana', 'Ana', { x: 210, y: 350, vision: VISION }),
    ogre: characters('ogre', 'Ogre', { x: 350, y: 630 }),
    goblin: characters('goblin', 'Goblin', { x: 910, y: 350 }),
    ...(floors && { ben: characters('ben', 'Ben', { x: 210, y: 350, level: 'upper', vision: VISION }), wight: characters('wight', 'Wight', { x: 910, y: 350, level: 'upper' }) }),
  };
  const walls: Record<string, WallSegment> = {
    west: { id: 'west', kind: 'wall', p1: { x: 700, y: 0 }, p2: { x: 700, y: 560 } } as WallSegment,
    door: { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 700, y: 560 }, p2: { x: 700, y: 840 } } as WallSegment,
    east: { id: 'east', kind: 'wall', p1: { x: 700, y: 840 }, p2: { x: 700, y: 1400 } } as WallSegment,
  };
  const levels: SceneLevel[] = [
    { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/cave.png' },
    { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png', foreground: 'maps/roof.png' },
  ];
  const base = sceneState({ mapPath: CAVE, background: 'maps/cave.png', grid: { size: GRID_SIZE } as SceneState['grid'], lighting: { enabled: lit, ambient: 1 }, ...(floors && { levels, viewedLevel: 'ground' }) });
  return { ...base, objects: { ...base.objects, tokens, walls } };
}

/**
 * A reference to one of the vault's files, by the file's path instead of its hash, size and id. The test's images are
 * deflated by Node's zlib, whose output differs from one Node version to the next; which file a page is sent does not.
 * A reference to anything else (what the table makes itself) stays as it is.
 */
function byFile(text: string): string {
  const paths = new Map<string, string>();
  for (const [path, bytes] of workspace.files) {
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!paths.has(hash)) paths.set(hash, path);
  }
  return text.replace(/"hash":"([0-9a-f]{64})","size":\d+,"mime":"([^"]*)"(?:,"id":"[0-9a-f]{64}")?/g, (ref, hash: string, mime: string) => {
    const path = paths.get(hash);
    return path === undefined ? ref : `"file":"${path}","mime":"${mime}"`;
  });
}

/** The last message of each kind a page read, ids numbered in the order they first appear; when it came is left out. */
function holds(pages: PlayerPages, player: string): Record<string, string> {
  const known = new Map<string, string>();
  const numbered = (text: string): string => byFile(text).replace(/\b[0-9a-f]{24}\b/g, (id) => {
    if (!known.has(id)) known.set(id, `#${known.size}`);
    return known.get(id)!;
  });
  const last = new Map<string, unknown>();
  for (const body of pages.of(player).all()) last.set(body.t, body);
  const kinds = [...last.keys()].filter((kind) => kind !== 'asset-progress').sort();
  return Object.fromEntries(kinds.map((kind) => [kind, numbered(JSON.stringify(last.get(kind))).replace(/"(at|seq)":\d+/g, '"$1":0')]));
}

/** A table on `state`, drawn by `renderer`, with Ana and Ben seated. */
async function table(state: SceneState, renderer: Renderer): Promise<{ readonly tab: FakeTab; readonly relay: FakeRelay; readonly online: OnlineControl }> {
  const tab = atlasTab(state);
  if (renderer === 'lit') tab.view.renderer = fakeAtlasTab({ state: () => tab.store.getState(), source: GENERIC_SOURCE, bounds: MAP, grid: () => ({ size: GRID_SIZE }) }).renderer;
  if (renderer === 'none') tab.view.renderer = null;
  workspace.leaves = [tab.leaf];
  present(tab);
  const relay = new FakeRelay();
  const online = new OnlineControl(app, boundOwnership(PLAYERS, ASSIGNMENTS), fakeCampaigns(PLAYERS, ASSIGNMENTS), undefined, storedAccount(), undefined, undefined, relay.open);
  void online.resume(SAVED);
  await advance(0);
  relay.outbox.welcome(PLAYERS);
  await advance(3_000);
  return { tab, relay, online };
}

/** What Ana's and Ben's pages hold once a table on `state` settled. */
async function shared(state: SceneState, renderer: Renderer): Promise<Record<string, Record<string, string>>> {
  const { relay, online } = await table(state, renderer);
  const held = { ana: holds(relay.pages, ANA), ben: holds(relay.pages, BEN) };
  online.stop();
  return held;
}

/** The GM's notices that name the scene's lighting. */
const lightingNotices = (): string[] => notices.filter((text) => text.includes('lighting'));

describe('what a running table shares of the scene Atlas presents', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.leaves = [];
    workspace.presented = null;
    notices.length = 0;
    // Each file has bytes of its own, so a reference names the file it is of and no other with the same bytes.
    workspace.files = new Map([['maps/cave.png', png(700, 700)], ['maps/upper.png', png(350, 350)], ['maps/roof.png', png(351, 351)]]);
    ['ana', 'ogre', 'goblin', 'ben', 'wight'].forEach((name, index) => workspace.files.set(`art/${name}.webp`, png(4 + index, 4 + index)));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shares a lit scene as the GM\'s lighting shows it to players', async () => {
    const held = await shared(cave(true), 'lit');
    expect(held.ana['lighting']).toBeDefined();
    expect(held.ana['doors']).not.toContain('"doors":[]');
    expect(held.ana['sensed']).not.toContain('"tokens":[]');
    expect(lightingNotices()).toEqual([]);
    expect(held).toMatchSnapshot();
  });

  it('shares an unlit scene without lighting', async () => {
    const held = await shared(cave(false), 'lit');
    expect(held.ana['scene']).toBeDefined();
    expect(held).toMatchSnapshot();
  });

  it('shares a lit scene of two floors, the upper one under a roof, each player on their own floor', async () => {
    const held = await shared(cave(true, true), 'lit');
    expect(held.ben['scene']).toBeDefined();
    expect(held).toMatchSnapshot();
  });

  it('tells no page of a scene while it loads, and shares it once loaded', async () => {
    const { tab, relay, online } = await table(cave(false), 'lit');
    const before = relay.pages.mark();
    const lit = cave(true);
    switchScene(tab, { ...lit, mapPath: 'Scenes/Hall.atlasmap', mapLoaded: false, isMapLoading: true });
    await advance(3_000);
    const whileLoading = relay.pages.since(before);
    tab.store.set({ ...lit, mapPath: 'Scenes/Hall.atlasmap' });
    await advance(3_000);
    const held = { ana: holds(relay.pages, ANA), ben: holds(relay.pages, BEN) };
    online.stop();
    expect({ whileLoading, held }).toMatchSnapshot();
  });

  it('refuses a lit scene whose tab has no lighting to read: players see nothing of it', async () => {
    const held = await shared(cave(true), 'no lighting');
    expect(held.ana['scene']).toBe('{"t":"scene","scene":null}');
    expect(lightingNotices()).toEqual([LIGHTING_REFUSAL]);
    expect(held).toMatchSnapshot();
  });

  it('shares nothing of a scene whose tab has no renderer', async () => {
    const held = await shared(cave(true), 'none');
    expect(held.ana['scene']).toBe('{"t":"scene","scene":null}');
    expect(lightingNotices()).toEqual([]);
    expect(held).toMatchSnapshot();
  });
});
