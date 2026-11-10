import { describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { chooseCollection, linkingCollectionIds, resolveCollectionContext, roleNameFor } from '../../../../src/app/statblocks/editor/collectionContext';
import { choiceOptions } from '../../../../src/app/statblocks/editor/statblock-pane/ChoiceOptionList';
import { singular } from '../../../../src/app/statblocks/values/entryNoun';
import { keysOutsideTemplate, templateGroups, unshownKeys } from '../../../../src/app/statblocks/editor/statblock-pane/templateChoices';
import { builtInEntry } from '../../../../src/app/statblocks/library/templateFiles';
import { GENERIC_CREATURE, GENERIC_NPC, GENERIC_HAZARD } from '../../../../src/app/statblocks/presets/generic';

describe('the collection context', () => {
  const tokens = [
    { collection: 'a', statblockPath: 'Warden.md' },
    { collection: 'b', statblockPath: 'Hag.md' },
    { collection: 'a', statblockPath: 'Warden.md' },
  ];

  it('takes the entry point\'s collection, else the only one linking the note, else the default', () => {
    const known = new Set(['a', 'b', 'c']);
    expect(chooseCollection('b', known, ['a'], 'c')).toBe('b');
    expect(chooseCollection(null, known, linkingCollectionIds(tokens, 'Warden.md'), 'c')).toBe('a');
    expect(chooseCollection(null, known, ['a', 'b'], 'c')).toBe('c');
    expect(chooseCollection('gone', known, [], 'c')).toBe('c');
  });

  it('shows the collection in the header whenever there are several, also once a token links the note', async () => {
    const assets = {
      getCollections: async () => [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
      getAssets: async () => tokens,
      getDefaultCollectionId: () => 'b',
      loadedTokenAssets: () => [],
    };
    vi.doMock('../../../../src/app/services/AssetService', () => ({ AssetService: { getInstance: () => assets } }));
    vi.resetModules();
    const fresh = await import('../../../../src/app/statblocks/editor/collectionContext');
    const context = await fresh.resolveCollectionContext({} as App, 'Warden.md', null);
    expect(context).toMatchObject({ collectionId: 'a', linking: ['a'], switchable: true });
    vi.doUnmock('../../../../src/app/services/AssetService');
    expect(resolveCollectionContext).toBeTypeOf('function');
  });

  it('names a role only when exactly one role uses the template', () => {
    const roles = [
      { id: 'monster', name: 'Monster', templateId: 't1' },
      { id: 'boss', name: 'Boss', templateId: 't1' },
      { id: 'npc', name: 'NPC', templateId: 't2' },
    ];
    expect(roleNameFor(roles, 't2')).toBe('NPC');
    expect(roleNameFor(roles, 't1')).toBeNull();
    expect(roleNameFor(roles, 't3')).toBeNull();
  });
});

describe('Change template', () => {
  const library = [GENERIC_CREATURE, GENERIC_NPC, GENERIC_HAZARD].map(builtInEntry);

  it('lists the collection\'s templates first, named with their roles', () => {
    const groups = templateGroups(library, [{ id: 'npc', name: 'NPC', templateId: 'builtin:generic-npc' }]);
    expect(groups.map((group) => group.heading)).toEqual(['Used by this collection', 'All templates']);
    expect(groups[0]!.items.map((item) => [item.entry.name, item.detail])).toEqual([['NPC', 'NPC']]);
    expect(groups[1]!.items.map((item) => item.entry.name)).toEqual(['Creature', 'Hazard']);
  });

  it('says which of the note\'s values a template leaves out, never markers or Obsidian\'s own', () => {
    const record = { statblock: true, 'atlas-template': 'x', name: 'Warden', hp: 9, lair: 'Bog', tags: ['m'], wants: 'Quiet' };
    expect(unshownKeys(record, GENERIC_CREATURE.template)).toEqual(['lair', 'wants']);
    expect(keysOutsideTemplate(record, GENERIC_NPC.template)).toEqual(['lair']);
  });
});

describe('choice options', () => {
  const size = { options: ['Tiny', 'Small', 'Large'], open: true };

  it('filters by what was typed and offers the typed text where any is allowed', () => {
    expect(choiceOptions(size, 'l').map((option) => option.label)).toEqual(['Small', 'Large', 'Use “l”']);
    expect(choiceOptions(size, 'large').map((option) => option.value)).toEqual(['Large']);
    expect(choiceOptions({ ...size, open: false }, 'Swamp').map((option) => option.label)).toEqual([]);
  });
});

describe('entry nouns', () => {
  it('names one entry of a field', () => {
    expect(['Actions', 'Abilities', 'Villain Actions', 'Lair', 'Status'].map(singular)).toEqual(['Action', 'Ability', 'Villain Action', 'Lair', 'Status']);
  });
});
