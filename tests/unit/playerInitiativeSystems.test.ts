// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { entryTokenOf, playerInitiativeList, renderPlayerInitiative, sideIdsOf } from '../../src/app/services/playerInitiativeList';
import type { TokenEntity } from '../../src/app/types';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';
import { createDefaultInitiativeState, type InitiativeEntry, type InitiativeState } from '../../src/app/types/initiativeTypes';

const ALLIES = { id: 'side-allies', name: 'Allies' };
const THREE: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players', sides: [{ id: 'players' }, ALLIES, { id: 'opponents' }] };
const LOOK = { showNames: true, portraitSrc: (): null => null };

const token = (id: string, extra: Partial<TokenEntity> = {}): TokenEntity => ({ id, kind: 'token', x: 0, y: 0, imagePath: '', ...extra } as TokenEntity);
const entry = (tokenId: string, order: number, extra: Partial<InitiativeEntry> = {}): InitiativeEntry => ({
  id: tokenId, tokenId, name: tokenId, initiative: 0, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order, ...extra,
});

function draw(initiative: InitiativeState, rules: InitiativeRules, tokens: Record<string, TokenEntity>): HTMLElement {
  const sides = sideIdsOf(initiative, rules);
  const list = playerInitiativeList(initiative, (e) => entryTokenOf(tokens[e.tokenId], [], [], sides), rules, false);
  const container = document.body.createDiv();
  renderPlayerInitiative(container, list, LOOK);
  return container;
}

const groups = (container: HTMLElement): string[][] => [...container.querySelectorAll('.atlas-player-initiative__side')].map((group) => [
  group.querySelector('.atlas-player-initiative__side-label')!.textContent ?? '',
  ...[...group.querySelectorAll('.atlas-player-initiative__name')].map((name) => name.textContent ?? ''),
  group.classList.contains('atlas-player-initiative__side--active') ? 'active' : '',
]);

describe("the players' list of a fight by sides", () => {
  const tokens = { hero: token('hero', { vision: { enabled: true } }), hireling: token('hireling', { side: 'side-allies' }), ogre: token('ogre') };
  const entries = [entry('hero', 0), entry('hireling', 1), entry('ogre', 2)];

  it('groups the combatants under every side of the collection, in the order they act', () => {
    const container = draw({ ...createDefaultInitiativeState(), entries }, THREE, tokens);
    expect(groups(container)).toEqual([['Players', 'hero', ''], ['Allies', 'hireling', ''], ['Opponents', 'ogre', '']]);
  });

  it('heads each side with its roll, the highest first, and marks sides with equal rolls together', () => {
    const initiative: InitiativeState = {
      ...createDefaultInitiativeState(), entries, isActive: true, round: 1,
      sides: { first: 'players', active: 'opponents', order: THREE.sides!, roll: '1d6', rolls: { 1: { players: 2, 'side-allies': 5, opponents: 5 } } },
    };
    const container = draw(initiative, { ...THREE, sideRoll: '1d6' }, tokens);
    expect(groups(container)).toEqual([['Allies5', 'hireling', 'active'], ['Opponents5', 'ogre', 'active'], ['Players2', 'hero', '']]);
    expect(container.querySelector('.atlas-player-initiative__side')!.getAttribute('aria-label')).toBe('Allies, rolled 5');
  });
});

describe("the players' list of a fight by cards", () => {
  it('shows the card each combatant was dealt where its number stands', () => {
    const initiative: InitiativeState = { ...createDefaultInitiativeState(), isActive: true, round: 1, cards: { deck: 10 }, entries: [entry('a', 0, { card: 2, initiative: 15 }), entry('b', 1)] };
    const container = draw(initiative, { mode: 'cards', roll: '1d20', firstSide: 'players' }, { a: token('a'), b: token('b') });
    expect([...container.querySelectorAll('.atlas-player-initiative__card-dealt')].map((card) => card.textContent)).toEqual(['2', '–']);
  });
});
