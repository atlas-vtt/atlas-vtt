import { describe, expect, it } from 'vitest';
import { migrateTemplate, runMigrations, type MigrationStep } from '../../../../src/app/statblocks/format/migrateTemplate';
import { parseTemplate } from '../../../../src/app/statblocks/format/parseTemplate';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import { TEMPLATE_VERSION, type StatblockTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { EVERY_BLOCK, FIVE_E_2024, MARSH_CREATURE, MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';
import { fileOf, mulberry32, mutated } from './templateMutations';

describe('migrateTemplate', () => {
  it.each([
    ['Marsh creature', MARSH_CREATURE],
    ['5E 2024', FIVE_E_2024],
    ['every block', EVERY_BLOCK],
  ])('returns a current template (%s) as the same object', (_name, template) => {
    expect(migrateTemplate(template)).toBe(template);
  });

  it('leaves a newer template untouched', () => {
    const newer = { ...MARSH_CREATURE, version: TEMPLATE_VERSION + 1 };
    expect(migrateTemplate(newer)).toBe(newer);
  });

  it('is idempotent on mutated templates, writing nothing new', () => {
    const random = mulberry32(0x316);
    const file = fileOf(MARSH_CREATURE_JSON);
    for (let run = 0; run < 200; run += 1) {
      const { template } = parseTemplate(mutated(random, file));
      if (template === null) continue;
      const once = migrateTemplate(template);
      expect(migrateTemplate(once)).toBe(once);
      expect(serializeTemplate(once)).toBe(serializeTemplate(template));
    }
  });
});

describe('runMigrations', () => {
  const addDescription: MigrationStep = (template) => ({ ...template, version: 2, description: 'from 1' });
  const renameSuits: MigrationStep = (template) => ({ ...template, version: 3, suits: ['monster'] });
  const steps = new Map([[1, addDescription], [2, renameSuits]]);
  const v1: StatblockTemplate = { ...MARSH_CREATURE, description: undefined, suits: undefined } as unknown as StatblockTemplate;

  it('applies every step from the template\'s version up to the target, in order', () => {
    expect(runMigrations(v1, steps, 3)).toMatchObject({ version: 3, description: 'from 1', suits: ['monster'] });
    expect(runMigrations(v1, steps, 2)).toMatchObject({ version: 2, description: 'from 1' });
  });

  it('is idempotent: a migrated template comes back as the same object', () => {
    const migrated = runMigrations(v1, steps, 3);
    expect(runMigrations(migrated, steps, 3)).toBe(migrated);
  });

  it('never changes its input', () => {
    const before = JSON.stringify(v1);
    runMigrations(v1, steps, 3);
    expect(JSON.stringify(v1)).toBe(before);
  });

  it('stops where a step is missing or does not move the version on', () => {
    expect(runMigrations(v1, new Map([[2, renameSuits]]), 3)).toBe(v1);
    const stuck: MigrationStep = (template) => ({ ...template, description: 'stuck' });
    expect(runMigrations(v1, new Map([[1, stuck]]), 3)).toBe(v1);
  });
});
