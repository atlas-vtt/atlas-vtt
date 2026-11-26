import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { currentTurn } from '../../../src/app/initiative/turnHolders';
import { createInitiativeActions } from '../../../src/app/stores/initiativeSlice';
import type { TokenEntity } from '../../../src/app/types';
import type { InitiativeRules } from '../../../src/app/types/initiativeRulesTypes';
import { createDefaultInitiativeState, type InitiativeState } from '../../../src/app/types/initiativeTypes';
import { NO_RULES } from '../../mocks/rulesLookup';

const RULES: readonly InitiativeRules[] = [
  { mode: 'turn-order', roll: '1d20', firstSide: 'players' },
  { mode: 'sides', roll: '1d20', firstSide: 'players' },
  { mode: 'sides', roll: '1d20', firstSide: 'players', sideRoll: '1d6' },
  { mode: 'cards', roll: '1d20', firstSide: 'players', deck: 6, dealEachRound: true },
  { mode: 'cards', roll: '1d20', firstSide: 'players', deck: 3, lookAlikesShare: true },
];

/** Two heroes who see and three monsters, two of them look-alikes. */
const TOKENS: readonly TokenEntity[] = [
  { id: 'hero', kind: 'token', x: 0, y: 0, imagePath: 'hero.png', vision: { enabled: true } },
  { id: 'mage', kind: 'token', x: 0, y: 0, imagePath: 'mage.png', vision: { enabled: true } },
  { id: 'goblin1', kind: 'token', x: 0, y: 0, imagePath: 'goblin.png' },
  { id: 'goblin2', kind: 'token', x: 0, y: 0, imagePath: 'goblin.png' },
  { id: 'ogre', kind: 'token', x: 0, y: 0, imagePath: 'ogre.png' },
] as TokenEntity[];

/** A repeatable stream of chance: the same seed plays the same fight. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What is wrong with who carries the turn, or null: exactly one entry in a running fight in turn order or by cards, none by sides. */
function turnProblem(initiative: InitiativeState): string | null {
  const carrying = initiative.entries.filter((entry) => entry.isActive).length;
  const turn = currentTurn(initiative);
  if (turn?.kind === 'combatant' && turn.entry.delayed) return 'a delayed combatant holds the turn';
  if (!initiative.isActive) return null;
  if (initiative.sides) return carrying === 0 ? null : `${carrying} entries carry the turn of a fight by sides`;
  const expected = initiative.entries.length === 0 ? 0 : 1;
  return carrying === expected ? null : `${carrying} entries carry the turn of a fight in turn order with ${initiative.entries.length} combatants`;
}

/** Plays `steps` commands the GM may give, and changes to the tokens, chosen by `seed`; stops at the first problem. */
function play(seed: number, steps: number): string | null {
  const chance = seeded(seed);
  const pick = <T,>(items: readonly T[]): T | undefined => items[Math.floor(chance() * items.length)];
  let state = {
    initiative: createDefaultInitiativeState(),
    initiativeTrackerOpen: true,
    objects: { tokens: Object.fromEntries(TOKENS.map((token) => [token.id, token])) as Record<string, TokenEntity> },
  };
  const actions = createInitiativeActions((recipe) => { state = produce(state, recipe); }, () => state, { rules: NO_RULES, random: chance });
  const entry = (): string | undefined => pick(state.initiative.entries)?.id;
  const place = (): number => Math.floor(chance() * Math.max(state.initiative.entries.length, 1));
  const commands: Record<string, () => void> = {
    add: () => {
      const listed = new Set(state.initiative.entries.map((listedEntry) => listedEntry.tokenId));
      const token = pick(TOKENS.filter((candidate) => !listed.has(candidate.id)));
      if (token) actions.addToInitiative({ tokenId: token.id, name: token.id, initiative: 0, initiativeModifier: 0, imagePath: token.imagePath, isNPC: true });
    },
    remove: () => { const id = entry(); if (id) actions.removeFromInitiative(id); },
    start: () => actions.startCombat(pick(RULES)),
    end: () => actions.endCombat(),
    next: () => actions.nextTurn(),
    previous: () => actions.previousTurn(),
    delay: () => { const id = entry(); if (id) actions.delayInitiativeTurn(id); },
    actNow: () => { const id = entry(); if (id) actions.actNowInInitiative(id); },
    sitOut: () => { const id = entry(); if (id) actions.setInitiativeSitsOut(id, chance() < 0.7); },
    swap: () => { const [a, b] = [entry(), entry()]; if (a && b) actions.swapInitiativeCards(a, b); },
    reorder: () => actions.reorderInitiative(place(), place()),
    toFront: () => { const id = entry(); if (id) actions.moveToFront(id); },
    toBack: () => { const id = entry(); if (id) actions.moveToBack(id); },
    rollAll: () => actions.rollAllInitiative(),
    rollOne: () => { const id = entry(); if (id) actions.rollEntryInitiative(id); },
    number: () => { const id = entry(); if (id) actions.updateInitiativeEntry(id, { initiative: Math.floor(chance() * 20) }); },
    hide: () => { const id = entry(); if (id) actions.updateInitiativeEntry(id, { hiddenFromPlayers: chance() < 0.5 ? true : undefined }); },
    resetNumbers: () => actions.resetInitiativeNumbers(),
    clear: () => actions.resetInitiative(),
    wound: () => {
      const token = pick(TOKENS);
      if (token) state = produce(state, (draft) => { draft.objects.tokens[token.id]!.resources = { hp: { current: chance() < 0.5 ? 0 : 7, max: 7 } }; });
    },
  };
  // Adding and starting more often than the rest, so fights have combatants
  const names = [...Object.keys(commands), 'add', 'add', 'start', 'next', 'next'];
  const played: string[] = [];
  for (let step = 0; step < steps; step++) {
    const name = pick(names)!;
    played.push(name);
    commands[name]!();
    const problem = turnProblem(state.initiative);
    if (problem) return `seed ${seed}, after ${played.join(', ')}: ${problem}`;
  }
  return null;
}

describe('the turn of a fight', () => {
  it('is carried by exactly one combatant in turn order and by cards, and by none by sides, whatever the GM does', () => {
    const problems: string[] = [];
    for (let seed = 1; seed <= 400 && problems.length === 0; seed++) {
      const problem = play(seed, 60);
      if (problem) problems.push(problem);
    }
    expect(problems).toEqual([]);
  });
});
