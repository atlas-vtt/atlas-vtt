import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { conditionEffect, withConditionEffect } from '../../src/app/gameSystems/conditionEffects';
import { DEAD_CONDITION, withDeadCondition, withDeadConditionSettings } from '../../src/app/gameSystems/deadCondition';
import { rulesForMap } from '../../src/app/gameSystems/mapRules';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../src/app/gameSystems/systemRules';
import { readCampaignSystem } from '../../src/app/campaigns/campaignSystem';
import { parseUserPreset } from '../../src/app/gameSystems/presetValidation';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';

describe('universal Dead condition', () => {
  it.each(BUILT_IN_SYSTEM_PRESETS)('exists exactly once in $name with a stable id and no-senses effect', (preset) => {
    const dead = preset.rules.conditions.filter((condition) => condition.name === 'Dead');
    expect(dead).toHaveLength(1);
    expect(dead[0]).toMatchObject({ id: `${preset.id.slice('builtin:'.length)}-dead`, effect: 'no-vision', icon: 'skull' });
    expect(conditionEffect({ id: dead[0]!.id })).toBe('no-vision');
  });

  it('reuses an existing custom Dead and upgrades its effect without changing its badge or id', () => {
    const existing: ConditionDefinition = { id: 'my-dead', name: ' Dead ', color: '#ff0000', icon: 'heart' };
    expect(withDeadCondition([existing])).toEqual([{ ...existing, effect: 'no-vision' }]);
    expect(existing).not.toHaveProperty('effect');
    const renamed: ConditionDefinition = { ...DEAD_CONDITION, name: 'Deceased' };
    expect(withDeadCondition([renamed])).toEqual([renamed]);
  });

  it('keeps the reusable No vision effect separate from the condition Kill applies', () => {
    const unconscious: ConditionDefinition = { id: 'unconscious', name: 'Unconscious', color: '#000000', effect: 'no-vision' };
    expect(withDeadCondition([unconscious])).toEqual([unconscious, DEAD_CONDITION]);
  });

  it('keeps explicit GM effect overrides, including disabling a custom Dead effect in the editor', () => {
    const custom = { ...DEAD_CONDITION, id: 'custom-dead' };
    const disabled = withConditionEffect(custom, 'none');
    expect(disabled.effect).toBe('none');
    expect(withDeadCondition([disabled])).toEqual([disabled]);
    expect(conditionEffect(disabled)).toBeUndefined();
    expect(withDeadCondition([withConditionEffect(disabled, 'none')])).toEqual([disabled]);
    expect(withDeadCondition([withConditionEffect(withConditionEffect(custom, 'blinded'), 'none')])).toEqual([disabled]);
  });

  it('upgrades older settings deterministically and retains references across reads', () => {
    const settings = { systemPresetId: 'builtin:dnd5e', conditions: [] };
    const upgraded = withDeadConditionSettings(settings);
    expect(upgraded.conditions).toEqual([{ ...DEAD_CONDITION, id: 'dnd5e-dead' }]);
    expect(withDeadConditionSettings(settings)).toBe(upgraded);
    expect(withDeadConditionSettings(upgraded)).toBe(upgraded);
    expect(settings.conditions).toEqual([]);
  });

  it('offers Dead without a system and when applying a custom preset with no conditions', () => {
    expect(vanillaSystemSettings().conditions).toEqual([DEAD_CONDITION]);
    const preset = { id: 'custom', name: 'Homebrew', rules: { gridDefaults: vanillaSystemSettings().gridDefaults, conditions: [] } };
    expect(rulesOfPreset(preset).conditions).toEqual([DEAD_CONDITION]);
    const loaded = parseUserPreset(preset)!;
    expect(sameSystemRules(loaded.rules, rulesOfPreset(loaded))).toBe(true);
  });

  it('round trips the effect through custom preset and campaign files', () => {
    const rules = { gridDefaults: vanillaSystemSettings().gridDefaults, conditions: [{ ...DEAD_CONDITION, id: 'custom-dead' }] };
    expect(parseUserPreset({ id: 'custom', name: 'Homebrew', rules })?.rules.conditions).toEqual(rules.conditions);
    expect(readCampaignSystem(rules)?.conditions).toEqual(rules.conditions);
    expect(readCampaignSystem({ ...rules, conditions: [], systemPresetId: 'builtin:coc7e' })?.conditions)
      .toEqual([{ ...DEAD_CONDITION, id: 'coc7e-dead' }]);
  });

  it('upgrades the active campaign rules before falling back to collection rules', () => {
    const lookup = {
      getCollectionForMap: () => 'collection',
      getCollectionSettings: () => ({ conditions: [] }),
      playedSystem: () => ({ campaignId: 'campaign', settings: { systemPresetId: 'builtin:cairn', conditions: [] } }),
    };
    expect(rulesForMap(lookup, 'map.atlasmap').settings?.conditions).toEqual([{ ...DEAD_CONDITION, id: 'cairn-dead' }]);
  });
});
