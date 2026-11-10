import { describe, expect, it } from 'vitest';
import { fieldFingerprint } from '../../src/app/services/collectionBundle/fingerprints';
import { comparableSettings, exportedSettings, folderBelow, importedSettings, settingsFromBundle, withPresetRoles, withRoleFolders } from '../../src/app/services/collectionBundle/bundleSettings';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import { GENERIC_STATBLOCK_ROLES } from '../../src/app/statblocks/roles/collectionStatblockRoles';
import type { SystemPreset } from '../../src/app/types/systemPresetTypes';
import type { CollectionMetadata } from '../../src/app/services/AssetService';
import { HP, STR, STRESS } from '../mocks/resourceFixtures';

const collection = (settings: CollectionMetadata['settings']): CollectionMetadata => ({ id: 'Own', name: 'Own', settings } as CollectionMetadata);
const daggerheart = { conditions: [], systemPresetId: 'builtin:daggerheart', defaultWidgets: { hpBar: true, stressBar: true } };

describe('a collection\'s settings in a bundle', () => {
  it('count as unchanged when Atlas only stored the resources they already read as', async () => {
    const before = await fieldFingerprint(collection(daggerheart), 'settings');
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP, STRESS] }), 'settings')).toBe(before);
    // What players see is the table's choice, as the old player switch was
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [{ ...HP, visibleToPlayers: true }, STRESS] }), 'settings')).toBe(before);
  });

  it('count as changed when the GM changed the resources', async () => {
    const before = await fieldFingerprint(collection(daggerheart), 'settings');
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP, STRESS, STR] }), 'settings')).not.toBe(before);
    expect(await fieldFingerprint(collection({ ...daggerheart, resources: [HP] }), 'settings')).not.toBe(before);
  });

  it('keep the vault\'s resources when the bundle, written by an older Atlas, names none', () => {
    const mine = { ...daggerheart, resources: [{ ...HP, visibleToPlayers: true }, STRESS] };
    expect(settingsFromBundle({ ...daggerheart, lootCurrency: 'gp' }, mine)).toEqual({ ...daggerheart, lootCurrency: 'gp', resources: mine.resources });
    expect(settingsFromBundle({ ...daggerheart, resources: [HP] }, mine).resources).toEqual([HP]);
    expect(settingsFromBundle(daggerheart, undefined)).toEqual(daggerheart);
  });
});

describe('statblock roles in a bundle', () => {
  const dnd5e = BUILT_IN_SYSTEM_PRESETS.find((preset) => preset.name === 'D&D 5e')!;
  const hag = { id: 'hag', name: 'Hag', templateId: 'marsh-hag-k7m2qa' } as const;
  const marsh: SystemPreset = { ...dnd5e, id: 'user-marsh', name: 'Marsh', builtIn: false, rules: { ...dnd5e.rules, statblockRoles: [hag] } };
  const presets = [...BUILT_IN_SYSTEM_PRESETS, marsh];

  it('carry the roles a collection reads from a user preset, which the recipient may not have', () => {
    const settings = { conditions: [], systemPresetId: marsh.id };
    expect(withPresetRoles(settings, presets)).toEqual({ ...settings, statblockRoles: [hag] });
    // Its own roles go as they are
    expect(withPresetRoles({ ...settings, statblockRoles: [{ ...hag, name: 'Witch' }] }, presets).statblockRoles).toEqual([{ ...hag, name: 'Witch' }]);
  });

  it('leave a built-in preset\'s roles unset, and add none for a preset without roles or one that is gone', () => {
    const builtIn = { conditions: [], systemPresetId: dnd5e.id };
    expect(withPresetRoles(builtIn, presets)).toBe(builtIn);
    const { statblockRoles: _roles, ...rulesWithoutRoles } = dnd5e.rules;
    const silent: SystemPreset = { ...marsh, id: 'user-silent', rules: rulesWithoutRoles };
    expect(withPresetRoles({ conditions: [], systemPresetId: silent.id }, [silent])).toEqual({ conditions: [], systemPresetId: silent.id });
    expect(withPresetRoles({ conditions: [], systemPresetId: 'user-gone' }, presets)).toEqual({ conditions: [], systemPresetId: 'user-gone' });
  });

  it('count as unchanged when they are the roles the settings read from their preset', async () => {
    const plain = { conditions: [], systemPresetId: dnd5e.id };
    const before = await fieldFingerprint(collection(plain), 'settings');
    expect(await fieldFingerprint(collection({ ...plain, statblockRoles: structuredClone(dnd5e.rules.statblockRoles) }), 'settings')).toBe(before);
    expect(await fieldFingerprint(collection({ ...plain, statblockRoles: [] }), 'settings')).toBe(before);
    expect(await fieldFingerprint(collection({ ...plain, statblockRoles: [hag] }), 'settings')).not.toBe(before);
    // Without a system the generic pair is what the settings read
    expect(comparableSettings({ conditions: [], statblockRoles: [...GENERIC_STATBLOCK_ROLES] })).toEqual({ conditions: [] });
  });

  it('written out of a user preset count as unchanged where that preset is known', () => {
    const inherited = { conditions: [], systemPresetId: marsh.id };
    expect(comparableSettings(withPresetRoles(inherited, presets), presets)).toEqual(inherited);
    // A vault without the preset reads the bundle's roles as the collection's own
    expect(comparableSettings(withPresetRoles(inherited, presets))).toEqual({ ...inherited, statblockRoles: [hag] });
  });

  it('take each role\'s folder to where it goes, and leave out folders that go nowhere', () => {
    const settings = { conditions: [], statblockRoleFolders: { hag: 'atlas-vtt/collections/Marsh/Hags', npc: 'People' } };
    const moved = withRoleFolders(settings, (folder) => (folder.startsWith('atlas-vtt/') ? folder.replace('/Marsh/', '/Fen/') : undefined));
    expect(moved.statblockRoleFolders).toEqual({ hag: 'atlas-vtt/collections/Fen/Hags' });
    expect(withRoleFolders(settings, () => undefined)).not.toHaveProperty('statblockRoleFolders');
    const without = { conditions: [] };
    expect(withRoleFolders(without, () => 'x')).toBe(without);
  });
});

describe('statblock roles moving between vaults', () => {
  const hag = { id: 'hag', name: 'Hag', templateId: 'marsh-hag-k7m2qa' };
  const folders = { hag: 'atlas-vtt/collections/Marsh/Hags', npc: 'People' };

  it('take their folders along only from inside the collection\'s folder', () => {
    expect(folderBelow('atlas-vtt/collections/Marsh/Hags', 'atlas-vtt/collections/Marsh', 'atlas-vtt/collections/Fen')).toBe('atlas-vtt/collections/Fen/Hags');
    expect(folderBelow('atlas-vtt/collections/Marsh', 'atlas-vtt/collections/Marsh', 'atlas-vtt/collections/Fen')).toBe('atlas-vtt/collections/Fen');
    expect(folderBelow('atlas-vtt/collections/Marshland/Hags', 'atlas-vtt/collections/Marsh', 'atlas-vtt/collections/Fen')).toBeUndefined();
    const exported = exportedSettings({ conditions: [], statblockRoles: [hag], statblockRoleFolders: folders, lootBases: ['Loot.base'] }, BUILT_IN_SYSTEM_PRESETS, {
      file: () => undefined,
      folder: (folder) => folderBelow(folder, 'atlas-vtt/collections/Marsh', 'atlas-vtt/collections/Marsh'),
    });
    expect(exported).toEqual({ conditions: [], statblockRoles: [hag], statblockRoleFolders: { hag: 'atlas-vtt/collections/Marsh/Hags' }, lootBases: [] });
  });

  it('arrive in the importing collection\'s folder, starting from the templates\' ids there', () => {
    const settings = { conditions: [], statblockRoles: [hag], statblockRoleFolders: folders };
    const imported = importedSettings({ ...collection(settings), id: 'Marsh' }, { collectionId: 'Fen', paths: new Map(), templateIds: new Map([[hag.templateId, 'marsh-hag-c0py01']]) });
    expect(imported).toEqual({ conditions: [], statblockRoles: [{ ...hag, templateId: 'marsh-hag-c0py01' }], statblockRoleFolders: { hag: 'atlas-vtt/collections/Fen/Hags' } });
  });
});
