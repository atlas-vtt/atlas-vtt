import { describe, expect, it } from 'vitest';
import { parseUserPreset } from '../../../../src/app/gameSystems/presetValidation';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import type { StatblockRole } from '../../../../src/app/statblocks/model/roleTypes';
import {
  draftRoleId, isStatblockRoleId, parseStatblockRole, parseStatblockRoleFolders, parseStatblockRoles, roleNameProblem,
  savedRoleFolders, savedStatblockRoles, statblockRolesAreValid,
} from '../../../../src/app/statblocks/roles/roleValidation';

const monster: StatblockRole = { id: 'monster', name: 'Monster', templateId: 'builtin:5e-2024-monster' };
const witch: StatblockRole = { id: 'witch', name: 'Witch', templateId: 'marsh-witch-k7m2qa' };

describe('parseStatblockRole', () => {
  it('keeps a usable role, its name trimmed, and nothing it does not know', () => {
    expect(parseStatblockRole({ ...monster, name: ' Monster ', colour: 'red' })).toEqual(monster);
    // A vault template the vault does not have (yet) is kept: the role starts from the generic one meanwhile
    expect(parseStatblockRole(witch)).toEqual(witch);
  });

  it.each([
    ['no record', 'monster'],
    ['no id', { ...monster, id: undefined }],
    ['a draft id', { ...monster, id: 'new:1234' }],
    ['an id no name gives', { ...monster, id: 'Monster' }],
    ['a blank name', { ...monster, name: '  ' }],
    ['a name that is no text', { ...monster, name: 7 }],
    ['no template id', { ...monster, templateId: undefined }],
    ['a template id of no form Atlas gives', { ...monster, templateId: '../escape' }],
  ])('drops a role with %s', (_case, raw) => {
    expect(parseStatblockRole(raw)).toBeNull();
  });
});

describe('parseStatblockRoles', () => {
  it('keeps the usable roles in order, the first where ids or names repeat', () => {
    const raw = [monster, { name: 'Broken' }, witch, { ...witch, name: 'Hag' }, { ...monster, id: 'beast', name: ' monster ' }];
    expect(parseStatblockRoles(raw)).toEqual([monster, witch]);
  });

  it('reads anything that is not a list as no list, and keeps an empty one', () => {
    expect(parseStatblockRoles(undefined)).toBeUndefined();
    expect(parseStatblockRoles({ monster })).toBeUndefined();
    expect(parseStatblockRoles([])).toEqual([]);
  });
});

describe('roles of stored presets', () => {
  const stored = (statblockRoles: unknown): unknown => ({
    id: 'user-1', name: 'Marsh', rules: { gridDefaults: BUILT_IN_SYSTEM_PRESETS[0]!.rules.gridDefaults, conditions: [], statblockRoles },
  });

  it('are read role by role: an unusable one is left out and the rest of the preset stays', () => {
    expect(parseUserPreset(stored([monster, { id: 'x' }, witch]))?.rules.statblockRoles).toEqual([monster, witch]);
  });

  it('are absent when the preset names none, an empty list or none that can be used', () => {
    expect(parseUserPreset(stored(undefined))?.rules).not.toHaveProperty('statblockRoles');
    expect(parseUserPreset(stored([]))?.rules).not.toHaveProperty('statblockRoles');
    expect(parseUserPreset(stored([{ id: 'x' }]))?.rules).not.toHaveProperty('statblockRoles');
  });

  it('of every built-in preset survive being stored as a user preset', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const copy = parseUserPreset(JSON.parse(JSON.stringify({ ...preset, id: `user-${preset.name}`, builtIn: false })));
      expect(copy?.rules.statblockRoles).toEqual(preset.rules.statblockRoles);
    }
  });
});

describe('parseStatblockRoleFolders', () => {
  it('keeps a trimmed folder per role id and drops what names none', () => {
    const raw: unknown = JSON.parse('{"monster":" Bestiary/Monsters ","npc":"","witch":3,"new:1":"Drafts","__proto__":"x"}');
    expect(parseStatblockRoleFolders(raw)).toEqual({ monster: 'Bestiary/Monsters' });
  });

  it('reads no record, or one without a usable folder, as none', () => {
    expect(parseStatblockRoleFolders(['Bestiary'])).toBeUndefined();
    expect(parseStatblockRoleFolders({ npc: ' ' })).toBeUndefined();
  });
});

describe('saving roles', () => {
  it('gives a role added in the dialog its id from the name it is saved with, and keeps the ids of saved roles', () => {
    const renamed = { ...monster, name: ' Beast ' };
    const saved = savedStatblockRoles([renamed, { id: draftRoleId(), name: ' Monster ', templateId: 'builtin:generic-creature' }]);
    // The new "Monster" cannot take the id the renamed role keeps
    expect(saved.map((role) => [role.id, role.name])).toEqual([['monster', 'Beast'], ['monster-2', 'Monster']]);
  });

  it('gives a role added again after it was removed its old id, so it finds its folder again', () => {
    const saved = savedStatblockRoles([witch, { id: draftRoleId(), name: 'Monster', templateId: 'builtin:generic-creature' }]);
    expect(saved[1]!.id).toBe('monster');
  });

  it('keys a role by its id rule even when its name has no letter to key by', () => {
    const saved = savedStatblockRoles([{ id: draftRoleId(), name: '怪物', templateId: 'builtin:generic-creature' }]);
    expect(saved[0]!.id).toBe('role');
    expect(isStatblockRoleId(saved[0]!.id)).toBe(true);
  });

  it('saves folders trimmed, without blank ones, and none when none is left', () => {
    expect(savedRoleFolders({ monster: ' Bestiary ', npc: ' ' })).toEqual({ monster: 'Bestiary' });
    expect(savedRoleFolders({ npc: '' })).toBeUndefined();
  });
});

describe('what keeps roles from being saved', () => {
  it('refuses a role without a name', () => {
    const roles = [monster, { ...witch, name: '  ' }];
    expect(roleNameProblem(roles, 1)).toBe('Enter a name');
    expect(statblockRolesAreValid(roles)).toBe(false);
  });

  it('refuses two roles with one name, whatever their case or spacing, at the later one', () => {
    const roles = [monster, { ...witch, name: ' monster' }];
    expect(roleNameProblem(roles, 0)).toBeNull();
    expect(roleNameProblem(roles, 1)).toBe('Another role has this name');
    expect(statblockRolesAreValid(roles)).toBe(false);
  });

  it('accepts named roles with distinct names, and no roles at all', () => {
    expect(statblockRolesAreValid([monster, witch])).toBe(true);
    expect(statblockRolesAreValid([])).toBe(true);
  });
});
