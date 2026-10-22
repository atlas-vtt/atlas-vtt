import { describe, expect, it } from 'vitest';
import { parseTemplate } from '../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../src/app/statblocks/format/templateFormat';
import { renameFieldKey } from '../../../src/app/statblocks/model/fieldOps';
import { resourceOfField } from '../../../src/app/resources/trackedResources';
import type { StatblockTemplate } from '../../../src/app/statblocks/model/templateTypes';
import { ADVENTURER, BUTTONS, RESOURCES } from '../../fixtures/recoveryFixtures';

const RESTED: StatblockTemplate = { ...ADVENTURER, recovery: BUTTONS };

describe('recovery buttons in a template file', () => {
  it('are written and read back as they are, whatever order an edit gave their keys', () => {
    const read = parseTemplate(JSON.parse(serializeTemplate(RESTED)));
    expect(read.problems).toEqual([]);
    expect(read.template?.recovery).toEqual(BUTTONS);
    const shuffled = BUTTONS.map(({ rules, name, id }) => ({ rules, name, id }));
    expect(serializeTemplate({ ...ADVENTURER, recovery: shuffled })).toBe(serializeTemplate(RESTED));
  });

  it('leave out a button that cannot be read, and none at all is no key', () => {
    const file = JSON.parse(serializeTemplate(RESTED)) as Record<string, unknown>;
    const read = parseTemplate({ ...file, recovery: [{ id: 'broken' }, ...BUTTONS] });
    expect(read.template?.recovery).toEqual(BUTTONS);
    expect(parseTemplate({ ...file, recovery: [] }).template).not.toHaveProperty('recovery');
    expect(JSON.parse(serializeTemplate(ADVENTURER))).not.toHaveProperty('recovery');
  });

  it('follow a field renamed in the template: what a rule restores, spends and sets from', () => {
    const renamed = renameFieldKey(renameFieldKey(RESTED, 'hp', 'hit_points'), 'hit_dice', 'dice');
    const [short, long] = renamed.recovery!;
    expect(short!.rules[0]).toMatchObject({ target: { kind: 'resource', field: 'hit_points' }, from: { kind: 'counters', field: 'dice' } });
    expect(long!.rules.map((rule) => rule.target)).toEqual([
      { kind: 'resource', field: 'hit_points' },
      { kind: 'resource', field: 'stress' },
      { kind: 'counters', field: 'dice', rows: 'all' },
      { kind: 'condition', id: 'exhaustion' },
    ]);
  });
});

describe('the resource a rule names by its field', () => {
  it('is the collection\'s resource that counts and reads it, never a static one', () => {
    const resourceOf = resourceOfField(ADVENTURER, RESOURCES);
    expect(resourceOf('hp')?.key).toBe('hp');
    expect(resourceOf('stress')?.key).toBe('stress');
    expect(resourceOf('ac')).toBeUndefined();
    expect(resourceOf('speed')).toBeUndefined();
  });

  it('stays the collection\'s resource after the field is renamed, and a static one is found only when asked', () => {
    const renamed = renameFieldKey(ADVENTURER, 'hp', 'hit_points');
    expect(resourceOfField(renamed, RESOURCES)('hit_points')?.key).toBe('hp');
    expect(resourceOfField(ADVENTURER, RESOURCES, true)('ac')?.key).toBe('ac');
  });

  it('is the number the template tracks where no resource of the collection reads it, in any collection', () => {
    const tracked: StatblockTemplate = { ...ADVENTURER, fields: ADVENTURER.fields.map((field) => (field.key === 'con' ? { ...field, tracks: { counts: 'down' } } : field)) };
    expect(resourceOfField(tracked, RESOURCES)('con')?.name).toBe('CON modifier');
    expect(resourceOfField(tracked, [])('hp')).toBeUndefined();
  });
});
