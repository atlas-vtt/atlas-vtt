/**
 * Brings a template of an older format up to `TEMPLATE_VERSION`, in memory.
 * Pure and idempotent; the migrated form is written only with the next edit,
 * never on read. A template that needs nothing comes back as the same object.
 */

import { TEMPLATE_VERSION, type StatblockTemplate } from '../model/templateTypes';

/** Reads a template of the version it is keyed by and returns it in the next version. */
export type MigrationStep = (template: StatblockTemplate) => StatblockTemplate;

/** Format 1 is the first, so no step exists yet; a version bump adds one keyed by the version it reads. */
const STEPS: ReadonlyMap<number, MigrationStep> = new Map();

export function migrateTemplate(template: StatblockTemplate): StatblockTemplate {
  return runMigrations(template, STEPS, TEMPLATE_VERSION);
}

/**
 * Applies `steps` from the template's version up to `target`. It stops where
 * a step is missing or does not move the version on, and returns a template
 * already at or past `target` (a newer one is read-only) untouched.
 */
export function runMigrations(
  template: StatblockTemplate,
  steps: ReadonlyMap<number, MigrationStep>,
  target: number,
): StatblockTemplate {
  let current = template;
  while (current.version < target) {
    const step = steps.get(current.version);
    if (!step) return current;
    const next = step(current);
    if (next.version <= current.version) return current;
    current = next;
  }
  return current;
}
