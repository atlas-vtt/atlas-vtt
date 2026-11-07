import { describe, expect, it } from 'vitest';
import { blockAccess, playerAccess } from '../../../../src/app/online/gm/book/playerAccess';
import { abilityFieldKeys } from '../../../../src/app/statblocks/model/abilityParts';
import { splitAbilities } from '../../../../src/app/statblocks/model/abilityTabs';
import { renameFieldKey } from '../../../../src/app/statblocks/model/fieldOps';
import { playerAccessChoices, withPlayerAccess } from '../../../../src/app/statblocks/model/playerSettings';
import { flattenReadingOrder } from '../../../../src/app/statblocks/model/treeQueries';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE } from '../../../fixtures/statblockTemplateFixtures';

const SPELLS: TemplateField = { key: 'spells', label: 'Spells', type: 'spells' };
const withSpells: StatblockTemplate = { ...MARSH_CREATURE, fields: [...MARSH_CREATURE.fields, SPELLS] };

describe('setting what players may do with a template\'s fields', () => {
  it('stores only what differs from the default, and removes a field set back to it', () => {
    const hidden = withPlayerAccess(MARSH_CREATURE, ['ac'], 'hidden');
    expect(hidden.players).toEqual({ ac: 'hidden' });
    expect(playerAccess(hidden, 'ac')).toBe('hidden');
    const read = withPlayerAccess(hidden, ['speed'], 'read');
    expect(read.players).toEqual({ ac: 'hidden', speed: 'read' });
    expect(withPlayerAccess(read, ['speed'], 'edit').players).toEqual({ ac: 'hidden' });
  });

  it('removes the record once it holds nothing, and changes nothing where the setting is already so', () => {
    const hidden = withPlayerAccess(MARSH_CREATURE, ['ac'], 'hidden');
    const back = withPlayerAccess(hidden, ['ac'], 'edit');
    expect(back).not.toHaveProperty('players');
    expect(withPlayerAccess(MARSH_CREATURE, ['ac'], 'edit')).toBe(MARSH_CREATURE);
    expect(withPlayerAccess(hidden, ['ac'], 'hidden')).toBe(hidden);
    expect(withPlayerAccess(MARSH_CREATURE, ['nothing'], 'hidden')).toBe(MARSH_CREATURE);
  });

  it('reads a spell list by default and never lets players change one', () => {
    expect(playerAccessChoices([SPELLS])).toEqual(['read', 'hidden']);
    expect(playerAccessChoices([SPELLS, MARSH_CREATURE.fields[5]!])).toEqual(['edit', 'read', 'hidden']);
    const hidden = withPlayerAccess(withSpells, ['spells'], 'hidden');
    expect(hidden.players).toEqual({ spells: 'hidden' });
    expect(withPlayerAccess(hidden, ['spells'], 'read')).not.toHaveProperty('players');
    expect(withPlayerAccess(withSpells, ['spells'], 'edit')).toBe(withSpells);
  });

  it('sets every list of an Abilities tile split into tabs at once', () => {
    const entries = flattenReadingOrder(MARSH_CREATURE.layout.blocks).find((block) => block.type === 'entries' && block.field === 'actions')!;
    const split = splitAbilities(MARSH_CREATURE, entries.id);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const tabs = flattenReadingOrder(split.template.layout.blocks).find((block) => block.type === 'tabs')!;
    const tabbed = withPlayerAccess(split.template, abilityFieldKeys(tabs), 'read');
    const keys = abilityFieldKeys(tabs);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(playerAccess(tabbed, key)).toBe('read');
    expect(blockAccess(tabbed, tabs)).toBe('read');
  });

  it('keeps a setting through a rename, and drops one kept under a former key when the field is set again', () => {
    const renamed = renameFieldKey(withPlayerAccess(MARSH_CREATURE, ['speed'], 'read'), 'speed', 'movement');
    expect(renamed.players).toEqual({ movement: 'read' });
    expect(playerAccess(renamed, 'movement')).toBe('read');
    const stale: StatblockTemplate = { ...renamed, players: { speed: 'hidden' } };
    expect(playerAccess(stale, 'movement')).toBe('hidden');
    expect(withPlayerAccess(stale, ['movement'], 'edit')).not.toHaveProperty('players');
  });
});
