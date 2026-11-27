import type { SharedScene } from '../../../../src/app/online/protocol/index.ts';
import type { SeatSource } from '../../../../src/app/online/gm/seatSource.ts';
import type { SceneState } from '../../../../src/app/online/gm/atlasView.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { SceneLevel } from '../../../../src/app/types/sceneLevelTypes';
import type { WallSegment } from '../../../../src/app/types/wallTypes';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../../../src/app/online/gm/assetServe.ts';
import { stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import { generateDungeon } from '../../../../src/app/dungeons/generate';
import { mapLayout } from '../../../../src/app/dungeons/render/layoutSize';
import { floorLevels } from '../../../../src/app/dungeons/scene/createDungeonScene';
import { dungeonScene } from '../../../../src/app/dungeons/scene/toScene';
import { DEFAULT_VIEW } from '../../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../../src/app/dungeons/styleCatalog';
import { toAll, type PageMessage, type PlayerPage } from './playerPages.ts';
import { sceneState, shareHarness, token, type ShareHarness } from './shareHarness.ts';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const CARA = 'c'.repeat(20);
const GROUND_MAP = new Uint8Array(64).map((_, index) => index);
const UPPER_MAP = new Uint8Array(64).map((_, index) => 255 - index);

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.webp' },
  { id: 'upper', name: 'Tower top', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.webp' },
];
const IMAGES = new Map([['maps/ground.webp', GROUND_MAP], ['maps/upper.webp', UPPER_MAP]]);
const OWNERS: Readonly<Record<string, string>> = { ana: ANA, ben: BEN };

/** A scene of two floors with Ana's token and a goblin on the ground and Ben's token and an ogre upstairs; `changes` over it. */
function floors(tokens: Record<string, Partial<TokenEntity>> = {}, changes: Partial<SceneState> = {}): SceneState {
  const all: Record<string, TokenEntity> = {
    ana: token('ana', { x: 100, y: 100 }),
    goblin: token('goblin', { x: 300, y: 100 }),
    ben: token('ben', { x: 100, y: 100, level: 'upper' }),
    ogre: token('ogre', { x: 300, y: 100, level: 'upper' }),
  };
  for (const [id, change] of Object.entries(tokens)) all[id] = { ...(all[id] ?? token(id)), ...change } as TokenEntity;
  const state = sceneState({ levels: LEVELS, viewedLevel: 'ground', background: 'maps/ground.webp', ...changes });
  return { ...state, objects: { ...state.objects, ...changes.objects, tokens: all } };
}

/** Ana, Ben and Cara at the table; Ana and Ben own their tokens, Cara none. */
function seats(online: readonly string[] = [ANA, BEN, CARA]): SeatSource {
  return { onlinePlayers: () => online, ownerOf: (id) => OWNERS[id], claimOf: (_map, id) => (OWNERS[id] === undefined ? null : 'taken') };
}

/** A table of Ana, Ben and Cara, whose pages are connected before anything is shared. */
function seated(state: SceneState, online?: readonly string[], images = IMAGES): ShareHarness {
  const table = shareHarness(state, images, seats(online));
  table.pages.join(ANA, BEN, CARA);
  return table;
}

async function started(state = floors(), online?: readonly string[]): Promise<ShareHarness> {
  const table = seated(state, online);
  table.presented = 'ground';
  table.share.start();
  await table.set(state);
  await table.advance(1000);
  return table;
}

const sceneIdOf = (body: PageMessage): string | undefined => ('scene' in body && typeof body.scene === 'string' ? body.scene : undefined);
/** The ids players know tokens by, the same on every floor. */
const aliasesOf = (table: ShareHarness): Map<string, string> => (table.share as unknown as { tokens: { aliases: Map<string, string> } }).tokens.aliases;
const names = (page: PlayerPage): string[] => page.tokens.map((entry) => entry.name ?? '?').sort();
const sceneOf = (table: ShareHarness, player: string): SharedScene | null | undefined => table.pages.of(player).scene;

describe('players climbing a generated Fortress', () => {
  it('tells players climbing a Fortress the floor above', async () => {
    const model = generateDungeon({ seed: 7, theme: 'fortress', tags: ['small'], floors: 3 });
    const layout = mapLayout(model, 100, DEFAULT_VIEW);
    const parts = dungeonScene(model, dungeonStyle('parchment'), DEFAULT_VIEW, { originCell: layout.originCell, pxPerCell: 100 }, { width: layout.widthPx, height: layout.heightPx }, { unitType: 'feet', ruleDistance: 5 })!;
    const ids = parts.levelIds!;
    const paths = ids.map((_, floor) => `maps/floor-${floor}.webp`);
    const levels = floorLevels(ids, paths, stackOf(model));
    const images = new Map(paths.map((path, floor) => [path, new Uint8Array(64).map((_, index) => (index * (floor + 3)) % 256)]));
    const state = sceneState({ levels, viewedLevel: ids[0], background: paths[0] });
    const tokens = { ana: token('ana', { x: 100, y: 100, level: ids[1] }), ben: token('ben', { x: 100, y: 100, level: ids[2] }) };
    const climbing = { ...state, objects: { ...state.objects, tokens } };
    const table = seated(climbing, undefined, images);
    table.presented = ids[0]!;
    table.share.start();
    await table.set(climbing);
    await table.advance(1000);
    expect(sceneOf(table, ANA)?.floor).toMatchObject({ level: 1 });
    expect(sceneOf(table, BEN)?.floor).toMatchObject({ level: 2 });
    expect(sceneOf(table, CARA)?.floor).toMatchObject({ level: 0 });
  });
});

describe('players on different floors of one scene', () => {
  it('sends each player the floor their token stands on, with its map and name, and players without a token the presented floor', async () => {
    const table = await started(floors({ ana: { kind: 'character', name: 'Ana' } as Partial<TokenEntity>, goblin: { kind: 'character', name: 'Goblin' } as Partial<TokenEntity>, ben: { kind: 'character', name: 'Ben' } as Partial<TokenEntity>, ogre: { kind: 'character', name: 'Ogre' } as Partial<TokenEntity> }));
    const ana = sceneOf(table, ANA);
    const ben = sceneOf(table, BEN);
    const cara = sceneOf(table, CARA);
    expect(ana).toMatchObject({ map: { hash: await sha256Hex(GROUND_MAP) }, floor: { level: 0 } });
    expect(ben?.floor).not.toHaveProperty('name');
    expect(ben).toMatchObject({ map: { hash: await sha256Hex(UPPER_MAP) }, floor: { level: 1 } });
    expect(cara?.id).toBe(ana?.id);
    expect(ben?.floor?.group).toBe(ana?.floor?.group);
    expect(names(table.pages.of(ANA))).toEqual(['Ana', 'Goblin']);
    expect(names(table.pages.of(BEN))).toEqual(['Ben', 'Ogre']);
  });

  it('never sends a player anything of a floor they do not stand on, and nothing to all while players stand apart', async () => {
    const table = await started();
    await table.set(floors({ ogre: { x: 320 }, goblin: { x: 340 } }));
    await table.advance(1000);
    const ground = sceneOf(table, ANA)!.id;
    const upper = sceneOf(table, BEN)!.id;
    expect(toAll(table.sent)).toEqual([]);
    for (const [player, floor] of [[ANA, ground], [BEN, upper], [CARA, ground]] as const) {
      for (const body of table.pages.of(player).inbox) {
        const scene = sceneIdOf(body) ?? (body.t === 'scene' ? body.scene?.id : undefined);
        if (scene !== undefined) expect(scene, `${body.t} to ${player}`).toBe(floor);
      }
    }
  });

  it('sends a floor to all at once while every player stands on the presented floor', async () => {
    const table = await started(floors({ ben: { level: 'ground' } }));
    const shared = table.sent.filter(({ body }) => body.t === 'scene' || body.t === 'tokens');
    expect(shared.length).toBeGreaterThan(0);
    expect(toAll(shared)).toEqual(shared);
  });

  it('takes a player along when their token takes the stairs: they get the floor it reached, and nothing more of the one it left', async () => {
    const table = await started();
    const upper = sceneOf(table, BEN)!.id;
    const before = table.pages.mark();
    await table.set(floors({ ana: { level: 'upper', x: 150 } }));
    await table.advance(1000);
    const after = table.pages.since(before);
    expect(sceneOf(table, ANA)?.id).toBe(upper);
    expect(after[ANA]?.some(({ t }) => t === 'scene')).toBe(true);
    expect(after[ANA]?.every((body) => (sceneIdOf(body) ?? upper) === upper)).toBe(true);
    // Both upstairs: Cara, who has no token, still sees the presented floor, and hears nothing of the one upstairs
    expect((after[CARA] ?? []).every((body) => (sceneIdOf(body) ?? '') !== upper)).toBe(true);
  });

  it('keeps the tokens of another floor from a player, and works out what they see upstairs while the GM looks at the ground', async () => {
    const wall: WallSegment = { id: 'w', p1: { x: 200, y: 0 }, p2: { x: 200, y: 400 }, type: 'wall', levels: ['upper'] } as WallSegment;
    const lit = { lighting: { enabled: true, ambient: 1 } } as Partial<SceneState>;
    const vision = { vision: { enabled: true } } as Partial<TokenEntity>;
    const table = await started(floors({ ben: vision, ana: vision }, { ...lit, objects: { ...sceneState().objects, walls: { w: wall } } }));
    const benLists = (): string[] => table.pages.of(BEN).tokens.map((entry) => entry.id);
    const alias = (id: string): string | undefined => aliasesOf(table).get(id);
    // The ogre stands behind the upstairs wall; the goblin downstairs never reaches Ben.
    expect(benLists()).toEqual([alias('ben')]);
    await table.set(floors({ ben: vision, ana: vision, ogre: { x: 150 } }, { ...lit, objects: { ...sceneState().objects, walls: { w: wall } } }));
    await table.advance(1000);
    expect(benLists().sort()).toEqual([alias('ben'), alias('ogre')].sort());
    expect(JSON.stringify(table.pages.of(BEN).inbox)).not.toContain(alias('goblin') ?? 'none');
  });

  it('stops a player\'s token at the walls of its own floor, whichever floor the GM looks at', async () => {
    const wall = (id: string, x: number, level: string): WallSegment => ({ id, p1: { x, y: 0 }, p2: { x, y: 400 }, type: 'wall', levels: [level] }) as WallSegment;
    const lit = { lighting: { enabled: true, ambient: 1 }, objects: { ...sceneState().objects, walls: { low: wall('low', 150, 'ground'), high: wall('high', 200, 'upper') } } } as Partial<SceneState>;
    const vision = { vision: { enabled: true } } as Partial<TokenEntity>;
    const table = await started(floors({ ana: vision, ben: vision }, lit));
    const aliases = aliasesOf(table);
    const ground = sceneOf(table, ANA)!.id;
    const upper = sceneOf(table, BEN)!.id;
    table.share.receive(BEN, { t: 'move', scene: upper, id: aliases.get('ben')!, x: 300, y: 100 });
    table.share.receive(ANA, { t: 'move', scene: ground, id: aliases.get('ana')!, x: 300, y: 100 });
    // A move named by another floor's scene is not taken
    table.share.receive(BEN, { t: 'move', scene: ground, id: aliases.get('ben')!, x: 120, y: 100 });
    await table.advance(1000);
    const { ana, ben } = table.state().objects.tokens;
    expect(ben!.x).toBeGreaterThan(150);
    expect(ben!.x).toBeLessThan(200);
    expect(ana!.x).toBeLessThan(150);
  });

  it('tells the books which tokens players see, each on its own floor, whichever floor the GM looks at', async () => {
    const table = await started(floors({ ogre: { isHidden: true } }));
    const { mapPath } = table.state();
    expect([...table.share.shown(mapPath!, ['ana', 'ben', 'goblin', 'ogre']).keys()].sort()).toEqual(['ana', 'ben', 'goblin']);
  });

  it('follows the token a player last moved where they have tokens on several floors', async () => {
    (OWNERS as Record<string, string>).ana2 = ANA;
    try {
      const table = await started(floors({ ana2: { x: 500, y: 100 } }));
      const ground = sceneOf(table, ANA)!.id;
      const ana2 = aliasesOf(table).get('ana2')!;
      table.share.receive(ANA, { t: 'move', scene: ground, id: ana2, x: 510, y: 100 });
      await table.advance(1000);
      expect(table.pages.of(ANA).all('move-refused')).toEqual([]);
      // The token she moved goes upstairs (as on stairs), her other one stays: she follows the one she moved
      await table.set(floors({ ana2: { x: 510, y: 100, level: 'upper' } }));
      await table.advance(1000);
      const upper = sceneOf(table, BEN)!.id;
      expect(sceneOf(table, ANA)?.id).toBe(upper);
      // Acting with the token she still has downstairs (picked in her book) takes her back once she sees it
      const after = table.sent.length;
      table.share.heard(ANA, { t: 'book-token', scene: upper, token: ana2 });
      expect(table.sent.length).toBe(after);
    } finally {
      delete (OWNERS as Record<string, string>).ana2;
    }
  });
});
