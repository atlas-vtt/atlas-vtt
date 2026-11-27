import { afterEach, describe, expect, it } from 'vitest';
import { setPlayerTokenSource } from '../../../../src/app/characters/playerTokens';
import { DEFAULT_INITIATIVE_RULES } from '../../../../src/app/gameSystems/initiativeRules';
import { cardInstanceNumber } from '../../../../src/app/initiative/cardInstanceNumber';
import type { FrontSceneState } from '../../../../src/app/online/gmScreen/statblocks/frontScene.ts';
import { fightArt, fightOf, type FightInputs } from '../../../../src/app/online/gmScreen/statblocks/fightList.ts';
import { parseFight, type FightCombatant, type StatblocksFight } from '../../../../src/app/online/protocol/index.ts';
import type { TokenEntity } from '../../../../src/app/types';
import type { InitiativeEntry, InitiativeState } from '../../../../src/app/types/initiativeTypes';
import { HP } from '../../../mocks/resourceFixtures';

const GOBLIN_ART = 'Art/Goblin.png';
const token = (id: string, changes: Partial<TokenEntity> = {}): TokenEntity =>
  ({ id, kind: 'character', x: 0, y: 0, name: id, imagePath: `Art/${id}.png`, statblockPath: `Bestiary/${id}.md`, resources: { hp: { current: 5, max: 5 } }, ...changes }) as unknown as TokenEntity;
const TOKENS: Record<string, TokenEntity> = {
  ilsa: token('ilsa', { vision: { enabled: true }, ringColor: '#3a7' } as Partial<TokenEntity>),
  'goblin-a': token('goblin-a', { name: 'Goblin', imagePath: GOBLIN_ART, statblockPath: 'Bestiary/Goblin.md', instanceNumber: 1 } as Partial<TokenEntity>),
  'goblin-b': token('goblin-b', { name: 'Goblin', imagePath: GOBLIN_ART, statblockPath: 'Bestiary/Goblin.md', instanceNumber: 2, isHidden: true } as Partial<TokenEntity>),
  ogre: token('ogre', { showRing: false, resources: { hp: { current: 0, max: 30 } } } as Partial<TokenEntity>),
};
const entry = (tokenId: string, order: number, changes: Partial<InitiativeEntry> = {}): InitiativeEntry =>
  ({ id: `e-${tokenId}`, tokenId, name: tokenId, initiative: 20 - order, initiativeModifier: 0, order, isActive: false, imagePath: TOKENS[tokenId]!.imagePath, ...changes }) as InitiativeEntry;

function scene(initiative: Partial<InitiativeState>, tokens = TOKENS): FrontSceneState {
  const entries = [entry('ilsa', 0), entry('goblin-a', 1), entry('goblin-b', 2), entry('ogre', 3)];
  return { mapPath: 'maps/Camp.atlasmap', mapLoaded: true, isMapLoading: false, objects: { tokens }, initiative: { entries, currentIndex: 0, round: 2, isActive: true, ...initiative } };
}

const INPUTS: FightInputs = {
  rules: { ...DEFAULT_INITIATIVE_RULES },
  definitions: [HP],
  keyOf: (entryId) => `k-${entryId.slice(2)}`,
  statblockOf: (path) => (path === 'Bestiary/Goblin.md' ? 'sb-goblin' : null),
  portraitOf: (path) => (path === GOBLIN_ART ? 'a'.repeat(64) : null),
};

const rows = (fight: StatblocksFight | null): FightCombatant[] => fight?.parts.flatMap((part) => (part.k === 'group' ? part.combatants : [])) ?? [];
const shape = (fight: StatblocksFight | null): string[] => fight?.parts.map((part) => (part.k === 'round' ? `round ${part.round}` : `${part.key}: ${part.combatants.map((each) => each.key).join(' ')}`)) ?? [];

afterEach(() => setPlayerTokenSource(null));

describe('the fight a GM screen device is sent', () => {
  it('is the tracker\'s list from the turn on, the rest below the next round, each row as its card shows it', () => {
    const goblinsTurn = scene({ entries: scene({}).initiative.entries.map((each) => ({ ...each, isActive: each.tokenId === 'goblin-a' })) });
    const fight = fightOf(goblinsTurn, INPUTS);

    expect(fight?.round).toBe(2);
    expect(shape(fight)).toEqual(['order: k-goblin-a k-goblin-b k-ogre', 'round 3', 'next: k-ilsa']);
    expect(rows(fight).filter((each) => each.turn).map((each) => each.key)).toEqual(['k-goblin-a']);
    const [goblinA, goblinB, ogre, ilsa] = rows(fight);
    expect(goblinA).toEqual({ key: 'k-goblin-a', name: 'Goblin', statblock: 'sb-goblin', portrait: 'a'.repeat(64), ring: '#ffffff', badge: 1, turn: true });
    expect(goblinB).toEqual({ key: 'k-goblin-b', name: 'Goblin', statblock: 'sb-goblin', portrait: 'a'.repeat(64), ring: '#ffffff', badge: 2, hidden: true });
    expect(ogre).toEqual({ key: 'k-ogre', name: 'ogre', statblock: null, portrait: null, ring: null, defeated: true });
    expect(ilsa).toMatchObject({ ring: '#33aa77', ally: true });
    // A device reads it back whole.
    expect(parseFight(JSON.parse(JSON.stringify(fight)))).toEqual(fight);
  });

  it('numbers look-alikes as the GM\'s tracker cards do', () => {
    const fight = fightOf(scene({}), INPUTS);
    for (const row of rows(fight)) {
      const tokenId = row.key.slice(2);
      expect(row.badge ?? null, tokenId).toBe(cardInstanceNumber(TOKENS, tokenId, true));
    }
    expect(rows(fightOf({ ...scene({}), tokenSettings: { showInstanceBadges: false } }, INPUTS)).some((each) => each.badge !== undefined)).toBe(false);
  });

  it('groups a fight by sides under each side, with the turn on the acting side\'s combatants', () => {
    const bySides = scene({ sides: { first: 'players', active: 'opponents' } });
    const fight = fightOf(bySides, { ...INPUTS, rules: { ...DEFAULT_INITIATIVE_RULES, mode: 'sides' } });

    expect(shape(fight)).toEqual(['opponents: k-goblin-a k-goblin-b k-ogre', 'round 3', 'players: k-ilsa']);
    const [opponents] = fight!.parts;
    expect(opponents).toMatchObject({ k: 'group', side: { id: 'opponents', turn: true } });
    // The defeated ogre holds no turn with its side, as on the map
    expect(rows(fight).filter((each) => each.turn).map((each) => each.key)).toEqual(['k-goblin-a', 'k-goblin-b']);
  });

  it('marks who sits out or delayed, and is nothing outside a fight', () => {
    const entries = scene({}).initiative.entries.map((each) => ({ ...each, sitsOut: each.tokenId === 'ilsa' ? true : undefined, delayed: each.tokenId === 'goblin-a' ? true : undefined }));
    const fight = fightOf(scene({ entries }), INPUTS);
    expect(shape(fight)).toEqual(['order: k-ilsa k-goblin-b k-ogre', 'delayed: k-goblin-a']);
    expect(rows(fight)[0]).toMatchObject({ sitsOut: true });
    expect(rows(fight).at(-1)).toMatchObject({ delayed: true });

    expect(fightOf(scene({ isActive: false }), INPUTS)).toBeNull();
    expect(fightArt(scene({ isActive: false }))).toEqual([]);
  });

  it('stays the same when a token moves', () => {
    const moved = Object.fromEntries(Object.entries(TOKENS).map(([id, each]) => [id, { ...each, x: 700, y: 140 }]));
    expect(fightOf(scene({}, moved), INPUTS)).toEqual(fightOf(scene({}), INPUTS));
  });
});
