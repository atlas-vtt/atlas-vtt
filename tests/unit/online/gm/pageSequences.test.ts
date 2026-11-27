import type { TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { OnlineControl } from '../../../../src/app/online/gm/OnlineControl.ts';
import type { SavedTable } from '../../../../src/app/online/gm/savedTable.ts';
import { TOKEN_INTERVAL_MS } from '../../../../src/app/online/gm/TokenShare.ts';
import { boundOwnership, fakeCampaigns } from './fakeSeats.ts';
import { FakeRelay } from './fakeRelay.ts';
import { app, atlasTab, png, present, workspace, storedAccount, type FakeTab } from './fakeTable.ts';
import type { PlayerPage } from './playerPages.ts';
import { sceneState, token } from './shareHarness.ts';
import { advanceSettled as advance } from './settled.ts';

// The GM's marks draw with PIXI over Atlas's canvas, which these tables have no use for.
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

const ANA = 'anaanaanaanaanaanaan';
const BEN = 'benbenbenbenbenbenbe';
const CARA = 'caracaracaracaracara';
const PLAYERS = [{ id: ANA, name: 'Ana' }, { id: BEN, name: 'Ben' }, { id: CARA, name: 'Cara' }];
const MAP = 'Scenes/Keep.atlasmap';
const SAVED: SavedTable = { code: 'a'.repeat(26), secret: 's'.repeat(43), maxPlayers: 12, campaignId: 'c1', mapPath: MAP, gate: { code: '483912', requireCode: false, askToJoin: false } };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];

const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name, imagePath: 'art/token.png' } as TokenEntity);

/** A keep of two floors: Ana and a goblin on the ground, Ben, Cara and an ogre upstairs; the heroes stand at y 100, the goblin and the ogre at y 300 and `x`; `ana` over Ana's token. */
function keep(x: number, ana: Partial<TokenEntity> = {}): SceneState {
  const state = sceneState({ mapPath: MAP, background: 'maps/ground.png', levels: LEVELS, viewedLevel: 'ground' });
  const tokens = {
    ana: character('ana', 'Ana', { x: 100, y: 100, ...ana }),
    goblin: character('goblin', 'Goblin', { x, y: 300 }),
    ben: character('ben', 'Ben', { x: 150, y: 100, level: 'upper' }),
    cara: character('cara', 'Cara', { x: 200, y: 100, level: 'upper' }),
    ogre: character('ogre', 'Ogre', { x, y: 300, level: 'upper' }),
  };
  return { ...state, objects: { ...state.objects, tokens } };
}

/** Where the tokens a page lists stand, as `x,y`. */
const places = (page: PlayerPage): string[] => page.tokens.map(({ x, y }) => `${x},${y}`).sort();
/** Where the monster a page lists stands across. */
const monsterX = (page: PlayerPage): number | undefined => page.tokens.find(({ y }) => y === 300)?.x;
/** The deltas a page read from its `from`th message on. */
const deltasSince = (page: PlayerPage, from: number): number => page.inbox.slice(from).filter(({ t }) => t === 'delta').length;

describe('each player\'s page at a running table', () => {
  let tab: FakeTab;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
    vi.stubGlobal('window', globalThis);
    workspace.files = new Map([['maps/ground.png', png(700, 700)], ['maps/upper.png', png(350, 350)], ['art/token.png', png(4, 4)]]);
    tab = atlasTab(keep(300));
    workspace.leaves = [tab.leaf];
    present(tab);
  });

  afterEach(() => {
    workspace.leaves = [];
    workspace.presented = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** The keep shared with Ana, Ben and Cara, each playing their own token. */
  async function seated(): Promise<{ readonly online: OnlineControl; readonly relay: FakeRelay }> {
    const relay = new FakeRelay();
    const online = new OnlineControl(app, boundOwnership(PLAYERS), fakeCampaigns(PLAYERS), undefined, storedAccount(), undefined, undefined, relay.open);
    void online.resume(SAVED);
    await advance(0);
    relay.outbox.welcome(PLAYERS);
    online.give(['ana'], ANA);
    online.give(['ben'], BEN);
    online.give(['cara'], CARA);
    await advance(1_000);
    return { online, relay };
  }

  /** The goblin and the ogre step to `x`, and the table catches up. */
  const step = async (x: number, ana: Partial<TokenEntity> = {}): Promise<void> => {
    tab.store.set(keep(x, ana));
    await advance(TOKEN_INTERVAL_MS * 2);
  };

  it('reads every token list as following on from what it holds, across a reconnect of its own, a lost link of the GM\'s and a floor change', async () => {
    const { online, relay } = await seated();
    const ana = relay.pages.of(ANA);
    const ben = relay.pages.of(BEN);
    const cara = relay.pages.of(CARA);
    expect(places(ana)).toEqual(['100,100', '300,300']);
    expect(places(ben)).toEqual(['150,100', '200,100', '300,300']);
    await step(310);
    await step(320);
    expect(monsterX(ben)).toBe(320);

    // Ben's page loses its connection while the ogre moves on, before the relay tells the GM, and comes back; Cara upstairs hears on all along. What he missed comes whole, then deltas follow on.
    relay.pages.leave(BEN);
    await step(330);
    relay.outbox.leave(BEN);
    await step(335);
    relay.outbox.join({ id: BEN, name: 'Ben' });
    await advance(1_000);
    const back = ben.inbox.length;
    await step(340);
    await step(350);
    expect(monsterX(ben)).toBe(350);
    expect(deltasSince(ben, back)).toBeGreaterThan(0);

    // The GM's link to the relay is lost while the goblin and the ogre move; the welcome after it sends both pages what they hold anew.
    relay.outbox.close(1006);
    await step(360);
    relay.outbox.welcome(PLAYERS);
    await advance(1_000);
    const welcomed = [ana.inbox.length, ben.inbox.length] as const;
    await step(370);
    expect([monsterX(ana), monsterX(ben)]).toEqual([370, 370]);
    expect(deltasSince(ana, welcomed[0])).toBeGreaterThan(0);
    expect(deltasSince(ben, welcomed[1])).toBeGreaterThan(0);

    // Ana takes the stairs: her page gets the upper floor, its list whole, and deltas of it from there on.
    const ground = ana.scene?.id;
    await step(370, { level: 'upper' });
    expect(ana.scene?.id).not.toBe(ground);
    expect(ana.scene?.id).toBe(ben.scene?.id);
    expect(places(ana)).toEqual(['100,100', '150,100', '200,100', '370,300']);
    const upstairs = ana.inbox.length;
    await step(380, { level: 'upper' });
    expect(monsterX(ana)).toBe(380);
    expect(deltasSince(ana, upstairs)).toBeGreaterThan(0);

    expect(monsterX(cara)).toBe(380);
    for (const page of [ana, ben, cara]) expect(page.gaps).toEqual([]);
    online.stop();
  });
});
