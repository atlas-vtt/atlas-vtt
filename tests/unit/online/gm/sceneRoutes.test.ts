import { describe, expect, it } from 'vitest';
import type { GmMessage } from '../../../../src/app/online/protocol/index.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import { PARTY, type FloorRoutes } from '../../../../src/app/online/gm/floorRoutes.ts';
import type { Floor } from '../../../../src/app/online/gm/playerFloors.ts';
import { SceneRoutes } from '../../../../src/app/online/gm/sceneRoutes.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import { GENERIC_SIGHT_RULES } from '../../../../src/app/vision/sightRules';
import { sceneState, token } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];
const BODY: GmMessage = { t: 'scene', scene: null };
const SEEING = { vision: { enabled: true } } as Partial<TokenEntity>;

/** A dark scene where Ana's and Ben's tokens see; on `floors` 2 Ben's stands upstairs and the ground is presented. */
function scene(floors: 1 | 2): SceneState {
  const state = sceneState({ lighting: { enabled: true, ambient: 0 }, ...(floors === 2 && { levels: LEVELS, viewedLevel: 'ground' }) });
  const tokens = { ana: token('ana', SEEING), ben: token('ben', { ...SEEING, ...(floors === 2 && { level: 'upper' }) }) };
  return { ...state, objects: { ...state.objects, tokens } };
}

interface Routes {
  readonly routes: SceneRoutes;
  /** What went out: to whom, `*` for all. */
  readonly sent: string[];
  floor(floor: Floor): FloorRoutes;
  place(joining?: readonly string[]): void;
}

function routes(floors: 1 | 2, online: readonly string[], sharedVision = false): Routes {
  const state = scene(floors);
  const sent: string[] = [];
  const routes = new SceneRoutes({
    send: (_body, to) => void sent.push(to ?? '*'),
    split: () => floors === 2,
    onlinePlayers: () => online,
    sharedVision: () => sharedVision,
  });
  const ownerOf = (id: string): string | undefined => OWNERS[id];
  return {
    routes, sent,
    floor: (floor) => routes.open(floor, () => ({ ...state, viewedLevel: floor ?? undefined })),
    place: (joining = []) => void routes.placeFloors({ state, ownerOf, acting: new Map(), presented: floors === 2 ? 'ground' : null }, joining, true),
  };
}

describe('who hears a floor\'s message', () => {
  it('goes to all at once on a scene of one floor, and on a scene of floors to each player of the floor while the scene\'s players stand apart', () => {
    const one = routes(1, [ANA, BEN]);
    one.place();
    one.floor(null).send(BODY, undefined);
    expect(one.sent).toEqual(['*']);
    const two = routes(2, [ANA, BEN, CARA]);
    two.place();
    two.floor('ground').send(BODY, undefined);
    two.floor('upper').send(BODY, undefined);
    two.floor('upper').send(BODY, ANA);
    expect(two.sent).toEqual([ANA, CARA, BEN]);
  });

  it('places nobody by sending: a player not placed counts as on the presented floor until placed as joining', () => {
    const two = routes(2, [ANA]);
    two.place();
    expect(two.routes.isPlaced(BEN)).toBe(false);
    expect(two.routes.floorOf(BEN)).toBe('ground');
    two.place([BEN]);
    expect(two.routes.floorOf(BEN)).toBe('upper');
  });
});

describe('who hears a picture\'s message', () => {
  it('reaches a page not placed on the floor with nothing, and every page at once only while everyone shares the party\'s picture', () => {
    const own = routes(1, [ANA, BEN]);
    own.place();
    const floor = own.floor(null);
    floor.send(BODY, undefined, PARTY);
    floor.send(BODY, ANA, PARTY);
    expect(own.sent).toEqual([]);
    floor.placeEyes({ rules: GENERIC_SIGHT_RULES, ownerOf: (id) => OWNERS[id] }, []);
    floor.send(BODY, undefined, `player:${ANA}`);
    floor.send(BODY, BEN, `player:${ANA}`);
    expect(own.sent).toEqual([ANA]);
    const shared = routes(1, [ANA, BEN], true);
    shared.place();
    shared.floor(null).send(BODY, undefined, PARTY);
    expect(shared.sent).toEqual(['*']);
  });

  it('forgets a player who left at once, and closes their picture once the floor places its players again', () => {
    const online = [ANA, BEN];
    const table = routes(1, online);
    table.place();
    const floor = table.floor(null);
    const eyes = { rules: GENERIC_SIGHT_RULES, ownerOf: (id: string) => OWNERS[id] };
    floor.placeEyes(eyes, []);
    expect(floor.audiences()).toEqual([`player:${ANA}`, `player:${BEN}`]);
    online.splice(1);
    floor.playerLeft(BEN);
    expect(floor.audiences()).toEqual([`player:${ANA}`]);
    expect(floor.placeEyes(eyes, []).closed).toEqual([`player:${BEN}`]);
  });
});
