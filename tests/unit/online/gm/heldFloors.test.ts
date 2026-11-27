import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DICE_RULES } from '../../../../src/app/gameSystems/diceRules';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import { fakeAtlasTab } from './fakeAtlasTab.ts';
import { FakeRelay } from './fakeRelay.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { app, atlasTab, png, present, storedAccount, switchScene, workspace, type FakeTab } from './fakeTable.ts';
import { DICE_TOOL, realDice, type DiceToolClass, type RealDice } from './realDice.ts';
import { GENERIC_SOURCE } from './gmLighting.ts';
import type { PageMessage, PlayerPages } from './playerPages.ts';
import { advanceSettled as advance } from './settled.ts';
import { GRID_SIZE, sceneState, token } from './shareHarness.ts';

/*
 * While the GM works on another scene tab of the shared view, players are held on the scene they saw: the
 * store reads as that scene frozen (`PresentedStore`), and the binding reads nothing of the view (`HELD_TAB`),
 * whose renderer and dice belong to the scene the GM works on. A running table plays a scene of two floors
 * with a player on each; the GM opens another scene of two floors in the same view and changes what it
 * shows. No page hears any of it, no player's roll lands on the GM's dice, and once the GM is back every
 * page holds what it holds at a table where the GM never left.
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

vi.mock('../../../../src/app/online/gm/atlasLighting.ts', async (original) => ({
  ...(await original<typeof import('../../../../src/app/online/gm/atlasLighting.ts')>()),
  accentColour: () => '#112233',
}));

const { DiceTool } = (await import(/* @vite-ignore */ DICE_TOOL)) as { DiceTool: DiceToolClass };

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const CAL = 'calcalcalcalcalcalca';
const CAVE = 'Scenes/Cave.atlasmap';
const HALL = 'Scenes/Hall.atlasmap';
const MAP = { width: 1400, height: 1400 };
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: CAVE, gate: { code: '483912', requireCode: false, askToJoin: false } };
const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CAL, name: 'Cal' }];
const ASSIGNMENTS = { owners: { 'cave-ana': ANA, 'cave-ben': BEN }, playerTokens: {} };
const VISION = { enabled: true } as TokenEntity['vision'];
/** What a page hears of the table itself, not of any scene: who is there, the log, and how far its assets have come. */
const TABLE_KINDS = new Set(['people', 'log-entry', 'asset-progress']);
/** Anything of the Hall: its creatures' names, its files. */
const HALL_TRACES = /Lich|Wight|Ghoul|Wraith|hall/i;

/** What the GM changes on a scene: tokens moved, the door opened, fog laid, the upper floor looked at. */
interface Changes {
  readonly moved?: boolean;
  readonly door?: 'open';
  readonly fog?: boolean;
  readonly viewed?: 'upper';
}

/**
 * A lit scene of two floors, a wall with a door on the ground, two characters on each floor. In the Cave Ana's
 * token and a goblin stand on the ground, Ben's and an ogre upstairs; the Hall holds only the GM's creatures.
 */
function scene(mapPath: string, names: readonly [string, string, string, string], changes: Changes = {}): SceneState {
  const prefix = mapPath === CAVE ? 'cave' : 'hall';
  const shift = changes.moved === true ? 140 : 0;
  const levels: SceneLevel[] = [
    { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: `maps/${prefix}-ground.png` },
    { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: `maps/${prefix}-upper.png` },
  ];
  const places: readonly Partial<TokenEntity>[] = [
    { x: 140 + shift, y: 140, vision: VISION },
    { x: 420, y: 140 + shift },
    { x: 140 + shift, y: 420, level: 'upper', vision: VISION },
    { x: 420, y: 420 + shift, level: 'upper' },
  ];
  const tokens = Object.fromEntries(names.map((name, index) => {
    const id = `${prefix}-${name.toLowerCase()}`;
    return [id, { ...token(id, places[index]), kind: 'character', name } as TokenEntity];
  }));
  const door = { id: 'door', kind: 'wall', type: 'door', closed: changes.door !== 'open', p1: { x: 700, y: 0 }, p2: { x: 700, y: 700 } } as WallSegment;
  const fog: Record<string, FogOperation> = changes.fog === true
    ? { fog: { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 380, y: 100, width: 80, height: 80 } }
    : {};
  const base = sceneState({ mapPath, background: `maps/${prefix}-ground.png`, levels, viewedLevel: changes.viewed ?? 'ground', lighting: { enabled: true, ambient: 1 } });
  return { ...base, objects: { ...base.objects, tokens, walls: { door }, fog } };
}

const cave = (changes?: Changes): SceneState => scene(CAVE, ['Ana', 'Goblin', 'Ben', 'Ogre'], changes);
const hall = (changes?: Changes): SceneState => scene(HALL, ['Lich', 'Wight', 'Ghoul', 'Wraith'], changes);
const EVERY_CHANGE: Changes = { moved: true, door: 'open', fog: true, viewed: 'upper' };

/** Ids as they first reach a page, numbered: two runs draw their random ids in their own order. */
function numbered(): (text: string) => string {
  const known = new Map<string, string>();
  return (text) => text.replace(/\b[0-9a-f]{24}\b/g, (id) => {
    if (!known.has(id)) known.set(id, `#${known.size}`);
    return known.get(id)!;
  });
}

/**
 * What a page holds now: the last message of each kind it read, ids numbered in the order of the kinds. When a
 * log entry was made, how many messages of a kind came before and which uploads are under way differ between
 * two runs, not what a page holds.
 */
function holds(pages: PlayerPages, player: string): Record<string, string> {
  const ids = numbered();
  const last = new Map<string, PageMessage>();
  for (const body of pages.of(player).all()) last.set(body.t, body);
  const kinds = [...last.keys()].filter((kind) => kind !== 'asset-progress').sort();
  return Object.fromEntries(kinds.map((kind) => [kind, ids(JSON.stringify(last.get(kind))).replace(/"(at|seq)":\d+/g, '"$1":0')]));
}

/** The asset hashes and ids a text names. */
const assetsIn = (text: string): string[] => text.match(/\b[0-9a-f]{64}\b/g) ?? [];

interface Run {
  /** Every message each page read while the GM was away (or, at the table that stays, at the same time). */
  readonly away: Readonly<Record<string, readonly PageMessage[]>>;
  /** What each page holds once the GM is back on the Cave. */
  readonly after: Readonly<Record<string, Record<string, string>>>;
  /** Everything every page read, as text. */
  readonly traffic: string;
}

interface Table {
  readonly tab: FakeTab;
  readonly relay: FakeRelay;
  readonly online: OnlineControl;
  /** The view's dice: Atlas's dice tool, which throws on the GM's screen whatever scene the view shows. */
  readonly dice: RealDice;
}

/** A table on the Cave with Ana on the ground and Ben upstairs. The view's renderer draws whatever scene its store holds. */
async function openCave(): Promise<Table> {
  const tab = atlasTab(cave());
  tab.view.renderer = fakeAtlasTab({ state: () => tab.store.getState(), source: GENERIC_SOURCE, bounds: MAP, grid: () => ({ size: GRID_SIZE }) }).renderer;
  const dice = realDice(DiceTool, DEFAULT_DICE_RULES, () => 0.5);
  Object.assign(tab.view, { viewId: dice.dice.viewId });
  Object.assign(tab.view.serviceManager, { getToolController: () => ({ getDiceTool: () => ({ rollDice: dice.dice.rollDice, getDiceRules: dice.dice.rules }) }), getEventBus: () => ({ on: dice.dice.on, off: dice.dice.off }) });
  workspace.leaves = [tab.leaf];
  present(tab);
  const relay = new FakeRelay();
  const online = new OnlineControl(app, boundOwnership(PLAYERS, ASSIGNMENTS), fakeCampaigns(PLAYERS, ASSIGNMENTS), undefined, storedAccount(), undefined, undefined, relay.open);
  void online.resume(SAVED);
  await advance(0);
  relay.outbox.welcome([{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }]);
  await advance(2_000);
  return { tab, relay, online, dice };
}

/** The GM opens the Hall in the shared view and changes it step by step: tokens moved, the door opened, fog laid, the upper floor looked at. */
async function workOnHall(tab: FakeTab): Promise<void> {
  switchScene(tab, hall());
  await advance(2_000);
  for (const changes of [{ moved: true }, { moved: true, door: 'open' }, { moved: true, door: 'open', fog: true }, EVERY_CHANGE] as const) {
    tab.store.set(hall(changes));
    await advance(1_000);
  }
}

/**
 * Cal joins the table halfway. With `leave`, the GM works on the Hall meanwhile, then comes back to the Cave
 * as it has changed; without, the GM changes the Cave in place.
 */
async function run(leave: boolean): Promise<Run> {
  const { tab, relay, online } = await openCave();
  const before = relay.pages.mark();
  if (leave) await workOnHall(tab);
  relay.outbox.join({ id: CAL, name: 'Cal' });
  await advance(2_000);
  const away = relay.pages.since(before);

  if (leave) switchScene(tab, cave(EVERY_CHANGE));
  else tab.store.set(cave(EVERY_CHANGE));
  await advance(3_000);
  const after = Object.fromEntries([ANA, BEN, CAL].map((player) => [player, holds(relay.pages, player)]));
  const traffic = JSON.stringify([ANA, BEN, CAL].map((player) => relay.pages.of(player).all()));
  online.stop();
  return { away, after, traffic };
}

describe('a scene held while the GM works on another tab', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.leaves = [];
    workspace.presented = null;
    // The Hall's images differ from the Cave's, so an asset of the Hall cannot pass for one of the Cave.
    workspace.files = new Map([
      ['maps/cave-ground.png', png(700, 700)], ['maps/cave-upper.png', png(350, 350)],
      ['maps/hall-ground.png', png(710, 700)], ['maps/hall-upper.png', png(360, 350)],
    ]);
    for (const name of ['ana', 'goblin', 'ben', 'ogre']) workspace.files.set(`art/cave-${name}.webp`, png(4, 4));
    for (const name of ['lich', 'wight', 'ghoul', 'wraith']) workspace.files.set(`art/hall-${name}.webp`, png(5, 5));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('tells no page anything of what the GM\'s tab shows, and every page catches up on the scene once the GM is back', async () => {
    const held = await run(true);
    const stayed = await run(false);
    // Ana and Ben hear only of Cal joining; Cal is handed the Cave as players last saw it.
    for (const player of [ANA, BEN]) expect((held.away[player] ?? []).map(({ t }) => t).filter((kind) => !TABLE_KINDS.has(kind)), player).toEqual([]);
    expect(held.away[CAL]?.some(({ t }) => t === 'scene')).toBe(true);
    const away = JSON.stringify(held.away);
    expect(away).not.toMatch(HALL_TRACES);
    // Every asset named while the GM was away is one a table that never left the Cave names too.
    const caveAssets = new Set(assetsIn(stayed.traffic));
    expect(assetsIn(away).filter((asset) => !caveAssets.has(asset))).toEqual([]);
    expect(held.traffic).not.toMatch(HALL_TRACES);
    // Back on the Cave, every page holds what it holds at a table where the GM never left.
    expect(held.after).toEqual(stayed.after);
  });

  it('rolls no player\'s dice on the GM\'s tab, which shows another scene, and rolls them again once the GM is back', async () => {
    const { tab, relay, online, dice } = await openCave();
    const scene = relay.pages.of(ANA).scene?.id;
    if (scene === undefined) throw new Error('Ana was shown no scene');
    const roll = (mode: 'public' | 'gm'): void => relay.outbox.from(ANA, { t: 'roll', scene, formula: '1d20 + 2', token: null, mode });
    await workOnHall(tab);
    const away = relay.pages.mark();
    roll('public');
    roll('gm');
    await advance(1_000);
    // Neither is thrown on the GM's screen, logged or rolled by the dice of the scene the view shows: both are refused.
    expect(dice.rolled).toEqual([]);
    expect(relay.pages.since(away)).toEqual({ [ANA]: [{ t: 'roll-refused', reason: 'unavailable' }, { t: 'roll-refused', reason: 'formula' }] });

    switchScene(tab, cave());
    await advance(2_000);
    const back = relay.pages.mark();
    roll('public');
    await advance(1_000);
    expect(dice.rolled).toHaveLength(1);
    expect(relay.pages.since(back, 'roll', 'roll-refused')[ANA]?.map(({ t }) => t)).toEqual(['roll']);
    online.stop();
  });
});
