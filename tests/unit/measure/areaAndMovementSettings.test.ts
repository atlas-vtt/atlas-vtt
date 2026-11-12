import { describe, expect, it, vi } from 'vitest';
import { readCampaignSystem } from '../../../src/app/campaigns/campaignSystem';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { collectionMovementRules } from '../../../src/app/gameSystems/movementRules';
import { parseUserPresets } from '../../../src/app/gameSystems/presetValidation';
import { viewOfRules } from '../../../src/app/gameSystems/rulesView';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../../src/app/gameSystems/systemRules';
import { areaRulesOf, resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { isValidMovementRules, NO_MOVEMENT_RULES, type MovementRules } from '../../../src/app/measure/movementRules';
import { movementEdit } from '../../../src/app/react/components/collection-settings/RulesSettingsTabs';
import { RESOURCE_COLORS } from '../../../src/app/resources/resourceColors';
import type { CollectionGridDefaults } from '../../../src/app/types/collectionSettingsTypes';
import type { SystemPreset } from '../../../src/app/types/systemPresetTypes';

const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:dnd5e')!;
const FEET: CollectionGridDefaults = { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' };
const SPRINT: MovementRules = { steps: [{ name: 'Walk', multiple: 1, color: '#22c55e' }, { name: 'Sprint', multiple: 4, color: '#f97316' }], countPerTurn: false };

function userPreset(rules: Record<string, unknown>): SystemPreset | undefined {
  return parseUserPresets([{ id: 'u1', name: 'Homebrew', rules: { gridDefaults: FEET, conditions: [], ...rules } }])[0];
}

describe('the area rules of a collection', () => {
  it('read as half a cell and a round cone until the collection sets its own', () => {
    expect(areaRulesOf(resolveMeasurementSettings(FEET, null))).toEqual({ cellRule: 'half', coneEnd: 'round' });
    expect(areaRulesOf(resolveMeasurementSettings(undefined, null))).toEqual({ cellRule: 'half', coneEnd: 'round' });
    expect(areaRulesOf(resolveMeasurementSettings({ ...FEET, areaCellRule: 'any', coneEnd: 'flat' }, null))).toEqual({ cellRule: 'any', coneEnd: 'flat' });
    // Settings built by hand (a test, an older caller) name none.
    expect(areaRulesOf({})).toEqual({ cellRule: 'half', coneEnd: 'round' });
    expect(areaRulesOf(null)).toEqual({ cellRule: 'half', coneEnd: 'round' });
  });

  it('are kept by a stored preset where it names rules Atlas knows', () => {
    expect(userPreset({ gridDefaults: { ...FEET, areaCellRule: 'centre', coneEnd: 'flat' } })?.rules.gridDefaults).toMatchObject({ areaCellRule: 'centre', coneEnd: 'flat' });
    const unknown = userPreset({ gridDefaults: { ...FEET, areaCellRule: 'most', coneEnd: 7 } })?.rules.gridDefaults;
    expect(unknown).not.toHaveProperty('areaCellRule');
    expect(unknown).not.toHaveProperty('coneEnd');
  });

  it('are part of the system: another rule is an edit, a rule spelled out as the default is none', () => {
    const rules = rulesOfPreset(dnd5e);
    const { areaCellRule: _rule, ...older } = rules.gridDefaults;
    expect(sameSystemRules(dnd5e.rules, { ...rules, gridDefaults: older })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, gridDefaults: { ...older, coneEnd: 'round' } })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, gridDefaults: { ...rules.gridDefaults, areaCellRule: 'any' } })).toBe(false);
    expect(sameSystemRules(dnd5e.rules, { ...rules, gridDefaults: { ...rules.gridDefaults, coneEnd: 'flat' } })).toBe(false);
  });
});

describe('the movement rules of a collection', () => {
  it('are its own, else its preset\'s, else none', () => {
    expect(collectionMovementRules({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual(dnd5e.rules.movement);
    expect(collectionMovementRules({ systemPresetId: dnd5e.id, movement: SPRINT }, BUILT_IN_SYSTEM_PRESETS)).toEqual(SPRINT);
    expect(collectionMovementRules({ systemPresetId: 'deleted' }, BUILT_IN_SYSTEM_PRESETS)).toEqual(NO_MOVEMENT_RULES);
    expect(collectionMovementRules({}, BUILT_IN_SYSTEM_PRESETS)).toEqual(NO_MOVEMENT_RULES);
    // Stored by a hand or a later version: what cannot be read is the preset's again.
    expect(collectionMovementRules({ systemPresetId: dnd5e.id, movement: 'fast' }, BUILT_IN_SYSTEM_PRESETS)).toEqual(dnd5e.rules.movement);
  });

  it('switch the preset\'s steps off where the collection removed them', () => {
    expect(collectionMovementRules({ systemPresetId: dnd5e.id, movement: { steps: [], countPerTurn: false } }, BUILT_IN_SYSTEM_PRESETS).steps).toEqual([]);
  });

  it('are not copied when a preset is applied, and a system without one has none', () => {
    expect(rulesOfPreset(dnd5e)).not.toHaveProperty('movement');
    expect(vanillaSystemSettings().movement).toBeUndefined();
  });

  it('are part of the system only once the collection has its own', () => {
    const following = rulesOfPreset(dnd5e);
    expect(sameSystemRules(dnd5e.rules, following)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...following, movement: structuredClone(dnd5e.rules.movement!) })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...following, movement: SPRINT })).toBe(false);
    expect(sameSystemRules(dnd5e.rules, { ...following, movement: { steps: [], countPerTurn: false } })).toBe(false);
    const plain = { gridDefaults: FEET, conditions: [] };
    expect(sameSystemRules(plain, { ...plain, movement: { steps: [], countPerTurn: false } })).toBe(true);
    expect(sameSystemRules(plain, { ...plain, movement: SPRINT })).toBe(false);
  });

  it('are kept by a stored preset, without what cannot be used; rules that do nothing are none', () => {
    expect(userPreset({ movement: SPRINT })?.rules.movement).toEqual(SPRINT);
    expect(userPreset({ movement: { steps: [SPRINT.steps[0], { name: '', multiple: 2, color: '#000000' }], countPerTurn: true } })?.rules.movement)
      .toEqual({ steps: [SPRINT.steps[0]], countPerTurn: true });
    expect(userPreset({ movement: { steps: [], countPerTurn: false } })?.rules).not.toHaveProperty('movement');
    expect(userPreset({ movement: 'fast' })?.rules).not.toHaveProperty('movement');
  });

  it('are a campaign system\'s own too, steps removed included', () => {
    const system = { gridDefaults: FEET, conditions: [], systemPresetId: dnd5e.id };
    expect(readCampaignSystem(system)).not.toHaveProperty('movement');
    expect(readCampaignSystem({ ...system, movement: SPRINT })?.movement).toEqual(SPRINT);
    expect(readCampaignSystem({ ...system, movement: { steps: [], countPerTurn: false } })?.movement).toEqual({ steps: [], countPerTurn: false });
  });
});

describe('movement rules in a settings dialog', () => {
  const settings = { ...rulesOfPreset(dnd5e), systemPresetId: dnd5e.id };

  it('show the system\'s while the draft has none, and the draft\'s as typed', () => {
    const following = viewOfRules(settings, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS);
    expect(following.movement).toEqual(dnd5e.rules.movement);
    expect(following.systemMovement).toEqual(dnd5e.rules.movement);
    expect(following.isValid).toBe(true);
    const typing: MovementRules = { steps: [{ name: '', multiple: NaN, color: '#22c55e' }], countPerTurn: false };
    const edited = viewOfRules({ ...settings, movement: typing }, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS);
    expect(edited.movement).toBe(typing);
    expect(edited.systemMovement).toEqual(dnd5e.rules.movement);
    expect(edited.isValid).toBe(false);
    expect(sameSystemRules(dnd5e.rules, following.systemRules)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, viewOfRules({ ...settings, movement: SPRINT }, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).systemRules)).toBe(false);
  });

  it('leave a half typed step alone where the ruler names distances, which shows no steps', () => {
    const bands = { ...settings, gridDefaults: { ...settings.gridDefaults, measurementMode: 'abstract' as const }, movement: { steps: [{ name: '', multiple: 1, color: '#22c55e' }], countPerTurn: false } };
    expect(viewOfRules(bands, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).isValid).toBe(true);
  });

  it('store nothing for an edit that ends at the system\'s rules to the letter', () => {
    const setMovement = vi.fn();
    const edit = movementEdit({ setMovement }, { systemMovement: dnd5e.rules.movement! });
    edit(SPRINT);
    expect(setMovement).toHaveBeenLastCalledWith(SPRINT);
    edit(structuredClone(dnd5e.rules.movement!));
    expect(setMovement).toHaveBeenLastCalledWith(undefined);
    // A space typed after a name is kept, or the next word could never be typed.
    const typing = { ...dnd5e.rules.movement!, steps: dnd5e.rules.movement!.steps.map((step, i) => (i === 0 ? { ...step, name: `${step.name} ` } : step)) };
    edit(typing);
    expect(setMovement).toHaveBeenLastCalledWith(typing);
  });
});

describe('the movement rules of the built-in systems', () => {
  const palette = new Set(RESOURCE_COLORS.map((colour) => colour.value));

  it('can be saved as they stand, in colours the settings offer, and read back the same', () => {
    const withSteps = BUILT_IN_SYSTEM_PRESETS.filter((preset) => preset.rules.movement);
    expect(withSteps.map((preset) => preset.id)).toEqual(['builtin:dnd5e', 'builtin:pathfinder2e']);
    for (const preset of withSteps) {
      const movement = preset.rules.movement!;
      expect(isValidMovementRules(movement), preset.name).toBe(true);
      for (const step of movement.steps) expect(palette.has(step.color), `${preset.name}: ${step.name}`).toBe(true);
      expect(collectionMovementRules({ movement: structuredClone(movement) }, [])).toEqual(movement);
    }
  });

  it('are none for a system that measures in range bands', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      if (preset.rules.gridDefaults.measurementMode === 'abstract') expect(preset.rules.movement, preset.name).toBeUndefined();
    }
  });
});
