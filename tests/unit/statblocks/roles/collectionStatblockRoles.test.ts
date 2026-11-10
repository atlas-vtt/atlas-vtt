import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { rulesOfPreset, sameSystemRules, vanillaSystemSettings } from '../../../../src/app/gameSystems/systemRules';
import type { StatblockRole } from '../../../../src/app/statblocks/model/roleTypes';
import {
  GENERIC_ROLE_TEMPLATE_ID, GENERIC_STATBLOCK_ROLES, collectionStatblockRoles, editedStatblockRoles, roleFolder, roleTemplate,
  sameStatblockRoles,
} from '../../../../src/app/statblocks/roles/collectionStatblockRoles';
import type { SystemPreset, SystemRules } from '../../../../src/app/types/systemPresetTypes';

const preset = (name: string): SystemPreset => BUILT_IN_SYSTEM_PRESETS.find((candidate) => candidate.name === name)!;
const dnd5e = preset('D&D 5e');
const daggerheart = preset('Daggerheart');
const witch: StatblockRole = { id: 'witch', name: 'Witch', templateId: 'marsh-witch-k7m2qa' };
/** 5e's rules as a system that names no roles. */
const { statblockRoles: _roles, ...rulesWithoutRoles } = dnd5e.rules;

describe('collectionStatblockRoles', () => {
  it('reads the collection\'s own roles first', () => {
    expect(collectionStatblockRoles({ statblockRoles: [witch], systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS)).toEqual([witch]);
  });

  it('reads the recorded preset\'s roles while the collection has none of its own', () => {
    expect(collectionStatblockRoles({ systemPresetId: daggerheart.id }, BUILT_IN_SYSTEM_PRESETS).map((role) => role.name))
      .toEqual(['Adversary', 'Environment']);
    // An empty list is none
    expect(collectionStatblockRoles({ statblockRoles: [], systemPresetId: daggerheart.id }, BUILT_IN_SYSTEM_PRESETS))
      .toBe(daggerheart.rules.statblockRoles);
  });

  it('falls back to the generic pair without a system, with a system that names no roles, or with a preset that is gone', () => {
    const silent: SystemPreset = { ...dnd5e, id: 'user-silent', builtIn: false, rules: rulesWithoutRoles };
    expect(collectionStatblockRoles({}, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_STATBLOCK_ROLES);
    expect(collectionStatblockRoles({ systemPresetId: silent.id }, [silent])).toBe(GENERIC_STATBLOCK_ROLES);
    expect(collectionStatblockRoles({ systemPresetId: 'user-deleted' }, BUILT_IN_SYSTEM_PRESETS)).toBe(GENERIC_STATBLOCK_ROLES);
    expect(GENERIC_STATBLOCK_ROLES.map((role) => [role.id, role.templateId]))
      .toEqual([['creature', 'builtin:generic-creature'], ['npc', 'builtin:generic-npc']]);
  });
});

describe('sameStatblockRoles', () => {
  it('compares ids, names and templates in order, and reads none or an empty list as the generic pair', () => {
    const roles = dnd5e.rules.statblockRoles!;
    expect(sameStatblockRoles(roles, structuredClone(roles))).toBe(true);
    expect(sameStatblockRoles(roles, [...roles].reverse())).toBe(false);
    expect(sameStatblockRoles(roles, [{ ...roles[0]!, name: 'Beast' }, roles[1]!])).toBe(false);
    expect(sameStatblockRoles(roles, [{ ...roles[0]!, templateId: 'builtin:generic-creature' }, roles[1]!])).toBe(false);
    expect(sameStatblockRoles(roles, [{ ...roles[0]!, id: 'beast' }, roles[1]!])).toBe(false);
    expect(sameStatblockRoles(undefined, [])).toBe(true);
    expect(sameStatblockRoles(undefined, structuredClone(GENERIC_STATBLOCK_ROLES))).toBe(true);
  });

  it('stores nothing for an edit that ends at the system\'s roles', () => {
    const system = dnd5e.rules.statblockRoles;
    expect(editedStatblockRoles(structuredClone(system!), system)).toBeUndefined();
    expect(editedStatblockRoles([...system!, witch], system)).toEqual([...system!, witch]);
    expect(editedStatblockRoles(structuredClone(GENERIC_STATBLOCK_ROLES), undefined)).toBeUndefined();
    // Removing every role leaves the system's
    expect(editedStatblockRoles([], system)).toBeUndefined();
  });
});

describe('roles in the system rules', () => {
  const rules: SystemRules = rulesOfPreset(dnd5e);

  it('read unset as the preset\'s, so a collection that follows its preset is unedited', () => {
    expect(sameSystemRules(dnd5e.rules, rules)).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, statblockRoles: [] })).toBe(true);
    expect(sameSystemRules(dnd5e.rules, { ...rules, statblockRoles: collectionStatblockRoles({ systemPresetId: dnd5e.id }, BUILT_IN_SYSTEM_PRESETS) })).toBe(true);
  });

  it('count an edited role as an edited system', () => {
    expect(sameSystemRules(dnd5e.rules, { ...rules, statblockRoles: [...dnd5e.rules.statblockRoles!, witch] })).toBe(false);
    // A system without roles has the generic pair
    const plain: SystemRules = rulesWithoutRoles;
    expect(sameSystemRules(plain, { ...rules, statblockRoles: GENERIC_STATBLOCK_ROLES })).toBe(true);
    expect(sameSystemRules(plain, { ...rules, statblockRoles: [witch] })).toBe(false);
  });

  it('are never copied by rulesOfPreset and cleared by the vanilla settings', () => {
    expect(rulesOfPreset(dnd5e)).not.toHaveProperty('statblockRoles');
    expect(vanillaSystemSettings()).toHaveProperty('statblockRoles', undefined);
    expect(vanillaSystemSettings()).not.toHaveProperty('statblockRoleFolders');
  });
});

describe('roleFolder', () => {
  it('reads the folder chosen for a role, and none for a role without one', () => {
    const settings = { statblockRoleFolders: { monster: 'Bestiary/Monsters' } };
    expect(roleFolder(settings, 'monster')).toBe('Bestiary/Monsters');
    expect(roleFolder(settings, 'npc')).toBeUndefined();
    expect(roleFolder({}, 'monster')).toBeUndefined();
  });

  it('never finds what every object has for a role named like it', () => {
    expect(roleFolder({ statblockRoleFolders: {} }, 'constructor')).toBeUndefined();
    expect(roleFolder({ statblockRoleFolders: {} }, 'to-string')).toBeUndefined();
    expect(roleFolder({ statblockRoleFolders: { constructor: 'Constructs' } }, 'constructor')).toBe('Constructs');
  });
});

describe('roleTemplate', () => {
  it('starts from the role\'s template while it exists', () => {
    expect(roleTemplate(witch, (id) => id === witch.templateId)).toEqual({ templateId: witch.templateId, missing: false });
  });

  it('starts a role whose template is missing from the generic template, and says it is missing', () => {
    expect(roleTemplate(witch, () => false)).toEqual({ templateId: GENERIC_ROLE_TEMPLATE_ID, missing: true });
    expect(GENERIC_ROLE_TEMPLATE_ID).toBe('builtin:generic-creature');
  });
});
