import { describe, expect, it } from 'vitest';
import { firstCards, listSegments, shownItems, type ListSegment, type ListShape } from '../../src/app/initiative/listSegments';
import type { InitiativeSide } from '../../src/app/types/initiativeRulesTypes';

interface Item { name: string; side?: InitiativeSide; delayed?: boolean }

const items = (...names: string[]): Item[] => names.map((name) => ({ name, delayed: name.endsWith('*') }));

/** A list's shape; the sides given by id in acting order (`sides`), the one with the turn as `activeSide`. */
function shape(extra: Partial<Omit<ListShape<Item>, 'sides'>> & { sides?: InitiativeSide[]; activeSide?: InitiativeSide | null } = {}): ListShape<Item> {
  const { sides = ['players', 'opponents'], activeSide = null, ...rest } = extra;
  return {
    bySides: false, sideOf: (item) => item.side ?? 'opponents', delayed: (item) => item.delayed === true,
    fightRuns: true, round: 2, turnAt: 0, fromTurn: true, emptySides: true, ...rest,
    sides: sides.map((id) => ({ id, name: id, roll: null, active: id === activeSide })),
  };
}

/** The list as words: names, `|Round n|` for a divider, `[label: ...]` for a labelled group. */
function drawn(segments: ListSegment<Item>[]): string[] {
  return segments.map((segment) => {
    if (segment.kind === 'round') return `|Round ${segment.round}|`;
    const names = segment.items.map((item) => item.name).join(' ');
    const label = segment.side?.name ?? (segment.delayed ? 'delayed' : null);
    return label ? `[${label}${segment.active ? '!' : ''}: ${names}]` : names;
  });
}

describe('a list that starts at the turn', () => {
  it('runs from the combatant whose turn it is to the round\'s end, then into the next round below a divider', () => {
    expect(drawn(listSegments(items('a', 'b', 'c', 'd'), shape({ turnAt: 2 })))).toEqual(['c d', '|Round 3|', 'a b']);
  });

  it('needs no divider while the first combatant has the turn', () => {
    expect(drawn(listSegments(items('a', 'b', 'c'), shape({ turnAt: 0 })))).toEqual(['a b c']);
  });

  it('keeps the order as it is without a fight, without the option or without a turn', () => {
    expect(drawn(listSegments(items('a', 'b', 'c'), shape({ turnAt: 1, fightRuns: false })))).toEqual(['a b c']);
    expect(drawn(listSegments(items('a', 'b', 'c'), shape({ turnAt: 1, fromTurn: false })))).toEqual(['a b c']);
    expect(drawn(listSegments(items('a', 'b', 'c'), shape({ turnAt: -1 })))).toEqual(['a b c']);
    expect(drawn(listSegments(items('a', 'b', 'c'), shape({ turnAt: 3 })))).toEqual(['a b c']);
  });

  it('keeps those that delayed below the order, never in its rotation', () => {
    expect(drawn(listSegments(items('a', 'b*', 'c', 'd'), shape({ turnAt: 1 })))).toEqual(['c d', '|Round 3|', 'a', '[delayed: b*]']);
  });

  it('rotates the sides, the side whose turn it is first', () => {
    const list = [{ name: 'hero', side: 'players' as const }, { name: 'rat' }, { name: 'cleric', side: 'players' as const }];
    expect(drawn(listSegments(list, shape({ bySides: true, activeSide: 'opponents' })))).toEqual(['[opponents!: rat]', '|Round 3|', '[players: hero cleric]']);
    expect(drawn(listSegments(list, shape({ bySides: true, activeSide: 'players' })))).toEqual(['[players!: hero cleric]', '[opponents: rat]']);
    expect(drawn(listSegments(list, shape({ bySides: true, activeSide: 'opponents', fromTurn: false })))).toEqual(['[players: hero cleric]', '[opponents!: rat]']);
  });

  it('leaves out the sides nobody is shown of, and the divider they would leave alone', () => {
    const players = [{ name: 'hero', side: 'players' as const }];
    expect(drawn(listSegments(players, shape({ bySides: true, activeSide: 'opponents', emptySides: false })))).toEqual(['[players: hero]']);
    expect(drawn(listSegments(players, shape({ bySides: true, activeSide: 'opponents', emptySides: true })))).toEqual(['[opponents!: ]', '|Round 3|', '[players: hero]']);
  });
});

describe('a list of sides that roll for their order', () => {
  it('starts at the first of the sides with equal rolls that have the turn together, and keeps them together', () => {
    const list: Item[] = [{ name: 'hero', side: 'players' }, { name: 'ally', side: 'side-allies' as InitiativeSide }, { name: 'rat' }];
    const sides = [
      { id: 'players', name: 'players', roll: 2, active: false },
      { id: 'side-allies', name: 'allies', roll: 5, active: true },
      { id: 'opponents', name: 'opponents', roll: 5, active: true },
    ];
    const segments = listSegments(list, { ...shape({ bySides: true }), sides: [sides[1]!, sides[2]!, sides[0]!] });
    expect(drawn(segments)).toEqual(['[allies!: ally]', '[opponents!: rat]', '[players: hero]']);
    expect(drawn(listSegments(list, { ...shape({ bySides: true }), sides: [sides[0]!, sides[1]!, sides[2]!] })))
      .toEqual(['[allies!: ally]', '[opponents!: rat]', '|Round 3|', '[players: hero]']);
  });
});

describe('a collapsed list', () => {
  it('shows the turn and the next two, across the round\'s end', () => {
    const segments = listSegments(items('a', 'b', 'c', 'd', 'e*'), shape({ turnAt: 3 }));
    expect(drawn(firstCards(segments, 3))).toEqual(['d', '|Round 3|', 'a b']);
  });

  it('drops a divider nobody follows, and those that delayed', () => {
    const segments = listSegments(items('a', 'b', 'c', 'd*'), shape({ turnAt: 1 }));
    expect(drawn(firstCards(segments, 2))).toEqual(['b c']);
  });

  it('keeps the side whose turn it is while nobody in it is tracked, and no divider at its top', () => {
    const opponents = [{ name: 'rat' }, { name: 'bat' }, { name: 'owl' }, { name: 'elk' }];
    // The opponents act first and the players have the turn: the players' side holds nobody
    const segments = listSegments(opponents, shape({ bySides: true, sides: ['opponents', 'players'], activeSide: 'players' }));
    expect(drawn(firstCards(segments, 3))).toEqual(['[players!: ]', '|Round 3|', '[opponents: rat bat owl]']);
    // Without a turn there is no side to keep: the list starts with the first combatant, never a divider
    const leading: ListSegment<Item>[] = [{ kind: 'round', round: 3 }, { kind: 'group', key: 'order', items: opponents }];
    expect(drawn(firstCards(leading, 2))).toEqual(['rat bat']);
  });

  it('keeps the groups of the sides it shows', () => {
    const list = [{ name: 'hero', side: 'players' as const }, { name: 'rat' }, { name: 'bat' }, { name: 'owl' }];
    const segments = listSegments(list, shape({ bySides: true, activeSide: 'opponents' }));
    expect(drawn(firstCards(segments, 3))).toEqual(['[opponents!: rat bat owl]']);
    expect(drawn(firstCards(listSegments(list, shape({ bySides: true, activeSide: 'players' })), 3))).toEqual(['[players!: hero]', '[opponents: rat bat]']);
  });
});

it('lists the combatants in the order they are shown', () => {
  expect(shownItems(listSegments(items('a', 'b*', 'c', 'd'), shape({ turnAt: 2 }))).map((item) => item.name)).toEqual(['d', 'a', 'c', 'b*']);
});
