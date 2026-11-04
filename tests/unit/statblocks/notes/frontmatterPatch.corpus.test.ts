import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { parseDocument } from 'yaml';
import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { cacheFrontmatter, frontmatterBounds } from '../../../../src/app/statblocks/notes/frontmatterBounds';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import type { NotePatch } from '../../../../src/app/statblocks/notes/patchTypes';
import { bodyOf, expectUntouchedLinesKept, int, mulberry32, pick, readAsObsidian } from './patchTestKit';

/**
 * The S1 exit criterion on real vaults. Runs only when ATLAS_YAML_CORPUS lists directories
 * (colon-separated); every `.md` file below them, and every `.md` entry of a `.zip` there, is
 * read (never written) and patched in memory:
 *
 *   ATLAS_YAML_CORPUS=~/Documents/Dolmenwood:~/Github/atlas-vtt-cairn npx vitest run --project unit corpus
 */

const ROOTS = (process.env.ATLAS_YAML_CORPUS ?? '').split(':').filter((root) => root.length > 0);
const SCENARIOS_PER_NOTE = 8;
const NEXT_VALUES: FieldValue[] = ['Edited', 'yes', '2024-05-01', 'a: b', 42, true, null, ['x', 'y'], 'two\nlines', 'z'.repeat(120)];

interface Note { path: string; text: string }
type Model = Record<string, FieldValue>;
interface Scenario { patch: NotePatch; model: Model; touches: string[] }

describe.skipIf(ROOTS.length === 0)('frontmatter patcher on a real corpus', () => {
  it('reads back what was written, keeps bodies and untouched lines, and never writes into broken YAML', async () => {
    const notes = await collectNotes(ROOTS);
    const counts = { files: notes.length, withFrontmatter: 0, refused: 0, patches: 0, applied: 0, failures: 0 };
    const failures: string[] = [];
    for (const note of notes) {
      if (frontmatterBounds(note.text).exists) counts.withFrontmatter++;
      const readable = obsidianReads(note.text);
      const random = mulberry32(hash(note.path));
      for (let trial = 0; trial < SCENARIOS_PER_NOTE; trial++) {
        const model = readable ? readAsObsidian(note.text) : {};
        const scenario = randomScenario(random, model);
        counts.patches++;
        const result = applyFrontmatterPatches(note.text, [scenario.patch]);
        try {
          if (!readable) {
            expect(result).toEqual({ text: note.text, applied: [], conflicts: [scenario.patch] });
            counts.refused++;
            continue;
          }
          expect(result.conflicts).toEqual([]);
          counts.applied++;
          expect(readAsObsidian(result.text)).toEqual(scenario.model);
          expect(bodyOf(result.text)).toBe(frontmatterBounds(note.text).exists ? bodyOf(note.text) : note.text.replace(/^﻿/, ''));
          expectUntouchedLinesKept(note.text, result.text, new Set(scenario.touches));
        } catch (error) {
          counts.failures++;
          failures.push(`${note.path} ${JSON.stringify(scenario.patch)}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
        }
      }
    }
    console.info(`frontmatter corpus: ${JSON.stringify(counts)}`);
    expect(failures).toEqual([]);
  }, 600_000);
});

/** Whether Obsidian's two readers agree and the YAML parses into a map without errors or duplicate keys. */
function obsidianReads(text: string): boolean {
  const bounds = frontmatterBounds(text);
  const cached = cacheFrontmatter(text);
  if (!bounds.exists) return cached === null;
  if (cached !== text.slice(bounds.from, bounds.to).replace(/\r\n/g, '\n').replace(/\n$/, '')) return false;
  const doc = parseDocument(cached);
  if (doc.errors.length > 0) return false;
  const contents = doc.contents;
  return contents === null || (typeof doc.toJS() === 'object' && !Array.isArray(doc.toJS()));
}

function randomScenario(random: () => number, model: Model): Scenario {
  const keys = Object.keys(model);
  const scalars = keys.filter((key) => !isCollection(model[key]));
  const lists = keys.filter((key) => Array.isArray(model[key]) && (model[key] as FieldValue[]).length > 0);
  const kind = keys.length === 0 ? 'add' : pick(random, ['setScalar', 'add', 'delete', 'listItem', 'rename']);
  if (kind === 'setScalar' && scalars.length > 0) {
    const key = pick(random, scalars);
    const next = pick(random, NEXT_VALUES.filter((value) => JSON.stringify(value) !== JSON.stringify(model[key])));
    return { patch: { op: 'set', path: [key], base: model[key], next }, model: { ...model, [key]: next }, touches: [key] };
  }
  if (kind === 'delete') {
    const key = pick(random, keys);
    const rest = { ...model };
    delete rest[key];
    return { patch: { op: 'delete', path: [key], base: model[key] ?? null }, model: rest, touches: [key] };
  }
  if (kind === 'listItem' && lists.length > 0) return listScenario(random, model, pick(random, lists));
  if (kind === 'rename') {
    const from = pick(random, keys);
    const to = `${from} renamed`;
    if (to in model) return addScenario(random, model);
    const rest: Model = { ...model, [to]: model[from] ?? null };
    delete rest[from];
    return { patch: { op: 'renameKey', from, to }, model: rest, touches: [from, to] };
  }
  return addScenario(random, model);
}

function addScenario(random: () => number, model: Model): Scenario {
  const key = `atlas-corpus-${int(random, 1e6)}`;
  const next = pick(random, NEXT_VALUES);
  return { patch: { op: 'set', path: [key], base: undefined, next }, model: { ...model, [key]: next }, touches: [key] };
}

/** Edits, inserts, removes or moves an item of a top-level list. */
function listScenario(random: () => number, model: Model, key: string): Scenario {
  const items = model[key] as FieldValue[];
  const index = int(random, items.length);
  const item = items[index] ?? null;
  const distinct = new Set(items.map((value) => JSON.stringify(value))).size === items.length;
  const choice = pick(random, ['edit', 'insert', 'remove', 'move']);
  if (choice === 'edit' || !distinct) {
    const leaf = typeof item === 'object' && item !== null && !Array.isArray(item)
      ? Object.keys(item).find((name) => typeof item[name] === 'string')
      : undefined;
    if (leaf !== undefined && typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const next = `${String(item[leaf])} (edited)`;
      const list = items.map((value, i) => (i === index ? { ...item, [leaf]: next } : value));
      const unique = items.filter((value) => typeof value === 'object' && value !== null && !Array.isArray(value) && value[leaf] === item[leaf]).length === 1;
      if (unique) return { patch: { op: 'set', path: [key, index, leaf], base: item[leaf] ?? null, next }, model: { ...model, [key]: list }, touches: [key] };
    }
    const list = items.map((value, i) => (i === index ? 'edited item' : value));
    return { patch: { op: 'set', path: [key, index], base: item, next: 'edited item' }, model: { ...model, [key]: list }, touches: [key] };
  }
  const fresh = `corpus item ${int(random, 1e6)}`;
  if (choice === 'insert') {
    const list = [...items.slice(0, index + 1), fresh, ...items.slice(index + 1)];
    return { patch: { op: 'insert', list: key, after: item, item: fresh }, model: { ...model, [key]: list }, touches: [key] };
  }
  const rest = items.filter((_, i) => i !== index);
  if (choice === 'remove') return { patch: { op: 'remove', list: key, item }, model: { ...model, [key]: rest }, touches: [key] };
  return { patch: { op: 'move', list: key, item, after: null }, model: { ...model, [key]: [item, ...rest] }, touches: [key] };
}

function isCollection(value: FieldValue | undefined): boolean {
  return typeof value === 'object' && value !== null;
}

async function collectNotes(roots: readonly string[]): Promise<Note[]> {
  const notes: Note[] = [];
  const walk = async (path: string): Promise<void> => {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) if (!name.startsWith('.')) await walk(join(path, name));
    } else if (path.endsWith('.md')) {
      notes.push({ path, text: readFileSync(path, 'utf8') });
    } else if (path.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(readFileSync(path));
      for (const entry of Object.values(zip.files).filter((file) => !file.dir && file.name.endsWith('.md'))) {
        notes.push({ path: `${path}!${entry.name}`, text: await entry.async('string') });
      }
    }
  };
  for (const root of roots) await walk(root);
  return notes;
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return value >>> 0;
}
