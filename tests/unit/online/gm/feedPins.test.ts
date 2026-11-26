import { createHash } from 'node:crypto';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { Measurements } from '../../../../src/app/pixi/measure/measurements';
import type { DrawingStroke, NotePin, TokenEntity } from '../../../../src/app/types';
import type { LiquidSurface } from '../../../../src/app/types/liquidTypes';
import type { FogOperation } from '../../../../src/app/types/fogTypes';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import type { ViewState } from '../../../../src/app/types/viewState';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toBase64 } from '../../../../src/app/online/gm/assetServe.ts';
import { fakeLayers } from './fakeAtlasTab.ts';
import { GENERIC_SOURCE, gmPerception, PLAYER_SETTINGS } from './gmLighting.ts';
import { FakeLaser } from './markHarness.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';
import { counter, timer, type WidgetSceneState } from './widgetFixtures.ts';

/*
 * Every message each feed of a shared scene puts on the wire over a scripted session, in order: to every page at
 * once (`*`) or to one player (`>name`), its kind, the number of a sequenced message and a digest of all it says.
 * The session holds every feed busy (the scene, tokens, owned tokens, fog, lighting, sight, memory, the map's
 * layers, widgets, drawings, the rules, the live lane and the marks) and runs it through a scene change, a resend
 * to one player and to all, resyncs, bursts of updates within one interval, a drag, a refresh of the assets, a
 * change of owners, Shared vision switched, players leaving and joining, and the scene withdrawn.
 */

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const DAN = 'd'.repeat(20);
const SHORT: Readonly<Record<string, string>> = { [ANA]: 'ana', [BEN]: 'ben', [CARA]: 'cara', [DAN]: 'dan' };
const MAP = { width: 3000, height: 3000 };
const IMAGES = new Map([['maps/cave.webp', new Uint8Array([9, 9, 9])], ['maps/vault.webp', new Uint8Array([7, 7, 7])]]);
const DARKVISION = { enabled: true, senses: [{ id: 'darkvision', range: 30 }] };
const GRID = { enabled: true, size: 70, offsetX: 0, offsetY: 0, opacity: 1 } as SceneState['grid'];
const WALLS: Record<string, WallSegment> = {
  between: { id: 'between', kind: 'wall', type: 'solid', p1: { x: 500, y: 0 }, p2: { x: 500, y: 1000 } } as WallSegment,
  door: { id: 'door', kind: 'wall', type: 'door', closed: true, p1: { x: 1000, y: 100 }, p2: { x: 1000, y: 300 } } as WallSegment,
};
const DEN: NotePin = { id: 'den', kind: 'pin', x: 950, y: 250, notePath: 'Notes/Den.md', readable: true } as NotePin;
const FOG: FogOperation = { id: 'fog', kind: 'fog', timestamp: 1, isErasing: false, type: 'rectangle', x: 280, y: 230, width: 60, height: 60 };
const MORE_FOG: FogOperation = { id: 'more', kind: 'fog', timestamp: 2, isErasing: false, type: 'rectangle', x: 1500, y: 1500, width: 80, height: 80 };
const PEN: DrawingStroke = { id: 'pen', kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 600, y: 100 }, { x: 700, y: 100 }], color: '#abcdef', width: 4, opacity: 1 };
const MASK = `data:image/png;base64,${toBase64(new Uint8Array([137, 80, 78, 71, 1]))}`;
const NEWER_MASK = `data:image/png;base64,${toBase64(new Uint8Array([137, 80, 78, 71, 2]))}`;

const entry = (tokenId: string, order: number, initiative: number, turn: number): InitiativeEntry => ({
  id: `e_${tokenId}`, tokenId, name: tokenId, initiative, initiativeModifier: 0, imagePath: '', isActive: order === turn, isNPC: false, order,
});
const POOL: LiquidSurface = { id: 'liquid_pool', kind: 'liquid', liquid: 'water', polygon: [{ x: 600, y: 600 }, { x: 800, y: 600 }, { x: 800, y: 800 }, { x: 600, y: 800 }], colors: { surface: '#4f86a8', deep: '#1d3f5c', glint: '#e8f7ff' } };
const character = (id: string, name: string, changes: Partial<TokenEntity>): TokenEntity => ({ ...token(id, changes), kind: 'character', name } as TokenEntity);

type FeedState = WidgetSceneState & Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>>;

interface Step {
  readonly tokens?: Readonly<Record<string, Partial<TokenEntity>>>;
  readonly changes?: Partial<FeedState>;
  readonly fog?: Readonly<Record<string, FogOperation>>;
  readonly drawings?: Readonly<Record<string, DrawingStroke>>;
  readonly turn?: number;
  readonly count?: number;
  readonly liquids?: Readonly<Record<string, LiquidSurface>>;
}

/** A dim scene: Ana and a rat in one room, Ben and a goblin beyond the wall by a readable pin and a door, fog, a drawing, a fight and widgets. */
function scene({ tokens = {}, changes = {}, fog = { fog: FOG }, drawings = { pen: PEN }, turn = 0, count = 3, liquids }: Step = {}): FeedState {
  const all: Record<string, TokenEntity> = {
    ana: character('ana', 'Ana', { x: 200, y: 200, vision: DARKVISION }),
    rat: character('rat', 'Rat', { x: 300, y: 250 }),
    ben: character('ben', 'Ben', { x: 800, y: 200, vision: DARKVISION }),
    goblin: character('goblin', 'Goblin', { x: 900, y: 300 }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...all[id]!, ...change } as TokenEntity;
  const base = sceneState({ lighting: { enabled: true, ambient: 0.2 }, grid: GRID, exploredMask: MASK });
  const entries = [entry('ana', 0, 18, turn), entry('goblin', 1, 12, turn), entry('ben', 2, 9, turn)];
  return {
    ...base,
    objects: { ...base.objects, walls: WALLS, tokens: all, pins: { den: DEN }, fog: { ...fog }, drawings: { ...drawings }, ...(liquids !== undefined && { liquids: { ...liquids } }) },
    initiative: { entries, currentIndex: turn, round: 1, isActive: true, config: { autoSort: true } },
    initiativeTrackerOpen: true,
    widgetSettings: { widgets: { hearts: counter('hearts'), sand: timer('sand') }, globalVisible: true, position: 'top', scale: 1 },
    widgetValues: { hearts: count },
    ...changes,
  };
}

const digest = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** Random ids, numbered as they first go out. */
class Ids {
  private readonly known = new Map<string, string>();

  of(text: string): string {
    return text.replace(/\b[0-9a-f]{24}\b/g, (id) => {
      if (!this.known.has(id)) this.known.set(id, `#${this.known.size}`);
      return this.known.get(id)!;
    });
  }
}

/** What went on the wire, step by step: one line per message sent. */
class Wire {
  readonly lines: string[] = [];
  private read = 0;
  private readonly ids = new Ids();

  constructor(private readonly harness: ShareHarness) {}

  step(name: string): void {
    this.lines.push(`# ${name}`);
    for (const { body, to, live } of this.harness.sent.slice(this.read)) {
      const kind = body.t === 'delta' ? `delta/${body.of}` : body.t;
      const seq = 'seq' in body ? `#${body.seq}` : '';
      const via = to === undefined ? '*' : `>${SHORT[to] ?? to}`;
      const lane = live === undefined ? '' : ` live:${this.ids.of(live).replace(/\n/g, '/')}`;
      this.lines.push(`${via} ${kind}${seq}${lane} ${digest(this.ids.of(JSON.stringify(body)))}`);
    }
    this.read = this.harness.sent.length;
  }
}

const OWNERS: Record<string, string> = { ana: ANA, ben: BEN };

async function session(): Promise<{ readonly harness: ShareHarness; readonly wire: Wire; readonly online: string[]; readonly laser: FakeLaser; set(name: string, step: Step, wait?: number): Promise<void> }> {
  const online = [ANA, BEN, CARA];
  const seats: SeatSource = { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
  const start = scene();
  const harness = shareHarness(start, IMAGES, seats);
  harness.pages.join(...online);
  harness.settings = { ...PLAYER_SETTINGS, sharedVision: false, playersDraw: true, showCursors: true };
  harness.perception = gmPerception(start, GENERIC_SOURCE, MAP);
  harness.layers = fakeLayers({ state: () => harness.state(), source: GENERIC_SOURCE, bounds: MAP, grid: () => ({ type: 'square', size: 70, offsetX: 0, offsetY: 0, enabled: true }) });
  const aura = { live: null, kept: [{ id: 'aura', kind: 'measure', shape: 'circle', points: [{ x: 900, y: 300 }, { x: 1000, y: 300 }], follows: 'goblin', aura: 10 }] } as unknown as Measurements;
  const laser = new FakeLaser();
  harness.marks = {
    measurements: { get: () => aura, subscribe: () => () => undefined }, laser, laserLook: () => ({ color: '#ff0059', size: 16 }), footprints: () => [],
    seen: () => (tokenId) => harness.perception?.(tokenId) === 'seen',
  };
  harness.share.start();
  await harness.set(start);
  await harness.advance(6000);
  const wire = new Wire(harness);
  wire.step('start');
  const set = async (name: string, step: Step, wait = 2000): Promise<void> => {
    const next = scene(step);
    harness.perception = gmPerception(next, GENERIC_SOURCE, MAP);
    await harness.set(next);
    await harness.advance(wait);
    wire.step(name);
  };
  return { harness, wire, online, laser, set };
}

describe('the messages each feed sends', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stay as they were recorded', async () => {
    const { harness, wire, online, laser, set } = await session();
    const { share } = harness;
    const sceneId = (): string => harness.pages.of(ANA).scene?.id ?? '';

    // A burst of moves within one interval: the first goes at once, the last after the interval.
    for (const x of [910, 920, 930, 940, 950]) {
      const next = scene({ tokens: { goblin: { x } } });
      harness.perception = gmPerception(next, GENERIC_SOURCE, MAP);
      await harness.set(next);
      await harness.advance(10);
    }
    await harness.advance(2000);
    wire.step('a burst of moves');
    const moved = { goblin: { x: 950 } };

    // Fog, the turn, a counter and a drawing change in one write, then again before the interval is out.
    const pen2 = { ...PEN, id: 'pen2', points: [{ x: 200, y: 600 }, { x: 300, y: 600 }] };
    const busy = scene({ tokens: moved, fog: { fog: FOG, more: MORE_FOG }, turn: 1, count: 4, drawings: { pen: PEN, pen2 }, liquids: { pool: POOL } });
    await harness.set(busy);
    await harness.advance(20);
    const now = { tokens: moved, fog: { fog: FOG, more: MORE_FOG }, turn: 2, count: 5, drawings: { pen: PEN, pen2 }, liquids: { pool: { ...POOL, liquid: 'lava' as const } } };
    await set('a burst across the feeds', now);

    // The GM drags the goblin: the live lane carries it, the drop lands it in the list.
    for (const x of [960, 970, 980, 990]) {
      const next = scene({ ...now, tokens: { goblin: { x } }, changes: { heldTokens: { goblin: { x: 950, y: 300 } }, isDragging: true } });
      harness.perception = gmPerception(next, GENERIC_SOURCE, MAP);
      await harness.set(next);
      await harness.advance(15);
    }
    await harness.advance(1500);
    wire.step('a drag that rests');
    await set('the drop', { ...now, tokens: { goblin: { x: 990 } } });
    const dropped = { ...now, tokens: { goblin: { x: 990 } } };

    // The GM's laser, and a player's.
    laser.at = [400, 400];
    laser.on = true;
    laser.pts = [400, 400, 410, 400];
    laser.changed();
    await harness.advance(20);
    laser.pts = [410, 400, 420, 400];
    laser.changed();
    share.receive(BEN, { t: 'laser', scene: sceneId(), color: '#66ffa9', size: 16, at: [850, 250], pts: [850, 250, 860, 250], on: true });
    await harness.advance(2000);
    wire.step('lasers');

    // A player draws: the drawings and what is theirs.
    share.receive(ANA, { t: 'draw-add', scene: sceneId(), n: 1, mode: 'pen', pts: [150, 150, 250, 250], look: { colour: '#e93147', size: 'm' } });
    await harness.advance(2000);
    wire.step('Ana draws');

    // Resyncs: answered whole once a second at most, only for the scene shown.
    for (const of of ['tokens', 'fog', 'sight'] as const) share.receive(ANA, { t: 'resync', scene: sceneId(), of });
    share.receive(ANA, { t: 'resync', scene: sceneId(), of: 'tokens' });
    share.receive(BEN, { t: 'resync', scene: 'another', of: 'tokens' });
    wire.step('resyncs');
    await harness.advance(1000);
    share.receive(ANA, { t: 'resync', scene: sceneId(), of: 'tokens' });
    wire.step('a resync a second later');

    share.resend(BEN);
    wire.step('resend to Ben');
    share.resend();
    wire.step('resend to all');
    await harness.advance(2000);
    wire.step('after the resends');

    share.refreshAssets();
    await harness.advance(2000);
    wire.step('the assets refreshed');

    OWNERS.goblin = CARA;
    share.ownersChanged();
    await harness.advance(2000);
    wire.step('the goblin given to Cara');

    harness.perception = gmPerception(scene({ ...dropped, changes: { exploredMask: NEWER_MASK } }), GENERIC_SOURCE, MAP);
    await set('the memory saved again', { ...dropped, changes: { exploredMask: NEWER_MASK } }, 6000);
    const remembered = { ...dropped, changes: { exploredMask: NEWER_MASK } };

    harness.settings = { ...harness.settings, sharedVision: true };
    await harness.advance(2000);
    wire.step('Shared vision on');
    await set('the rat moves under Shared vision', { ...remembered, tokens: { ...remembered.tokens, rat: { x: 320 } } });

    harness.pages.leave(BEN);
    share.playerLeft(BEN);
    online.splice(online.indexOf(BEN), 1);
    share.ownersChanged();
    await harness.advance(2000);
    wire.step('Ben leaves');
    harness.pages.join(DAN);
    share.resend(DAN);
    online.push(DAN);
    share.ownersChanged();
    await harness.advance(2000);
    wire.step('Dan joins');

    harness.settings = { ...harness.settings, sharedVision: false };
    await harness.advance(2000);
    wire.step('Shared vision off');

    await set('another map', { ...remembered, changes: { exploredMask: NEWER_MASK, mapPath: 'Scenes/Vault.atlasmap', background: 'maps/vault.webp' } });
    await set('a burst on the other map', { ...remembered, tokens: { goblin: { x: 700 } }, changes: { exploredMask: NEWER_MASK, mapPath: 'Scenes/Vault.atlasmap', background: 'maps/vault.webp' } }, 30);
    await harness.advance(2000);
    wire.step('the burst settles');

    share.withdraw();
    await harness.advance(2000);
    wire.step('withdrawn');
    share.stop();
    delete OWNERS.goblin;
    await expect(`${wire.lines.join('\n')}\n`).toMatchFileSnapshot('./recordings/feedSession.wire.txt');
  });
});
