import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import {
  DEFAULT_INITIATIVE_RULES, collectionInitiativeRules, isValidInitiativeRules, parseInitiativeRules, sameInitiativeRules, savedInitiativeRules,
} from '../../src/app/gameSystems/initiativeRules';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../src/app/gameSystems/systemRules';
import { sideOf, sidesInOrder } from '../../src/app/initiative/sides';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const preset = (name: string): (typeof BUILT_IN_SYSTEM_PRESETS)[number] => BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === name)!;
const SIDES: InitiativeRules = { mode: 'sides', roll: '1d20', firstSide: 'players' };

describe('initiative rules of a collection', () => {
  it('is a d20 each, highest first, without a game system', () => {
    expect(collectionInitiativeRules({}, BUILT_IN_SYSTEM_PRESETS)).toEqual(DEFAULT_INITIATIVE_RULES);
    expect(DEFAULT_INITIATIVE_RULES).toMatchObject({ mode: 'turn-order', roll: '1d20' });
  });

  it('takes its preset\'s rules until it has its own: Cairn runs by sides, players first', () => {
    const cairn = preset('Cairn');
    expect(collectionInitiativeRules({ systemPresetId: cairn.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual(SIDES);
    const own: InitiativeRules = { mode: 'turn-order', roll: '2d6', firstSide: 'opponents' };
    expect(collectionInitiativeRules({ systemPresetId: cairn.id, initiative: own }, BUILT_IN_SYSTEM_PRESETS)).toEqual(own);
  });

  it('rolls a d10 in Cyberpunk RED and a d20 in every other built-in turn order', () => {
    const rolls = Object.fromEntries(BUILT_IN_SYSTEM_PRESETS.map((p) => [p.name, collectionInitiativeRules({ systemPresetId: p.id }, BUILT_IN_SYSTEM_PRESETS)]));
    expect(rolls['Cyberpunk RED']).toMatchObject({ mode: 'turn-order', roll: '1d10' });
    expect(Object.entries(rolls).filter(([, rules]) => rules.mode === 'sides').map(([name]) => name)).toEqual(['Cairn', 'Cosmere RPG']);
  });

  it('reads stored rules that are none as unset, so the preset decides', () => {
    for (const raw of [null, 'sides', { mode: 'sides' }, { mode: 'teams', roll: '1d20', firstSide: 'players' }, { mode: 'sides', roll: 'd', firstSide: 'players' }, { mode: 'sides', roll: '1d20', firstSide: 'gm' }]) {
      expect(parseInitiativeRules(raw)).toBeUndefined();
    }
    expect(parseInitiativeRules({ mode: 'sides', roll: ' 1d6 ', firstSide: 'opponents', extra: 1 })).toEqual({ mode: 'sides', roll: '1d6', firstSide: 'opponents' });
    expect(collectionInitiativeRules({ systemPresetId: preset('Cairn').id, initiative: { mode: 'teams' } }, BUILT_IN_SYSTEM_PRESETS)).toEqual(SIDES);
  });

  it('cannot be saved with half a roll in turn order; by sides the roll does not matter and is stored as a d20', () => {
    expect(isValidInitiativeRules({ ...SIDES, mode: 'turn-order', roll: '1d' })).toBe(false);
    expect(isValidInitiativeRules({ ...SIDES, roll: '1d' })).toBe(true);
    expect(savedInitiativeRules({ ...SIDES, roll: '1d' })).toEqual(SIDES);
    expect(savedInitiativeRules({ ...SIDES, roll: ' 2d6 ' })).toEqual({ ...SIDES, roll: '2d6' });
  });

  it('compares unset rules as the default', () => {
    expect(sameInitiativeRules(undefined, { mode: 'turn-order', roll: ' 1D20', firstSide: 'players' })).toBe(true);
    expect(sameInitiativeRules(undefined, SIDES)).toBe(false);
  });
});

describe('initiative rules and game system presets', () => {
  it('leaves a collection set from a preset without rules of its own, and counts it as unedited', () => {
    const cairn = preset('Cairn');
    const applied = rulesOfPreset(cairn);
    expect(applied).not.toHaveProperty('initiative');
    expect(sameSystemRules(cairn.rules, applied)).toBe(true);
    expect(sameSystemRules(cairn.rules, { ...applied, initiative: SIDES })).toBe(true);
    expect(sameSystemRules(cairn.rules, { ...applied, initiative: { ...SIDES, mode: 'turn-order' } })).toBe(false);
  });

  it('clears a collection\'s own rules when it loses its game system', () => {
    expect(vanillaSystemSettings()).toHaveProperty('initiative', undefined);
  });

  it('keeps the rules of a user preset, and drops ones that are none', () => {
    const stored = { id: 'mine', name: 'Mine', rules: { gridDefaults: cairnGrid(), conditions: [], initiative: SIDES } };
    expect(parseUserPreset(stored)?.rules.initiative).toEqual(SIDES);
    expect(parseUserPreset({ ...stored, rules: { ...stored.rules, initiative: { mode: 'teams' } } })?.rules).not.toHaveProperty('initiative');
  });
});

function cairnGrid(): object {
  return preset('Cairn').rules.gridDefaults;
}

describe('the side a token fights on', () => {
  it('is the one the GM gave it, else the players\' for a token that sees, else the opponents\'', () => {
    expect(sideOf(undefined)).toBe('opponents');
    expect(sideOf({})).toBe('opponents');
    expect(sideOf({ vision: { enabled: true } })).toBe('players');
    expect(sideOf({ vision: { enabled: true }, side: 'opponents' })).toBe('opponents');
    expect(sideOf({ side: 'players' })).toBe('players');
    // A map file edited by hand
    expect(sideOf({ side: 'gm' as never })).toBe('opponents');
  });

  it('lists the sides in the order they act', () => {
    expect(sidesInOrder('opponents')).toEqual(['opponents', 'players']);
  });
});
