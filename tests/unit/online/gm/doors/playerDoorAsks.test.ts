import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import type { SceneState, SceneStore } from '../../../../../src/app/online/gm/atlasView.ts';
import { PlayerDoorAsks, type DoorAskShown } from '../../../../../src/app/online/gm/doors/PlayerDoorAsks.ts';
import { parseGmMessage, parsePlayerMessage, sameDoor, type DoorEnds, type GmMessage } from '../../../../../src/app/online/protocol/index.ts';
import type { WallSegment } from '../../../../../src/app/types/wallTypes';
import { token } from '../shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const SCENE = 'scene-1';
const ALIAS = '1'.repeat(24);
const CELL = 70;
/** A door one cell wide, right of the ogre's cell. */
const DOOR: DoorEnds = [140, 70, 140, 140];

function door(changes: Partial<WallSegment> = {}): WallSegment {
  return { id: 'door', kind: 'wall', type: 'door', p1: { x: 140, y: 70 }, p2: { x: 140, y: 140 }, closed: true, ...changes } as WallSegment;
}

function fakeStore(walls: Record<string, WallSegment>, ogre = { x: 105, y: 105 }): SceneStore & { writes: number } {
  let state = { objects: { tokens: { ogre: token('ogre', ogre) }, walls }, grid: { enabled: true, size: CELL, offsetX: 0, offsetY: 0, opacity: 1 } } as unknown as SceneState;
  const listeners = new Set<(next: SceneState) => void>();
  const store = {
    writes: 0,
    getState: () => state,
    setState: (recipe: (draft: SceneState) => void) => {
      store.writes += 1;
      state = produce(state, recipe);
      for (const listener of [...listeners]) listener(state);
    },
    subscribe: (listener: (next: SceneState) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

function desk(store: SceneStore, allowed = true): { asks: PlayerDoorAsks; shown: DoorAskShown[]; withdrawn: string[]; sent: { body: GmMessage; to: string }[]; bumps: unknown[][] } {
  const shown: DoorAskShown[] = [];
  const withdrawn: string[] = [];
  const sent: { body: GmMessage; to: string }[] = [];
  const bumps: unknown[][] = [];
  let now = 0;
  const asks = new PlayerDoorAsks(store, {
    allowed: () => allowed,
    scene: () => SCENE,
    listedToken: (alias) => (alias === ALIAS ? 'ogre' : undefined),
    ownerOf: (id) => (id === 'ogre' ? ANA : undefined),
    nameOf: (player) => (player === ANA ? 'Ana' : null),
    send: (body, to) => sent.push({ body, to }),
    now: () => (now += 5000),
    ask: (ask) => {
      shown.push(ask);
      return () => withdrawn.push(ask.key);
    },
    bump: (...args) => bumps.push(args),
  });
  return { asks, shown, withdrawn, sent, bumps };
}

const ask = (ends: DoorEnds = DOOR, id = ALIAS) => ({ t: 'door-ask' as const, scene: SCENE, id, door: ends });

describe('players asking to open doors', () => {
  it('shows the GM the ask of a player whose token stands at a closed door, by the player\'s name, at the door\'s middle', () => {
    const table = desk(fakeStore({ door: door() }));
    table.asks.receive(ANA, ask());
    expect(table.shown).toHaveLength(1);
    expect(table.shown[0]).toMatchObject({ who: 'Ana', at: { x: 140, y: 105 }, player: ANA });
  });

  it('opens the door when the GM lets them in, unlocking it, and tells the player', () => {
    const store = fakeStore({ door: door({ locked: true }) });
    const table = desk(store);
    table.asks.receive(ANA, ask());
    table.shown[0]?.answer(true);
    expect(store.getState().objects.walls.door?.closed).toBe(false);
    expect(store.getState().objects.walls.door?.locked).toBeUndefined();
    expect(table.sent).toEqual([{ body: { t: 'door-answer', scene: SCENE, door: DOOR, open: true }, to: ANA }]);
    expect(table.withdrawn).toEqual([`door:${ANA}`]);
  });

  it('keeps the door shut when the GM says no, and tells the player', () => {
    const store = fakeStore({ door: door() });
    const table = desk(store);
    table.asks.receive(ANA, ask());
    table.shown[0]?.answer(false);
    expect(store.writes).toBe(0);
    expect(table.sent.map(({ body }) => body)).toEqual([{ t: 'door-answer', scene: SCENE, door: DOOR, open: false }]);
  });

  it('answers the ask when the GM opens the door another way, and withdraws it when the door is gone', () => {
    const store = fakeStore({ door: door() });
    const table = desk(store);
    table.asks.receive(ANA, ask());
    store.setState((draft) => void (draft.objects.walls.door!.closed = false));
    expect(table.sent.at(-1)?.body).toMatchObject({ t: 'door-answer', open: true });
    store.setState((draft) => void (draft.objects.walls.door!.closed = true));
    table.asks.receive(ANA, ask());
    store.setState((draft) => void delete draft.objects.walls.door);
    expect(table.withdrawn).toHaveLength(2);
    expect(table.sent).toHaveLength(1);
  });

  it('takes no ask while the GM does not allow them, from another\'s token, for a door far away, a secret door or one asked about already', () => {
    expect(desk(fakeStore({ door: door() }), false).shown).toHaveLength(0);
    const table = desk(fakeStore({ door: door() }));
    table.asks.receive(BEN, ask());
    expect(table.shown).toHaveLength(0);
    const far = desk(fakeStore({ door: door() }, { x: 600, y: 600 }));
    far.asks.receive(ANA, ask());
    expect(far.shown).toHaveLength(0);
    const secret = desk(fakeStore({ door: door({ type: 'secret-door' }) }));
    secret.asks.receive(ANA, ask());
    expect(secret.shown).toHaveLength(0);
    table.asks.receive(ANA, ask());
    table.asks.receive(ANA, ask([140, 140, 140, 70]));
    expect(table.shown).toHaveLength(1);
  });

  it('tells a player whose door already stands open that it is open', () => {
    const table = desk(fakeStore({ door: door({ closed: false }) }));
    table.asks.receive(ANA, ask());
    expect(table.shown).toHaveLength(0);
    expect(table.sent[0]?.body).toMatchObject({ t: 'door-answer', open: true });
    // A door away from the token is never told of, open or not
    const far = desk(fakeStore({ door: door({ closed: false }) }, { x: 600, y: 600 }));
    far.asks.receive(ANA, ask());
    expect(far.sent).toHaveLength(0);
  });

  it('withdraws a player\'s asks when they leave or the scene stops', () => {
    const table = desk(fakeStore({ door: door() }));
    table.asks.receive(ANA, ask());
    table.asks.playerLeft(ANA);
    expect(table.withdrawn).toEqual([`door:${ANA}`]);
    table.asks.receive(ANA, ask());
    table.asks.stop();
    expect(table.withdrawn).toHaveLength(2);
  });

  it('shows the bumps of a player\'s own token only', () => {
    const table = desk(fakeStore({}));
    table.asks.receive(ANA, { t: 'bump', scene: SCENE, id: ALIAS, dx: 1, dy: 0 });
    table.asks.receive(BEN, { t: 'bump', scene: SCENE, id: ALIAS, dx: 1, dy: 0 });
    expect(table.bumps).toEqual([['ogre', 1, 0]]);
  });
});

describe('the door messages', () => {
  it('read asks, bumps and answers, and refuse malformed ones', () => {
    expect(parsePlayerMessage(ask())).toEqual(ask());
    expect(parsePlayerMessage({ ...ask(), door: [1, 2, 3] })).toBeNull();
    expect(parsePlayerMessage({ t: 'bump', scene: SCENE, id: ALIAS, dx: 0.7, dy: -0.7 })).toMatchObject({ dx: 0.7, dy: -0.7 });
    expect(parsePlayerMessage({ t: 'bump', scene: SCENE, id: ALIAS, dx: 0, dy: 0 })).toBeNull();
    expect(parsePlayerMessage({ t: 'bump', scene: SCENE, id: ALIAS, dx: 2, dy: 0 })).toBeNull();
    expect(parseGmMessage({ t: 'door-answer', scene: SCENE, door: DOOR, open: false })).toEqual({ t: 'door-answer', scene: SCENE, door: DOOR, open: false });
    expect(parseGmMessage({ t: 'door-answer', scene: SCENE, door: DOOR })).toBeNull();
  });

  it('name one door by its ends either way round', () => {
    expect(sameDoor(DOOR, [140, 140, 140, 70])).toBe(true);
    expect(sameDoor(DOOR, [140, 70, 140, 141])).toBe(false);
  });
});
