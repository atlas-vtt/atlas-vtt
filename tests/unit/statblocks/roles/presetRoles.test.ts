import { describe, expect, it } from 'vitest';
import { BUILT_IN_SYSTEM_PRESETS } from '../../../../src/app/gameSystems/builtInPresets';
import { isValidTemplateId } from '../../../../src/app/statblocks/model/templateIds';
import { isStatblockRoleId, statblockRolesAreValid } from '../../../../src/app/statblocks/roles/roleValidation';

/** Role ids never change (folders record them); names and templates per the system. */
const EXPECTED: Record<string, Array<[id: string, name: string, templateId: string]>> = {
  'D&D 5e': [['monster', 'Monster', 'builtin:5e-2024-monster'], ['npc', 'NPC', 'builtin:5e-2024-monster']],
  Cairn: [['creature', 'Creature', 'builtin:cairn-creature']],
  'Draw Steel': [['monster', 'Monster', 'builtin:draw-steel-monster']],
  'Pathfinder 2e': [['creature', 'Creature', 'builtin:d20-creature']],
  Daggerheart: [['adversary', 'Adversary', 'builtin:generic-creature'], ['environment', 'Environment', 'builtin:generic-hazard']],
  Shadowdark: [['monster', 'Monster', 'builtin:bx-creature']],
  'Old-School Essentials': [['monster', 'Monster', 'builtin:bx-creature']],
  'Call of Cthulhu': [['creature', 'Creature', 'builtin:percentile-creature'], ['character', 'Character', 'builtin:percentile-creature']],
  'Cyberpunk RED': [['npc', 'NPC', 'builtin:generic-npc']],
};

describe('the statblock roles of the built-in presets', () => {
  it('name each system\'s kinds of statblock with the template they start from', () => {
    const actual = Object.fromEntries(BUILT_IN_SYSTEM_PRESETS.map((preset) => [
      preset.name, (preset.rules.statblockRoles ?? []).map((role) => [role.id, role.name, role.templateId]),
    ]));
    expect(actual).toEqual(EXPECTED);
  });

  it('have valid ids, names and template ids, and no two roles of a system share an id or a name', () => {
    for (const preset of BUILT_IN_SYSTEM_PRESETS) {
      const roles = preset.rules.statblockRoles ?? [];
      expect(roles.every((role) => isStatblockRoleId(role.id) && isValidTemplateId(role.templateId))).toBe(true);
      expect(new Set(roles.map((role) => role.id)).size).toBe(roles.length);
      expect(statblockRolesAreValid(roles)).toBe(true);
    }
  });
});
