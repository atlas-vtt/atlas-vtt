import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import {
  collectionInitiativeRules, parseInitiativeRules, sameInitiativeRules, savedInitiativeRules,
} from '../../src/app/gameSystems/initiativeRules';
import { isSameAsTyped } from '../../src/app/gameSystems/rulesView';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import { sameSystemRules } from '../../src/app/gameSystems/systemRules';
import { BUILT_IN_TEMPLATES } from '../../src/app/statblocks/presets';
import type { InitiativeRules } from '../../src/app/types/initiativeRulesTypes';

const D20: InitiativeRules = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };
const preset = (name: string): (typeof BUILT_IN_SYSTEM_PRESETS)[number] => BUILT_IN_SYSTEM_PRESETS.find((p) => p.name === name)!;
const templateOf = (id: string) => BUILT_IN_TEMPLATES.find((t) => t.id === id)!.template;

describe('where the initiative modifier is read from', () => {
  it('is read trimmed, with the ability score switch only where it is on; a blank or no field is none', () => {
    expect(parseInitiativeRules({ ...D20, modifier: { field: ' combat.init ' } })).toEqual({ ...D20, modifier: { field: 'combat.init' } });
    expect(parseInitiativeRules({ ...D20, modifier: { field: 'stats.1', abilityScore: true } }))
      .toEqual({ ...D20, modifier: { field: 'stats.1', abilityScore: true } });
    expect(parseInitiativeRules({ ...D20, modifier: { field: 'dex', abilityScore: 'yes' } })).toEqual({ ...D20, modifier: { field: 'dex' } });
    expect(parseInitiativeRules({ ...D20, modifier: { field: '  ' } })).toEqual(D20);
    expect(parseInitiativeRules({ ...D20, modifier: 'initiative' })).toEqual(D20);
    expect(parseInitiativeRules({ ...D20, modifierFallback: { field: 'stats.1', abilityScore: true } }))
      .toEqual({ ...D20, modifierFallback: { field: 'stats.1', abilityScore: true } });
  });

  it('round-trips through saving: stored trimmed, a blank field not stored at all', () => {
    const saved = savedInitiativeRules({ ...D20, modifier: { field: ' dex ', abilityScore: true }, modifierFallback: { field: 'x' } });
    expect(saved).toEqual({ ...D20, modifier: { field: 'dex', abilityScore: true }, modifierFallback: { field: 'x' } });
    expect(parseInitiativeRules(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
    expect(savedInitiativeRules({ ...D20, modifier: { field: '' } })).not.toHaveProperty('modifier');
  });

  it('makes rules differ by field, by the ability score switch and by the fallback', () => {
    expect(sameInitiativeRules(D20, { ...D20, modifier: { field: 'initiative' } })).toBe(false);
    expect(sameInitiativeRules({ ...D20, modifier: { field: 'init ' } }, { ...D20, modifier: { field: 'init' } })).toBe(true);
    expect(sameInitiativeRules({ ...D20, modifier: { field: 'dex' } }, { ...D20, modifier: { field: 'dex', abilityScore: true } })).toBe(false);
    expect(sameInitiativeRules(D20, { ...D20, modifierFallback: { field: 'stats.1' } })).toBe(false);
    expect(sameInitiativeRules(D20, { ...D20, modifier: { field: '' } })).toBe(true);
    expect(isSameAsTyped({ ...D20, modifier: { field: 'init' } }, D20)).toBe(false);
    expect(isSameAsTyped({ ...D20, modifier: { field: 'dex', abilityScore: true } }, { ...D20, modifier: { field: 'dex' } })).toBe(false);
    expect(isSameAsTyped({ ...D20, modifier: { field: 'init' } }, { ...D20, modifier: { field: 'init' } })).toBe(true);
  });

  it('is kept by a user preset', () => {
    const initiative: InitiativeRules = { ...D20, modifier: { field: 'dex', abilityScore: true }, modifierFallback: { field: 'init' } };
    const parsed = parseUserPreset({ id: 'p', name: 'Home', builtIn: false, rules: { ...preset('D&D 5e').rules, initiative } });
    expect(parsed?.rules.initiative).toEqual(initiative);
  });

  it('is Initiative, else DEX read as an ability score, in D&D 5e', () => {
    const rules = collectionInitiativeRules({ systemPresetId: preset('D&D 5e').id }, BUILT_IN_SYSTEM_PRESETS);
    expect(rules.modifier).toEqual({ field: 'initiative' });
    expect(rules.modifierFallback).toEqual({ field: 'stats.1', abilityScore: true });
    // The templates of its roles keep both there: Initiative, and DEX in the second slot of the abilities
    for (const role of preset('D&D 5e').rules.statblockRoles ?? []) {
      const template = templateOf(role.templateId);
      expect(template.fields.find((f) => f.key === 'initiative')?.meaning).toBe('initiative');
      const abilities = template.fields.find((f) => f.key === 'stats');
      expect(abilities?.type === 'scores' && abilities.slots?.[1]).toMatch(/^dex$/i);
    }
  });

  it('is Initiative in Pathfinder 2e, whose template has that field', () => {
    const system = preset('Pathfinder 2e');
    expect(collectionInitiativeRules({ systemPresetId: system.id }, BUILT_IN_SYSTEM_PRESETS).modifier).toEqual({ field: 'initiative' });
    for (const role of system.rules.statblockRoles ?? []) {
      expect(templateOf(role.templateId).fields.find((f) => f.key === 'initiative')?.meaning).toBe('initiative');
    }
  });

  it('counts a collection that follows its preset as unedited, and one with another source as edited', () => {
    const system = preset('D&D 5e');
    const own = system.rules.initiative!;
    expect(sameSystemRules(system.rules, { ...system.rules })).toBe(true);
    expect(sameSystemRules(system.rules, { ...system.rules, initiative: { ...own, modifier: { field: 'init' } } })).toBe(false);
    expect(sameSystemRules(system.rules, { ...system.rules, initiative: { ...own, modifier: { field: 'initiative', abilityScore: true } } })).toBe(false);
  });
});
