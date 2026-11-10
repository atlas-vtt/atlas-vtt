import type { LibraryTemplate, TemplateLookup } from '../../../../src/app/statblocks/model/resolvedTypes';
import type { BuiltInTemplate, StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { MARSH_CREATURE, MARSH_CREATURE_JSON } from '../../../fixtures/statblockTemplateFixtures';

export const MARSH_ID = 'marsh-creature-k7m2qa';
export const TEMPLATE_FOLDER = 'atlas-vtt/statblock-templates';
export const MARSH_PATH = `${TEMPLATE_FOLDER}/Marsh creature.atlastemplate`;

/** The Marsh creature's file text with top-level keys replaced. */
export function marshText(changes: Record<string, unknown> = {}): string {
  return `${JSON.stringify({ ...JSON.parse(MARSH_CREATURE_JSON) as Record<string, unknown>, ...changes }, null, 2)}\n`;
}

/** The Marsh creature with `hp` renamed from `hit_points`, then from `health`. */
export const RENAMED_HP: StatblockTemplate = {
  ...MARSH_CREATURE,
  fields: MARSH_CREATURE.fields.map((field): TemplateField => (field.key === 'hp' ? { ...field, formerKeys: ['hit_points', 'health'] } : field)),
};

export function libraryEntry(template: StatblockTemplate, name: string, status: 'ok' | 'newer' = 'ok'): LibraryTemplate {
  return { template, name, status, builtIn: false, path: `${TEMPLATE_FOLDER}/${name}.atlastemplate` };
}

/** A lookup over fixed entries, so resolver tests need no library. */
export function lookupOf(...entries: LibraryTemplate[]): TemplateLookup {
  const byId = new Map(entries.map((entry) => [entry.template.id, entry]));
  return { get: (id) => byId.get(id) ?? null };
}

export const BUILT_IN: BuiltInTemplate = {
  id: 'builtin:test-creature',
  name: 'Test creature',
  revision: 1,
  template: { ...MARSH_CREATURE, id: 'builtin:test-creature' },
};
