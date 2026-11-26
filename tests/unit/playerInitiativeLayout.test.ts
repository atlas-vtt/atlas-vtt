// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerInitiativeEntry } from '../../src/app/services/playerInitiativeList';
import { renderPlayerInitiative } from '../../src/app/services/playerInitiativeView';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { TokenEntity } from '../../src/app/types';
import type { PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import { layoutEdges } from '../../src/app/utils/scrollWithin';
import { playersListOf } from '../helpers/playersInitiative';

const scrolls = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock('../../src/app/utils/scrollWithin', () => ({ scrollWithin: (...args: unknown[]) => { scrolls.calls.push(args); }, layoutEdges: () => ({ left: 0, top: 0, right: 0, bottom: 0 }) }));

const TURN_ORDER: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
/** A combatant's token, framed by its own art and an opponent's. */
const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', showRing: false, ...extra });

const entry = (name: string, order: number, extra: Partial<PlayerInitiativeEntry> = {}): PlayerInitiativeEntry =>
  ({ tokenId: name, name, initiative: 20 - order, imagePath: '', order, isActive: false, ...extra });

/** Draws the players' list of `entries` (those in `hidden` left out, as their tokens are) and reads it back as words. */
function draw(entries: PlayerInitiativeEntry[], look: { fromTurn?: boolean; dock?: PlayersListEdge; faces?: boolean } = {}, hidden: string[] = []): { panel: HTMLElement; words: string[] } {
  document.body.empty();
  const tokens = Object.fromEntries(entries.map(({ name }) => [name, token(name, hidden.includes(name) ? { isHidden: true } : {})]));
  const list = playersListOf({ entries, isActive: true, round: 4 }, tokens, { initiative: TURN_ORDER });
  renderPlayerInitiative(document.body, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, ...look });
  const panel = document.querySelector<HTMLElement>('.atlas-player-initiative')!;
  const words = [...panel.querySelectorAll('.atlas-initiative-card__name, .atlas-initiative-round')].map((element) =>
    element.classList.contains('atlas-initiative-round') ? `|${element.getAttribute('aria-label') ?? ''}|` : element.textContent ?? '');
  return { panel, words };
}

beforeEach(() => { scrolls.calls.length = 0; });

describe('the players\' list that starts at the turn', () => {
  const fight = [entry('a', 0), entry('b', 1), entry('c', 2, { isActive: true }), entry('d', 3)];

  it('runs from the combatant whose turn it is into the next round below a divider, and shows its top', () => {
    const { panel, words } = draw(fight, { fromTurn: true });
    expect(words).toEqual(['c', 'd', '|Round 5|', 'a', 'b']);
    expect(scrolls.calls).toEqual([[panel.querySelector('.atlas-initiative-panel__list'), panel.querySelector('.atlas-initiative-card--active'), 'start', 0, 'y']]);
  });

  it('keeps the order without the GM\'s choice, the turn and the next two scrolled into view', () => {
    const { panel, words } = draw(fight);
    expect(words).toEqual(['a', 'b', 'c', 'd']);
    expect(scrolls.calls[0]?.slice(2)).toEqual(['nearest', 2, 'y']);
    expect(panel.querySelector('.atlas-initiative-round')).toBeNull();
  });

  it('turns where the hidden combatant with the turn stands, without giving it away', () => {
    expect(draw(fight, { fromTurn: true }, ['c']).words).toEqual(['d', '|Round 5|', 'a', 'b']);
    // Nobody the players see acts after it this round: the list reads as the next round, in order
    const last = [entry('a', 0), entry('b', 1), entry('c', 2, { isActive: true })];
    expect(draw(last, { fromTurn: true }, ['c']).words).toEqual(['a', 'b']);
  });

  it('runs as a row across the top or the bottom, scrolling sideways to the turn', () => {
    for (const dock of ['top', 'bottom'] as const) {
      scrolls.calls.length = 0;
      expect(draw(fight, { dock }).panel.classList.contains(`atlas-player-initiative--${dock}`)).toBe(true);
      expect(scrolls.calls[0]?.[4]).toBe('x');
    }
  });

  it('turns a row to face the players at its edge, scrolling along its own axis', () => {
    for (const dock of ['top', 'right', 'bottom'] as const) {
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

  it('draws no badges on the card: the token shows them on the map', () => {
    document.body.empty();
    const list = playersListOf({ entries: [entry('a', 0)], isActive: false, round: 0 }, { a: creature() }, { conditions: definitions, initiative: TURN_ORDER });
    renderPlayerInitiative(document.body, list, { showNames: false, mapShowsNameplates: true, portraitSrc: () => null });
    expect(document.querySelector('.atlas-condition-badge')).toBeNull();
  });

  it('shows none on a token the map draws no conditions on, as on the map', () => {
    const byName: PlayerInitiativeEntry = { name: 'Enemy 1', initiative: 0, imagePath: '', order: 1, isActive: false };
    const list = playersListOf({ entries: [entry('a', 0), byName], isActive: false, round: 0 }, { a: creature({ kind: 'token' }) }, { conditions: definitions });
    expect(list.combatants.map(({ token: shown }) => shown.conditions)).toEqual([[], []]);
  });
});

describe('the sides and the room on the players\' list', () => {
  it('frames the players\' own side, a colour an older file gave a card left out, and counts those the list leaves out', () => {
    document.body.empty();
    const entries = [entry('a', 0, { isActive: true }), entry('b', 1, { color: '#dc2626' } as never), entry('c', 2), entry('d', 3)];
    const tokens = Object.fromEntries(['a', 'b', 'c', 'd'].map((id) => [id, token(id, { showRing: true, side: id === 'a' || id === 'c' ? 'players' : 'opponents' })]));
    const list = playersListOf({ entries, isActive: true, round: 1 }, tokens, { initiative: TURN_ORDER });
    const panel = renderPlayerInitiative(document.body, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null, maxCards: 2 })!;
    const cards = [...panel.querySelectorAll('.atlas-initiative-card')];
    expect(cards.map((card) => card.classList.contains('atlas-initiative-card--ally'))).toEqual([true, false]);
    expect(cards[1]!.classList.contains('atlas-initiative-card--coloured')).toBe(false);
    const more = panel.querySelector('.atlas-player-initiative__more')!;
    expect(more.textContent).toBe('+2');
    expect(more.getAttribute('aria-label')).toBe('2 more combatants');
    // Showing everyone, nobody is left out
    expect(renderPlayerInitiative(document.body, list, { showNames: true, mapShowsNameplates: true, portraitSrc: () => null })!.querySelector('.atlas-player-initiative__more')).toBeNull();
  });
});
