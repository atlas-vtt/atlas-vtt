// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, type EntryToken, type PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { TokenEntity } from '../../src/app/types';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import { layoutEdges } from '../../src/app/utils/scrollWithin';

const scrolls = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: (...args: unknown[]) => { scrolls.calls.push(args); }, layoutEdges: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) }));

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const VISIBLE: EntryToken = { hp: null, showRing: false, side: 'opponents', defeated: false };

const entry = (name: string, order: number, extra: Partial<PlayerInitiativeEntry> = {}): PlayerInitiativeEntry =>
  ({ tokenId: name, name, initiative: 20 - order, imagePath: '', order, isActive: false, ...extra });

/** Draws the players' list of `entries` (those in `hidden` left out, as their tokens are) and reads it back as words. */
function draw(entries: PlayerInitiativeEntry[], look: { fromTurn?: boolean; dock?: PlayersListEdge; faces?: boolean } = {}, hidden: string[] = []): { panel: HTMLElement; words: string[] } {
  document.body.empty();
  const list = playerInitiativeList({ entries, isActive: true, round: 4 }, (listed) => (hidden.includes(listed.tokenId) ? null : VISIBLE), TURN_ORDER, false);
  renderPlayerInitiative(document.body, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, ...look });
  const panel = document.querySelector<HTMLElement>('.atlas-player-initiative')!;
  const words = [...panel.querySelectorAll('.atlas-player-initiative__name, .atlas-player-initiative__next-round')].map((element) =>
    element.classList.contains('atlas-player-initiative__next-round') ? `|${element.getAttribute('aria-label') ?? ''}|` : element.textContent ?? '');
  return { panel, words };
}

beforeEach(() => { scrolls.calls.length = 0; });

describe('the players\' list that starts at the turn', () => {
  const fight = [entry('a', 0), entry('b', 1), entry('c', 2, { isActive: true }), entry('d', 3)];

  it('runs from the combatant whose turn it is into the next round below a divider, and shows its top', () => {
    const { panel, words } = draw(fight, { fromTurn: true });
    expect(words).toEqual(['c', 'd', '|Round 5|', 'a', 'b']);
    expect(scrolls.calls).toEqual([[panel.querySelector('.atlas-player-initiative__list'), panel.querySelector('.atlas-player-initiative__card--active'), 'start', 0, 'y']]);
  });

  it('keeps the order without the GM\'s choice, the turn and the next two scrolled into view', () => {
    const { panel, words } = draw(fight);
    expect(words).toEqual(['a', 'b', 'c', 'd']);
    expect(scrolls.calls[0]?.slice(2)).toEqual(['nearest', 2, 'y']);
    expect(panel.querySelector('.atlas-player-initiative__next-round')).toBeNull();
  });

  it('turns where the hidden combatant with the turn stands, without giving it away', () => {
    expect(draw(fight, { fromTurn: true }, ['c']).words).toEqual(['d', '|Round 5|', 'a', 'b']);
    // Nobody the players see acts after it this round: the list reads as the next round, in order
    const last = [entry('a', 0), entry('b', 1), entry('c', 2, { isActive: true })];
    expect(draw(last, { fromTurn: true }, ['c']).words).toEqual(['a', 'b']);
  });

  it('stands at the edge the GM docked the lists at', () => {
    expect(draw(fight, { dock: 'left' }).panel.classList.contains('atlas-player-initiative--left')).toBe(true);
    expect(draw(fight).panel.classList.contains('atlas-player-initiative--left')).toBe(false);
  });

  it('runs as a row across the top or the bottom, scrolling sideways to the turn', () => {
    for (const dock of ['top', 'bottom'] as const) {
      scrolls.calls.length = 0;
      expect(draw(fight, { dock }).panel.classList.contains(`atlas-player-initiative--${dock}`)).toBe(true);
      expect(scrolls.calls[0]?.[4]).toBe('x');
    }
  });

  it('turns a row to face the players at its edge, scrolling along its own axis', () => {
    for (const dock of ['top', 'right', 'bottom', 'left'] as const) {
      scrolls.calls.length = 0;
      const { classList } = draw(fight, { dock, faces: true }).panel;
      expect([...classList].filter((name) => name.startsWith('atlas-player-initiative--'))).toEqual(['atlas-player-initiative--bottom', `atlas-player-initiative--faces-${dock}`]);
      expect(scrolls.calls[0]?.[4]).toBe('x');
      expect(scrolls.calls[0]?.[5]).toBe(layoutEdges);
    }
  });
});

describe('conditions in the players\' list', () => {
  const definitions: ConditionDefinition[] = [
    { id: 'frightened', name: 'Frightened', color: '#ff0000', icon: 'skull', valued: true },
    { id: 'prone', name: 'Prone', color: '#ffffff' },
  ];
  const creature = (extra: Partial<TokenEntity> = {}): TokenEntity =>
    ({ id: 'a', kind: 'character', name: 'a', x: 0, y: 0, imagePath: '', conditions: ['frightened', 'prone', 'gone'], conditionValues: { frightened: 2 }, ...extra } as TokenEntity);

  it('shows the badges the map shows players on the token, each named, a valued one with its number', () => {
    document.body.empty();
    const token = entryTokenOf(creature(), [], definitions);
    const list = playerInitiativeList({ entries: [entry('a', 0)], isActive: false, round: 0 }, () => token, TURN_ORDER, false);
    renderPlayerInitiative(document.body, list, { showNames: false, mapShowsNameplates: true, portraitSrc: () => null });
    const badges = [...document.querySelectorAll('.atlas-player-initiative__condition')];
    expect(badges.map((badge) => badge.getAttribute('aria-label'))).toEqual(['Frightened 2', 'Prone']);
    expect(badges[0]!.querySelector('svg path')).not.toBeNull();
    expect(badges[0]!.querySelector('.atlas-condition-badge__value')?.textContent).toBe('2');
    expect(badges[1]!.textContent).toBe('P');
    expect(badges[1]!.querySelector('.atlas-condition-badge--light')).not.toBeNull();
  });

  it('shows none on a token the map draws no conditions on, as on the map', () => {
    expect(entryTokenOf(creature({ kind: 'token' }), [], definitions).conditions).toEqual([]);
    expect(entryTokenOf(undefined, [], definitions).conditions).toEqual([]);
  });
});
