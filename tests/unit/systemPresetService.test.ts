import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { SystemPresetService } from '../../src/app/services/SystemPresetService';
import type { SystemRules } from '../../src/app/types/systemPresetTypes';
import { memoryPresets } from '../mocks/memoryPresets';

const rules: SystemRules = structuredClone(BUILT_IN_SYSTEM_PRESETS[1]!.rules);

describe('SystemPresetService', () => {
  it('lists built-in presets first, then the user presets by name', () => {
    const service = new SystemPresetService(memoryPresets());
    service.create('Zeta', rules);
    service.create('Alpha', rules);
    expect(service.list().map((p) => p.name)).toEqual([...BUILT_IN_SYSTEM_PRESETS.map((p) => p.name), 'Alpha', 'Zeta']);
  });

  it('rejects empty and taken names, ignoring case', () => {
    const service = new SystemPresetService(memoryPresets());
    const preset = service.create('Homebrew', rules);
    expect(service.nameError('  ')).toBe('Enter a name');
    expect(service.nameError('daggerheart')).toBe('A preset with this name already exists');
    expect(service.nameError('HOMEBREW')).toBe('A preset with this name already exists');
    expect(service.nameError('Homebrew', preset.id)).toBeNull();
    expect(() => service.create('homebrew', rules)).toThrow();
  });

  it('renames, updates and deletes user presets but never built-in ones', () => {
    const service = new SystemPresetService(memoryPresets());
    const preset = service.create('Homebrew', rules);
    service.rename(preset.id, 'House Rules');
    service.update(preset.id, { ...rules, conditions: [] });
    expect(service.list().find((p) => p.id === preset.id)).toMatchObject({ name: 'House Rules', rules: { conditions: [] } });
    expect(() => service.rename(BUILT_IN_SYSTEM_PRESETS[0]!.id, 'Mine')).toThrow();
    service.delete(BUILT_IN_SYSTEM_PRESETS[0]!.id);
    service.delete(preset.id);
    expect(service.list()).toHaveLength(BUILT_IN_SYSTEM_PRESETS.length);
  });

  it('keeps fields a newer version stored when editing a preset', () => {
    const presets = memoryPresets([{ id: 'p1', name: 'Future', addedLater: true, rules: { ...rules, vision: { enabled: true } } }]);
    const service = new SystemPresetService(presets);
    service.update('p1', rules);
    expect(presets.current()[0]).toMatchObject({ addedLater: true, rules: { vision: { enabled: true } } });
  });

  it('saves and clears a default token vision when a preset is edited', () => {
    const service = new SystemPresetService(memoryPresets());
    const preset = service.create('Homebrew', { ...rules, defaultTokenVision: { darkvision: 60 } });
    expect(service.list().find((p) => p.id === preset.id)?.rules.defaultTokenVision).toEqual({ darkvision: 60 });
    service.update(preset.id, { ...rules, defaultTokenVision: { darkvision: 30, angle: 120 } });
    expect(service.list().find((p) => p.id === preset.id)?.rules.defaultTokenVision).toEqual({ darkvision: 30, angle: 120 });
    service.update(preset.id, rules);
    expect(service.list().find((p) => p.id === preset.id)?.rules).not.toHaveProperty('defaultTokenVision');
  });

  it('saves and clears the senses when a preset is edited', () => {
    const service = new SystemPresetService(memoryPresets());
    const senses = structuredClone(rules.senses!);
    const preset = service.create('Homebrew', rules);
    expect(service.list().find((p) => p.id === preset.id)?.rules.senses).toEqual(senses);
    service.update(preset.id, { ...rules, senses: senses.slice(0, 2) });
    expect(service.list().find((p) => p.id === preset.id)?.rules.senses).toEqual(senses.slice(0, 2));
    const { senses: _senses, ...withoutSenses } = rules;
    service.update(preset.id, withoutSenses);
    expect(service.list().find((p) => p.id === preset.id)?.rules).not.toHaveProperty('senses');
  });

  it('saves and clears the light presets when a preset is edited', () => {
    const service = new SystemPresetService(memoryPresets());
    const lights = structuredClone(rules.lightPresets!);
    const preset = service.create('Homebrew', rules);
    expect(service.list().find((p) => p.id === preset.id)?.rules.lightPresets).toEqual(lights);
    service.update(preset.id, { ...rules, lightPresets: lights.slice(0, 2) });
    expect(service.list().find((p) => p.id === preset.id)?.rules.lightPresets).toEqual(lights.slice(0, 2));
    const { lightPresets: _lights, ...withoutLights } = rules;
    service.update(preset.id, withoutLights);
    expect(service.list().find((p) => p.id === preset.id)?.rules).not.toHaveProperty('lightPresets');
  });

  it('saves and clears the statblock roles when a preset is edited', () => {
    const service = new SystemPresetService(memoryPresets());
    const roles = structuredClone(rules.statblockRoles!);
    const preset = service.create('Homebrew', rules);
    expect(service.list().find((p) => p.id === preset.id)?.rules.statblockRoles).toEqual(roles);
    service.update(preset.id, { ...rules, statblockRoles: roles.slice(0, 1) });
    expect(service.list().find((p) => p.id === preset.id)?.rules.statblockRoles).toEqual(roles.slice(0, 1));
    const { statblockRoles: _roles, ...withoutRoles } = rules;
    service.update(preset.id, withoutRoles);
    expect(service.list().find((p) => p.id === preset.id)?.rules).not.toHaveProperty('statblockRoles');
  });

  it('keeps what a newer version stored in a sense until the preset is edited', () => {
    const future = { ...rules.senses![0]!, id: 'future', hears: true };
    const presets = memoryPresets([{ id: 'p1', name: 'Future', rules: { ...rules, senses: [future] } }]);
    const service = new SystemPresetService(presets);
    expect(service.list().find((p) => p.id === 'p1')?.rules.senses?.[0]).not.toHaveProperty('hears');
    service.rename('p1', 'Renamed');
    expect(presets.current()[0]).toMatchObject({ name: 'Renamed', rules: { senses: [{ id: 'future', hears: true }] } });
  });

  it('stores a copy, so later edits to the rules do not leak into the preset', () => {
    const service = new SystemPresetService(memoryPresets());
    const draft = structuredClone(rules);
    const preset = service.create('Snapshot', draft);
    draft.conditions.pop();
    expect(service.list().find((p) => p.id === preset.id)?.rules.conditions).toHaveLength(15);
  });
});
