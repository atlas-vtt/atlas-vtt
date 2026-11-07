// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { draftResourceKey } from '../../src/app/resources/resourceDefinitions';
import { useCollectionSettingsDraft } from '../../src/app/react/components/collection-settings/useCollectionSettingsDraft';
import { draftRoleId } from '../../src/app/statblocks/roles/roleValidation';
import type { AssetService } from '../../src/app/services/AssetService';
import type { CollectionSettings } from '../../src/app/types/collectionSettingsTypes';
import type { SystemPreset } from '../../src/app/types/systemPresetTypes';

const shadowdark = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Shadowdark')!;
const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;

function draftFor(settings: CollectionSettings) {
  const assets = { getCollectionSettings: () => settings } as unknown as AssetService;
  return renderHook(() => useCollectionSettingsDraft(assets, 'dungeon', true));
}

it('switching systems replaces every condition, even one with the same name', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), systemPresetId: shadowdark.id });
  act(() => result.current.applyPreset(dnd5e));

  const settings = result.current.toSettings();
  expect(settings.systemPresetId).toBe(dnd5e.id);
  expect(settings.conditions?.map((c) => c.id)).toEqual(dnd5e.rules.conditions.map((c) => c.id));
  expect(settings.conditions?.some((c) => c.id.startsWith('shadowdark-'))).toBe(false);
});

it('clearing the system leaves the vanilla settings', () => {
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), defaultWidgets: { timer: true }, systemPresetId: shadowdark.id });
  act(() => result.current.clearSystem());
  expect(result.current.toSettings()).toMatchObject({ conditions: [], defaultWidgets: { hpBar: true, stressBar: false }, systemPresetId: undefined });
});

it('loads and saves the collection’s own creature filters and the switched-off ones, whatever the system', () => {
  const custom = [{ id: 'hd', label: 'HD', kind: 'range' as const, field: 'hit_dice' }];
  const { result } = draftFor({ ...structuredClone(shadowdark.rules), customCreatureFilters: custom, hiddenCreatureFilters: ['source'] });
  expect(result.current.customCreatureFilters).toEqual(custom);
  act(() => result.current.applyPreset(dnd5e));
  act(() => result.current.setHiddenCreatureFilters(['source', 'rarity']));
  expect(result.current.toSettings()).toMatchObject({ customCreatureFilters: custom, hiddenCreatureFilters: ['source', 'rarity'] });
});

it('carries the collection’s resources: the preset’s on a switch, HP alone without a system, edits on save', () => {
  const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!;
  // A collection saved before resources existed reads as its preset's
  const { result } = draftFor({ conditions: [], systemPresetId: shadowdark.id });
  expect(result.current.resources.map((r) => r.key)).toEqual(['hp']);

  act(() => result.current.applyPreset(cairn));
  expect(result.current.toSettings().resources?.map((r) => r.key)).toEqual(['hp', 'str']);

  act(() => result.current.setResources([{ ...result.current.resources[0]!, name: ' Hit Protection ', field: ' hp ' }]));
  expect(result.current.toSettings().resources).toMatchObject([{ key: 'hp', name: 'Hit Protection', field: 'hp' }]);

  // A resource added in the dialog is keyed by the name it has when saved
  act(() => result.current.setResources([...result.current.resources, { ...result.current.resources[0]!, key: draftResourceKey(), name: 'Ammo', field: 'ammo' }]));
  expect(result.current.toSettings().resources?.map((r) => r.key)).toEqual(['hp', 'ammo']);

  act(() => result.current.clearSystem());
  expect(result.current.toSettings().resources?.map((r) => r.key)).toEqual(['hp']);
});

describe('default token vision', () => {
  const ranged = { ...structuredClone(dnd5e.rules), defaultTokenVision: { darkvision: 60 }, systemPresetId: dnd5e.id };

  it('loads the collection’s default and saves an edit of it', () => {
    const { result } = draftFor(ranged);
    expect(result.current.defaultTokenVision).toEqual({ darkvision: 60 });
    act(() => result.current.setDefaultTokenVision({ darkvision: 60, range: 120, angle: 90 }));
    expect(result.current.toSettings().defaultTokenVision).toEqual({ darkvision: 60, range: 120, angle: 90 });
  });

  it('saves no default, explicitly, when none is set or every field is blank', () => {
    const { result } = draftFor(structuredClone(dnd5e.rules));
    expect(result.current.toSettings()).toHaveProperty('defaultTokenVision', undefined);
    act(() => result.current.setDefaultTokenVision({}));
    expect(result.current.toSettings()).toHaveProperty('defaultTokenVision', undefined);
  });

  it('takes the default of an applied preset, and none from a preset that sets none', () => {
    const night: SystemPreset = { ...dnd5e, id: 'user-night', builtIn: false, rules: { ...structuredClone(dnd5e.rules), defaultTokenVision: { tremorsense: 15 } } };
    const { result } = draftFor(ranged);
    act(() => result.current.applyPreset(night));
    expect(result.current.toSettings().defaultTokenVision).toEqual({ tremorsense: 15 });
    act(() => result.current.applyPreset(dnd5e));
    expect(result.current.toSettings().defaultTokenVision).toBeUndefined();
  });

  it('is cleared with the game system', () => {
    const { result } = draftFor(ranged);
    act(() => result.current.clearSystem());
    expect(result.current.toSettings().defaultTokenVision).toBeUndefined();
  });
});

it('keeps the bar switches of a collection whose resources stay, and switches a new bar on', () => {
  const hp = { ...dnd5e.rules.resources![0]! };
  const { result } = draftFor({ conditions: [], defaultWidgets: { hpBar: false }, resources: [hp] });
  expect(result.current.toSettings().defaultWidgets).toEqual({ hpBar: false });

  act(() => result.current.setResources([hp, { ...hp, key: draftResourceKey(), name: 'Stress', field: 'stress', direction: 'fills', defeatedWhenSpent: false }]));
  expect(result.current.toSettings().defaultWidgets).toEqual({ hpBar: false, stressBar: true });
});

it('keeps what players see of a resource when its system is applied again', () => {
  const { result } = draftFor({ ...structuredClone(dnd5e.rules), systemPresetId: dnd5e.id, resources: [{ ...dnd5e.rules.resources![0]!, visibleToPlayers: true }] });
  act(() => result.current.applyPreset(dnd5e));
  expect(result.current.toSettings().resources?.map((r) => [r.key, r.visibleToPlayers])).toEqual([['hp', true]]);
});

describe('senses', () => {
  const witchSight = {
    id: 'home-1', name: 'Witch sight', description: 'Sees in the dark within its range.', lineOfSight: true,
    sees: { bright: 'normal', dim: 'normal', dark: 'as-dim', magicalDark: 'none' }, look: 'colour', reveals: 'all', precise: true,
    seesInvisible: false, worksWhileBlinded: false, range: 'required',
  } as const;

  it('loads the collection’s own senses, without what cannot be used, and saves them', () => {
    const { result } = draftFor({ ...structuredClone(dnd5e.rules), senses: [witchSight, { name: 'No id' }] as never, systemPresetId: dnd5e.id });
    expect(result.current.senses).toEqual([witchSight]);
    expect(result.current.toSettings().senses).toEqual([witchSight]);
  });

  it('has none of its own in a collection saved before senses existed, and saves none, so it keeps following its preset', () => {
    const { senses: _senses, ...before } = structuredClone(dnd5e.rules);
    const { result } = draftFor({ ...before, systemPresetId: dnd5e.id });
    expect(result.current.senses).toBeUndefined();
    expect(result.current.toSettings()).toHaveProperty('senses', undefined);
  });

  it('drops its own senses when a preset is applied, so the collection reads the preset\'s', () => {
    const { result } = draftFor({ ...structuredClone(shadowdark.rules), senses: [witchSight], systemPresetId: shadowdark.id });
    expect(result.current.toSettings().senses).toEqual([witchSight]);
    act(() => result.current.applyPreset(dnd5e));
    expect(result.current.toSettings()).toHaveProperty('senses', undefined);
  });

  it('are cleared with the game system', () => {
    const { result } = draftFor({ ...structuredClone(dnd5e.rules), systemPresetId: dnd5e.id });
    act(() => result.current.clearSystem());
    expect(result.current.toSettings()).toHaveProperty('senses', undefined);
  });

  it('saves the senses once they are edited, and none again when the edit is taken back', () => {
    const { senses: _senses, ...before } = structuredClone(dnd5e.rules);
    const { result } = draftFor({ ...before, systemPresetId: dnd5e.id });
    act(() => result.current.setSenses([...dnd5e.rules.senses!, witchSight]));
    expect(result.current.toSettings().senses).toEqual([...dnd5e.rules.senses!, witchSight]);
    act(() => result.current.setSenses(undefined));
    expect(result.current.toSettings()).toHaveProperty('senses', undefined);
  });
});

describe('light presets', () => {
  const glowMoss = { id: 'home-1', name: 'Glow moss', bright: 5, dim: 15, color: '#7ee0a8', animation: 'none', kind: 'magical' } as const;
  const { lightPresets: _lights, ...withoutLights } = structuredClone(dnd5e.rules);

  it('loads the collection\'s own, without what cannot be used, and saves them again', () => {
    const { result } = draftFor({ ...withoutLights, lightPresets: [glowMoss, { name: 'No id' }] as never, systemPresetId: dnd5e.id });
    expect(result.current.lightPresets).toEqual([glowMoss]);
    expect(result.current.toSettings().lightPresets).toEqual([glowMoss]);
  });

  it('has none of its own in a collection that follows its preset, and saves none', () => {
    const { result } = draftFor({ ...withoutLights, systemPresetId: dnd5e.id });
    expect(result.current.lightPresets).toBeUndefined();
    expect(result.current.toSettings()).toHaveProperty('lightPresets', undefined);
  });

  it('are replaced by an applied preset\'s, which the collection then reads from the preset', () => {
    const { result } = draftFor({ ...withoutLights, lightPresets: [glowMoss], systemPresetId: shadowdark.id });
    act(() => result.current.applyPreset(dnd5e));
    expect(result.current.toSettings()).toHaveProperty('lightPresets', undefined);
  });

  it('are cleared with the game system', () => {
    const { result } = draftFor({ ...withoutLights, lightPresets: [glowMoss], systemPresetId: dnd5e.id });
    act(() => result.current.clearSystem());
    expect(result.current.toSettings()).toHaveProperty('lightPresets', undefined);
  });
});

it('follows the game system\'s initiative rules until the collection has its own, and drops them with the system', () => {
  const cairn = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'Cairn')!;
  const own = { mode: 'turn-order' as const, roll: ' 2d6 ', firstSide: 'players' as const };
  // Stored rules that are none read as unset
  const { result } = draftFor({ conditions: [], systemPresetId: cairn.id, initiative: { mode: 'teams' } as never });
  expect(result.current.initiative).toBeUndefined();
  expect(result.current.toSettings()).toHaveProperty('initiative', undefined);

  act(() => result.current.setInitiative(own));
  expect(result.current.toSettings().initiative).toEqual({ ...own, roll: '2d6' });

  // Another system brings its own rules, so the collection's go
  act(() => result.current.applyPreset(dnd5e));
  expect(result.current.toSettings()).toHaveProperty('initiative', undefined);

  act(() => result.current.setInitiative(own));
  act(() => result.current.clearSystem());
  expect(result.current.toSettings()).toHaveProperty('initiative', undefined);
});

describe('statblock roles', () => {
  const hag = { id: 'hag', name: 'Hag', templateId: 'marsh-hag-k7m2qa' };
  const { statblockRoles: _roles, ...withoutRoles } = structuredClone(dnd5e.rules);

  it('loads the collection\'s own roles, without what cannot be used, and saves them with their folders', () => {
    const { result } = draftFor({ ...withoutRoles, statblockRoles: [hag, { name: 'No id' }] as never, statblockRoleFolders: { hag: ' Bestiary/Hags ' }, systemPresetId: dnd5e.id });
    expect(result.current.statblockRoles).toEqual([hag]);
    expect(result.current.toSettings()).toMatchObject({ statblockRoles: [hag], statblockRoleFolders: { hag: 'Bestiary/Hags' } });
  });

  it('has none of its own in a collection that follows its preset, and saves none, explicitly', () => {
    const { result } = draftFor({ ...withoutRoles, statblockRoles: [], systemPresetId: dnd5e.id });
    expect(result.current.statblockRoles).toBeUndefined();
    expect(result.current.toSettings()).toHaveProperty('statblockRoles', undefined);
    expect(result.current.toSettings()).toHaveProperty('statblockRoleFolders', undefined);
  });

  it('gives a role added in the dialog its id from its name when saved', () => {
    const { result } = draftFor({ ...withoutRoles, systemPresetId: dnd5e.id });
    act(() => result.current.setStatblockRoles([...dnd5e.rules.statblockRoles!, { id: draftRoleId(), name: ' Lair ', templateId: 'builtin:generic-hazard' }]));
    expect(result.current.toSettings().statblockRoles?.map((role) => [role.id, role.name])).toEqual([['monster', 'Monster'], ['npc', 'NPC'], ['lair', 'Lair']]);
  });

  it('drops its own roles but keeps their folders when a preset is applied', () => {
    const { result } = draftFor({ ...withoutRoles, statblockRoles: [hag], statblockRoleFolders: { hag: 'Hags', monster: 'Monsters' }, systemPresetId: shadowdark.id });
    act(() => result.current.applyPreset(dnd5e));
    expect(result.current.toSettings()).toHaveProperty('statblockRoles', undefined);
    expect(result.current.toSettings().statblockRoleFolders).toEqual({ hag: 'Hags', monster: 'Monsters' });
  });

  it('are cleared with the game system, and the folders stay', () => {
    const { result } = draftFor({ ...withoutRoles, statblockRoles: [hag], statblockRoleFolders: { creature: 'Creatures' }, systemPresetId: dnd5e.id });
    act(() => result.current.clearSystem());
    expect(result.current.toSettings()).toHaveProperty('statblockRoles', undefined);
    expect(result.current.toSettings().statblockRoleFolders).toEqual({ creature: 'Creatures' });
  });

  it('saves a folder chosen for an inherited role without storing the roles, and none once it is cleared', () => {
    const { result } = draftFor({ ...withoutRoles, systemPresetId: dnd5e.id });
    act(() => result.current.setStatblockRoleFolders({ monster: 'Bestiary' }));
    expect(result.current.toSettings()).toMatchObject({ statblockRoles: undefined, statblockRoleFolders: { monster: 'Bestiary' } });
    act(() => result.current.setStatblockRoleFolders({ monster: ' ' }));
    expect(result.current.toSettings()).toHaveProperty('statblockRoleFolders', undefined);
  });
});
