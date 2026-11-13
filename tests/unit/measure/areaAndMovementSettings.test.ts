import { describe, expect, it, vi } from 'vitest';
import { readCampaignSystem } from '../../../src/app/campaigns/campaignSystem';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../src/app/gameSystems/builtInPresets';
import { BUILT_IN_DICE_SETS } from '../../../src/app/gameSystems/builtInDiceSets';
import { collectionMovementRules } from '../../../src/app/gameSystems/movementRules';
import { parseUserPresets } from '../../../src/app/gameSystems/presetValidation';
import { viewOfRules } from '../../../src/app/gameSystems/rulesView';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../../src/app/gameSystems/systemRules';
import { areaRulesOf, formatGameDistance, resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';
import { BEYOND_SPEED, dragMove } from '../../../src/app/measure/dragMovement';
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

  it('wait for a half typed step where the ruler names distances too, which shows the steps as well', () => {
    const bands = { ...settings, gridDefaults: { ...settings.gridDefaults, measurementMode: 'abstract' as const }, movement: { steps: [{ name: '', multiple: 1, color: '#22c55e' }], countPerTurn: false } };
    expect(viewOfRules(bands, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).isValid).toBe(false);
    expect(viewOfRules({ ...bands, movement: SPRINT }, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).isValid).toBe(true);
  });

  it('wait for a typed speed that is none', () => {
    expect(viewOfRules({ ...settings, movement: { ...SPRINT, speed: 0 } }, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).isValid).toBe(false);
    expect(viewOfRules({ ...settings, movement: { ...SPRINT, speed: 30 } }, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).isValid).toBe(true);
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

describe('the speed a system gives creatures that state none', () => {
  const drawSteel = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.id === 'builtin:drawsteel')!;
  const speedIn = (preset: SystemPreset, gridDefaults: CollectionGridDefaults | undefined): number | undefined =>
    collectionMovementRules({ systemPresetId: preset.id, gridDefaults }, BUILT_IN_SYSTEM_PRESETS).speed;

  it('reads as it stands where the collection kept the system\'s unit, whatever its squares span', () => {
    expect(speedIn(dnd5e, dnd5e.rules.gridDefaults)).toBe(30);
    expect(speedIn(dnd5e, { ...dnd5e.rules.gridDefaults, unitDistance: 10 })).toBe(30);
    expect(speedIn(dnd5e, undefined)).toBe(30);
    // The same rules object while nothing is converted: whoever keeps them by identity builds nothing anew.
    expect(collectionMovementRules({ systemPresetId: dnd5e.id, gridDefaults: dnd5e.rules.gridDefaults }, BUILT_IN_SYSTEM_PRESETS)).toBe(dnd5e.rules.movement);
  });

  it('is converted as rulebooks convert distances where the collection measures in another unit', () => {
    expect(speedIn(dnd5e, { ...dnd5e.rules.gridDefaults, unitType: 'meters', unitDistance: 1.5 })).toBe(9);
    // A system that counts in squares gives as many of the collection's squares; one in feet as many 5-foot squares.
    expect(speedIn(drawSteel, { ...drawSteel.rules.gridDefaults, unitType: 'feet', unitDistance: 5 })).toBe(25);
    expect(speedIn(dnd5e, { ...dnd5e.rules.gridDefaults, unitType: 'units', unitDistance: 1 })).toBe(6);
    const converted = collectionMovementRules({ systemPresetId: dnd5e.id, gridDefaults: { ...FEET, unitType: 'meters', unitDistance: 1.5 } }, BUILT_IN_SYSTEM_PRESETS);
    expect(converted).toEqual({ ...dnd5e.rules.movement, speed: 9 });
  });

  it('is the collection\'s own number once it has rules of its own', () => {
    const own = { systemPresetId: dnd5e.id, movement: { ...SPRINT, speed: 12 }, gridDefaults: { ...FEET, unitType: 'meters' as const, unitDistance: 1.5 } };
    expect(collectionMovementRules(own, BUILT_IN_SYSTEM_PRESETS).speed).toBe(12);
    expect(collectionMovementRules({ ...own, movement: SPRINT }, BUILT_IN_SYSTEM_PRESETS).speed).toBeUndefined();
  });

  it('shows in a settings dialog in the unit being typed, and typing it again stores nothing', () => {
    const settings = { ...rulesOfPreset(dnd5e), systemPresetId: dnd5e.id };
    const metres = { ...settings, gridDefaults: { ...settings.gridDefaults, unitType: 'meters' as const, unitDistance: 1.5 } };
    const view = viewOfRules(metres, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS);
    expect(view.movement.speed).toBe(9);
    const setMovement = vi.fn();
    movementEdit({ setMovement }, view)({ ...view.movement, speed: 9 });
    expect(setMovement).toHaveBeenLastCalledWith(undefined);
    movementEdit({ setMovement }, view)({ ...view.movement, speed: 10 });
    expect(setMovement).toHaveBeenLastCalledWith({ ...view.movement, speed: 10 });
  });

  it('is kept by a stored preset, alone too', () => {
    expect(userPreset({ movement: { ...SPRINT, speed: 30 } })?.rules.movement).toEqual({ ...SPRINT, speed: 30 });
    expect(userPreset({ movement: { steps: [], countPerTurn: false, speed: 30 } })?.rules.movement).toEqual({ steps: [], countPerTurn: false, speed: 30 });
    expect(userPreset({ movement: { ...SPRINT, speed: -1 } })?.rules.movement).toEqual(SPRINT);
  });
});

describe('the movement rules of the built-in systems', () => {
  const palette = new Set(RESOURCE_COLORS.map((colour) => colour.value));
  const GREEN = '#22c55e';
  const AMBER = '#f59e0b';
  const ORANGE = '#f97316';

  /**
   * What each system ships: the speed of a creature that states none (null where the rules give
   * none), a typical creature's speed where that is another, how far each step lets that
   * creature go as the map writes it, and whether movement adds up over a turn.
   */
  const SYSTEMS: Array<{ id: string; none: number | null; typical?: number; steps: Array<[name: string, reach: string, colour: string]>; perTurn: boolean }> = [
    { id: 'builtin:dnd5e', none: 30, steps: [['Move', '30ft', GREEN], ['Dash', '60ft', AMBER]], perTurn: true },
    { id: 'builtin:pathfinder2e', none: 25, steps: [['1 action', '25ft', GREEN], ['2 actions', '50ft', AMBER], ['3 actions', '75ft', ORANGE]], perTurn: true },
    { id: 'builtin:drawsteel', none: 5, steps: [['Move', '5u', GREEN], ['Second move', '10u', AMBER]], perTurn: true },
    { id: 'builtin:cairn', none: 40, steps: [['Move', '40ft', GREEN]], perTurn: true },
    // A statblock states 120' (40'): a third of the rate in an encounter, all of it at a run.
    { id: 'builtin:ose', none: 120, steps: [['Move', '40ft', GREEN], ['Run', '120ft', AMBER]], perTurn: true },
    { id: 'builtin:coc7e', none: 8, steps: [['Move', '8yd', GREEN], ['Sprint', '40yd', AMBER]], perTurn: true },
    // MOVE is each character's own stat; a MOVE of 6 moves 12 m and runs 24 m.
    { id: 'builtin:cyberpunkred', none: null, typical: 6, steps: [['Move', '12m', GREEN], ['Run', '24m', AMBER]], perTurn: true },
    { id: 'builtin:shadowdark', none: 30, steps: [['Move', 'Near', GREEN], ['Second move', 'Double Near', AMBER]], perTurn: true },
    { id: 'builtin:daggerheart', none: 30, steps: [['Move', 'Close', GREEN], ['Agility roll', 'Far', AMBER]], perTurn: false },
  ];

  it('come with every built-in system', () => {
    expect(BUILT_IN_SYSTEM_PRESETS.map((preset) => preset.id).sort()).toEqual(SYSTEMS.map((system) => system.id).sort());
  });

  for (const system of SYSTEMS) {
    const preset = BUILT_IN_SYSTEM_PRESETS.find((entry) => entry.id === system.id);

    it(`${preset?.name}: ${system.steps.map(([name, reach]) => `${name} to ${reach}`).join(', ')}`, () => {
      // A collection made from the system stores no movement rules: it reads the system's.
      const collection = { ...rulesOfPreset(preset!), systemPresetId: preset!.id };
      expect(collection).not.toHaveProperty('movement');
      const rules = collectionMovementRules(collection, BUILT_IN_SYSTEM_PRESETS);
      const settings = resolveMeasurementSettings(collection.gridDefaults, null);
      expect(rules.speed ?? null).toBe(system.none);
      expect(rules.countPerTurn).toBe(system.perTurn);
      const speed = system.typical ?? rules.speed!;
      expect(rules.steps.map((step) => [step.name, formatGameDistance(speed * step.multiple, settings), step.color])).toEqual(system.steps);

      // A drag that ends exactly where a step does lies in that step and reads its reach; a cell more is the next one, or beyond the last.
      rules.steps.forEach((step, index) => {
        const cells = (speed * step.multiple) / settings.unitDistance;
        expect(Number.isInteger(cells), `${step.name} ends on a cell`).toBe(true);
        const [, reach, colour] = system.steps[index]!;
        const at = dragMove({ cells, earlier: 0, speed, rules, settings });
        expect(at?.color, step.name).toBe(colour);
        expect(at?.label.split(' / ')[1], step.name).toBe(reach);
        expect(dragMove({ cells: cells + 1, earlier: 0, speed, rules, settings })?.color, `past ${step.name}`).toBe(system.steps[index + 1]?.[2] ?? BEYOND_SPEED);
      });
    });
  }

  it('write a drag as its numbers, or as its bands', () => {
    const drag = (id: string, cells: number, speed?: number): string | undefined => {
      const preset = BUILT_IN_SYSTEM_PRESETS.find((entry) => entry.id === id)!;
      const rules = collectionMovementRules({ systemPresetId: id, gridDefaults: preset.rules.gridDefaults }, BUILT_IN_SYSTEM_PRESETS);
      return dragMove({ cells, earlier: 0, speed: speed ?? rules.speed!, rules, settings: resolveMeasurementSettings(preset.rules.gridDefaults, null) })?.label;
    };
    expect(drag('builtin:dnd5e', 9)).toBe('45 / 60ft');
    expect(drag('builtin:ose', 8)).toBe('40 / 40ft');
    expect(drag('builtin:ose', 6, 90)).toBe('30 / 30ft');
    expect(drag('builtin:ose', 9)).toBe('45 / 120ft');
    expect(drag('builtin:coc7e', 20)).toBe('20 / 40yd');
    expect(drag('builtin:cyberpunkred', 7, 6)).toBe('14 / 24m');
    expect(drag('builtin:drawsteel', 4)).toBe('4 / 5u');
    expect(drag('builtin:shadowdark', 4)).toBe('Near / Near');
    expect(drag('builtin:shadowdark', 9)).toBe('Double Near / Double Near');
    expect(drag('builtin:daggerheart', 2)).toBe('Very Close / Close');
    expect(drag('builtin:daggerheart', 13)).toBe('Very Far / Far');
  });

  it('can be saved as they stand, in colours the settings offer, and read back the same', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const movement = preset.rules.movement!;
      expect(isValidMovementRules(movement), preset.name).toBe(true);
      for (const step of movement.steps) expect(palette.has(step.color), `${preset.name}: ${step.name}`).toBe(true);
      expect(collectionMovementRules({ movement: structuredClone(movement) }, [])).toEqual(movement);
    }
  });

  it('leave a collection made from its system untouched: no rules of its own, and none read as an edit', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const collection = { ...rulesOfPreset(preset), systemPresetId: preset.id };
      expect(sameSystemRules(preset.rules, collection), preset.name).toBe(true);
      expect(sameSystemRules(preset.rules, viewOfRules(collection, BUILT_IN_SYSTEM_PRESETS, BUILT_IN_DICE_SETS).systemRules), preset.name).toBe(true);
    }
  });
});
