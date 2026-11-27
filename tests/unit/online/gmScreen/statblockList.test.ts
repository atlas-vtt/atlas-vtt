// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { setPlayerTokenSource } from '../../../../src/app/characters/playerTokens';
import type { FrontSceneState } from '../../../../src/app/online/gmScreen/statblocks/frontScene.ts';
import { listedStatblocks } from '../../../../src/app/online/gmScreen/statblocks/statblockList.ts';
import { fightStatblockPaths, playerStatblockPaths, statblocksForScreen, type StatblockScope } from '../../../../src/app/react/components/dm-screen/fightStatblocks';
import type { TokenEntity } from '../../../../src/app/types';
import type { InitiativeEntry } from '../../../../src/app/types/initiativeTypes';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { HP } from '../../../mocks/resourceFixtures';

const PATHS = ['Party/Ilsa.md', 'Bestiary/Goblin.md', 'Bestiary/Ogre.md', 'Bestiary/Wolf.md'];
const token = (id: string, statblockPath: string): TokenEntity => ({ id, kind: 'character', x: 0, y: 0, name: id, statblockPath }) as unknown as TokenEntity;
const TOKENS: Record<string, TokenEntity> = {
  'pc-1': token('pc-1', PATHS[0]!),
  'goblin-1': token('goblin-1', PATHS[1]!),
  'goblin-2': token('goblin-2', PATHS[1]!),
  'ogre-1': token('ogre-1', PATHS[2]!),
  'wolf-1': token('wolf-1', PATHS[3]!),
};
const entry = (tokenId: string, order: number): InitiativeEntry => ({ id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 10 - order, order, isActive: false }) as InitiativeEntry;
/** A fight of the ogre, the player character and a goblin, in that order. */
const FIGHT = [entry('ogre-1', 0), entry('pc-1', 1), entry('goblin-2', 2)];
const SHOWN = new Map(PATHS.map((path) => [path, Object.values(TOKENS).filter((each) => each.kind === 'character' && each.statblockPath === path)]));

function sceneAt(turn: number | null): FrontSceneState {
  const entries = FIGHT.map((each, index) => ({ ...each, isActive: index === turn }));
  return { mapPath: 'atlas-vtt/maps/Camp.atlasmap', mapLoaded: true, isMapLoading: false, objects: { tokens: TOKENS }, initiative: { entries, currentIndex: turn ?? 0, round: 1, isActive: turn !== null } };
}

afterEach(() => setPlayerTokenSource(null));

describe('the statblocks a GM screen device lists', () => {
  it('are the DM screen\'s, in each of its scopes, through a fight\'s turns', () => {
    setPlayerTokenSource({ isPlayers: (ref) => ref.id === 'pc-1', subscribe: () => () => undefined });
    const { app } = createInMemoryApp();
    for (const turn of [null, 0, 1, 2]) {
      const scene = sceneAt(turn);
      const listed = listedStatblocks(app, SHOWN, scene, [HP]);
      // What the device does with the list: the DM screen's own choice, by the flags each entry carries.
      const byPath = new Map(listed.map((each) => [each.path, each]));
      const fight = listed.filter((each) => each.fight).map((each) => each.path);
      const players = new Set(listed.filter((each) => each.player).map((each) => each.path));
      for (const scope of ['fight', 'players', 'npcs', 'all'] as StatblockScope[]) {
        // What `useFightStatblocks` shows for the same scene.
        const dmFight = scene.initiative.isActive ? fightStatblockPaths(scene.initiative.entries, TOKENS).filter((path) => SHOWN.has(path)) : [];
        const dmPlayers = new Set([...playerStatblockPaths(TOKENS)].filter((path) => SHOWN.has(path)));
        const dmScreen = statblocksForScreen(SHOWN, dmFight, scope, dmPlayers).map(([path]) => path);
        expect(statblocksForScreen(byPath, fight, scope, players).map(([path]) => path), `turn ${turn}, ${scope}`).toEqual(dmScreen);
      }
      // The players' and the others' statblocks part the list: none is in both, none in neither.
      const scoped = (scope: StatblockScope): string[] => statblocksForScreen(byPath, fight, scope, players).map(([path]) => path);
      expect([...scoped('players'), ...scoped('npcs')].sort()).toEqual(scoped('all').sort());
      expect(scoped('npcs').filter((path) => scoped('players').includes(path))).toEqual([]);
      expect(scoped('npcs')).toEqual(scoped('all').filter((path) => !playerStatblockPaths(TOKENS).has(path)));
      const holding = turn === null ? null : TOKENS[FIGHT[turn]!.tokenId!]!;
      expect(listed.filter((each) => each.turn).map((each) => each.path)).toEqual(holding?.kind === 'character' ? [holding.statblockPath] : []);
    }
  });

  it('by sides mark the turn as the map\'s turn marker does: a defeated combatant holds none', () => {
    const { app } = createInMemoryApp();
    const fallen = {
      ...TOKENS,
      'pc-1': { ...TOKENS['pc-1']!, side: 'players' } as TokenEntity,
      'ogre-1': { ...TOKENS['ogre-1']!, resources: { hp: { current: 0, max: 12 } } } as TokenEntity,
    };
    const sides = { ...sceneAt(null), objects: { tokens: fallen } };
    const fight: FrontSceneState = { ...sides, initiative: { ...sides.initiative, entries: FIGHT, isActive: true, sides: { first: 'opponents', active: 'opponents' } } };
    const turnOf = (definitions: typeof HP[]): string[] => listedStatblocks(app, SHOWN, fight, definitions).filter((each) => each.turn).map((each) => each.name);

    expect(turnOf([HP])).toEqual(['Goblin']);
    // Without a resource that defeats, the ogre acts with its side
    expect(turnOf([])).toEqual(['Ogre', 'Goblin']);
  });

  it('name each statblock, count its tokens and say which are a player character\'s', () => {
    setPlayerTokenSource({ isPlayers: (ref) => ref.id === 'pc-1', subscribe: () => () => undefined });
    const { app } = createInMemoryApp();
    const listed = listedStatblocks(app, SHOWN, sceneAt(null), [HP]);

    expect(listed.map(({ name, tokens, player, fight }) => ({ name, count: tokens.length, player, fight }))).toEqual([
      { name: 'Ilsa', count: 1, player: true, fight: false },
      { name: 'Goblin', count: 2, player: false, fight: false },
      { name: 'Ogre', count: 1, player: false, fight: false },
      { name: 'Wolf', count: 1, player: false, fight: false },
    ]);
  });
});
