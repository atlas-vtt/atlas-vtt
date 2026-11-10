import { describe, expect, it } from 'vitest';
import { discoverCreatureFields } from '../../src/app/creatures/creatureFieldDiscovery';
import type { IndexedCreature } from '../../src/app/creatures/CreatureIndex';

const creature = (fields: Record<string, unknown>): IndexedCreature => ({ path: String(fields.name), templateId: null, meanings: {}, lookName: null, fields });

const CREATURES = [
  creature({ name: 'Goblin', statblock: true, image: 'goblin.webp', cr: '1/4', type: 'humanoid', source: '5e SRD', hp: '7 (2d6)', stats: [8, 14, 10, 10, 8, 8], actions: [{ name: 'Scimitar', desc: '…' }] }),
  creature({ name: 'Wolf', statblock: true, cr: '1/4', type: 'beast', source: '5e SRD', hp: '11 (2d8 + 2)', stats: [12, 15, 12, 3, 12, 6] }),
  creature({ name: 'Bear', statblock: true, cr: 1, type: 'beast', source: '[[Monster Manual]] p.11', hp: 34, level: 'Creature 3' }),
  creature({ name: 'Dragon', statblock: true, cr: 10, type: 'dragon', source: '5e SRD', hp: '178 (17d12 + 68)', description: 'A very long description. '.repeat(10) }),
  creature({ name: 'Hag', statblock: true, cr: '5', type: 'fey', source: '5e SRD', hp: '82' }),
];

describe('discoverCreatureFields', () => {
  it('offers numeric scales and categories, the most common first', () => {
    expect(discoverCreatureFields(CREATURES)).toEqual([
      { field: 'cr', count: 5, kind: 'range', samples: ['1/4', '5', '10'] },
      { field: 'hp', count: 5, kind: 'range', samples: ['7', '34', '178'] },
      { field: 'source', count: 5, kind: 'options', samples: ['5e SRD', 'Monster Manual'] },
      { field: 'type', count: 5, kind: 'options', samples: ['beast', 'humanoid', 'dragon'] },
      { field: 'level', count: 1, kind: 'range', samples: ['3'] },
    ]);
  });

  it('does not mistake a number inside text for a rating', () => {
    const [source] = discoverCreatureFields([creature({ source: '5e SRD' }), creature({ source: '5e SRD' })]);
    expect(source?.kind).toBe('options');
  });

  it('leaves out free text with too many values', () => {
    const many = Array.from({ length: 61 }, (_, i) => creature({ name: `C${i}`, motto: `Motto number ${i} of many` }));
    expect(discoverCreatureFields(many).map((field) => field.field)).not.toContain('motto');
  });

  it('reads attack bonuses as a scale', () => {
    const [atk] = discoverCreatureFields([creature({ atk: '+2' }), creature({ atk: '-1' }), creature({ atk: 3 })]);
    expect(atk).toMatchObject({ field: 'atk', kind: 'range', samples: ['-1', '2', '3'] });
  });

  it('finds nothing without statblocks', () => {
    expect(discoverCreatureFields([])).toEqual([]);
  });
});
