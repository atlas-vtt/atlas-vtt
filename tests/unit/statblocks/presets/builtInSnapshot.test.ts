/**
 * Built-ins change only forward. `builtInTemplates.snapshot.json` records each
 * revision of each built-in: its field keys and a hash of everything it shows
 * (name, labels, layout, tables, samples, source). Notes and roles name
 * built-ins and their keys, so a key may never go, and a copy remembers the
 * revision it was made from, so every change raises the revision. A change
 * therefore appends an entry with a higher revision; the test prints it.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeTemplate } from '../../../../src/app/statblocks/format/templateFormat';
import type { BuiltInTemplate } from '../../../../src/app/statblocks/model/templateTypes';
import { BUILT_IN_TEMPLATES } from '../../../../src/app/statblocks/presets';

interface SnapshotEntry {
  id: string;
  revision: number;
  keys: string[];
  layoutHash: string;
}

const SNAPSHOT_FILE = join(__dirname, 'builtInTemplates.snapshot.json');
const SNAPSHOT = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8')) as SnapshotEntry[];

function entryOf(builtIn: BuiltInTemplate): SnapshotEntry {
  const shown = `${builtIn.name}\n${serializeTemplate(builtIn.template)}`;
  return {
    id: builtIn.id,
    revision: builtIn.revision,
    keys: builtIn.template.fields.map((field) => field.key),
    layoutHash: createHash('sha256').update(shown).digest('hex').slice(0, 16),
  };
}

function historyOf(id: string): SnapshotEntry[] {
  return SNAPSHOT.filter((entry) => entry.id === id);
}

function appendHint(entry: SnapshotEntry): string {
  return `append to ${SNAPSHOT_FILE}:\n${JSON.stringify(entry)}`;
}

describe('the built-in snapshot', () => {
  it('records every built-in, and every built-in it records still exists', () => {
    const recorded = new Set(SNAPSHOT.map((entry) => entry.id));
    expect([...recorded].sort()).toEqual(BUILT_IN_TEMPLATES.map((builtIn) => builtIn.id).sort());
  });

  it('keeps each history forward: revisions rise, each changes the template, keys are only added', () => {
    for (const id of new Set(SNAPSHOT.map((entry) => entry.id))) {
      const history = historyOf(id);
      history.slice(1).forEach((next, index) => {
        const before = history[index] as SnapshotEntry;
        expect(next.revision, `${id} after revision ${before.revision}`).toBeGreaterThan(before.revision);
        expect(next.layoutHash, `${id} revision ${next.revision} changes nothing`).not.toBe(before.layoutHash);
        expect(before.keys.filter((key) => !next.keys.includes(key)), `${id} revision ${next.revision} drops keys`).toEqual([]);
      });
    }
  });

  it.each(BUILT_IN_TEMPLATES.map((builtIn) => [builtIn.id, builtIn] as const))('%s is its last recorded revision', (id, builtIn) => {
    const current = entryOf(builtIn);
    const last = historyOf(id).at(-1);
    if (!last) throw new Error(`${id} is not recorded; ${appendHint(current)}`);
    const dropped = last.keys.filter((key) => !current.keys.includes(key));
    expect(dropped, `${id} dropped keys; a built-in's keys are append-only`).toEqual([]);
    expect(current.revision, `${id} went back from revision ${last.revision}`).toBeGreaterThanOrEqual(last.revision);
    if (current.layoutHash !== last.layoutHash && current.revision === last.revision) {
      throw new Error(`${id} changed: raise its revision above ${last.revision}, then ${appendHint({ ...current, revision: last.revision + 1 })}`);
    }
    expect(current, appendHint(current)).toEqual(last);
  });
});
