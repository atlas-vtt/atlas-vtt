import { parse } from 'yaml';
import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import { int, mulberry32, pick, readAsObsidian, set } from './patchTestKit';

/** Any value written anywhere reads back exactly, for YAML 1.2 (Obsidian) and as strings for YAML 1.1 readers. */

const PIECES = [
  'a', 'Z', '7', '0', '.', '-', ' ', '  ', ':', ': ', '#', ' #', ',', '[', ']', '{', '}', '*', '&', '!', '|', '>', "'", '"', '%',
  '@', '`', '?', '~', '\\', '\n', '\r\n', '\r', '\t', 'ü', '🐉', ' ', '\u0085', ' ', '﻿', 'yes', 'null', 'true',
  '1e3', '0x1', '2024-01-01', '1:30', '---', '...', '- ', '[[Note]]', '<b>', '$', '=', '<<',
];

function randomString(random: () => number): string {
  return Array.from({ length: int(random, 7) }, () => pick(random, PIECES)).join('');
}

function randomValue(random: () => number, depth = 0): FieldValue {
  const roll = random();
  if (depth < 2 && roll < 0.15) return Array.from({ length: int(random, 4) }, () => randomValue(random, depth + 1));
  if (depth < 2 && roll < 0.3) {
    return Object.fromEntries(Array.from({ length: int(random, 3) }, () => [randomString(random) || 'k', randomValue(random, depth + 1)]));
  }
  if (roll < 0.4) return pick(random, [0, -1, 2.5, 1e21, 1e-7, 123456789, true, false, null]);
  return randomString(random);
}

const CONTEXTS = [
  { text: '---\nx: 1\n---\n', path: ['x'], base: 1 },
  { text: '---\nx: [1, 2, 3]\n---\n', path: ['x', 1], base: 2 },
  { text: '---\nx:\n  - 1\n  - 2\n---\n', path: ['x', 0], base: 1 },
  { text: '---\nx:\n    a: 1\n    b: 2\n---\n', path: ['x', 'b'], base: 2 },
  { text: '---\nx: {a: 1, b: 2}\n---\n', path: ['x', 'a'], base: 1 },
  { text: '---\nx:\n- name: A\n  desc: 1\n---\n', path: ['x', 0, 'desc'], base: 1 },
  { text: '---\r\nx: |\r\n  old\r\n---\r\n', path: ['x'], base: 'old\n' },
  { text: '---\nx: "1"\n---\n', path: ['x'], base: '1' },
  { text: "---\nx: '1'\n---\n", path: ['x'], base: '1' },
];

// Seeded checks with a fixed workload: 3 to 4.5 s on a hosted runner, close to the 5 s default.
describe('values', { timeout: 30_000 }, () => {
  it('writes every random value in every context so that it reads back exactly', () => {
    const random = mulberry32(77);
    for (let trial = 0; trial < 4000; trial++) {
      const context = pick(random, CONTEXTS);
      const next = randomValue(random);
      const result = applyFrontmatterPatches(context.text, [set(context.path, context.base, next)]);
      expect(result.conflicts, JSON.stringify(next)).toEqual([]);
      const expected = structuredCopy(readAsObsidian(context.text));
      assignAt(expected, context.path, next);
      expect(readAsObsidian(result.text), JSON.stringify(next)).toEqual(expected);
    }
  });

  it('works around yaml writing a wrong indentation indicator in 4-space notes', () => {
    const text = '---\nx:\n    a: 1\n    b: 2\n---\n';
    const result = applyFrontmatterPatches(text, [set(['x', 'b'], 2, "\n ~'")]);
    expect(readAsObsidian(result.text)).toEqual({ x: { a: 1, b: "\n ~'" } });
  });

  it('writes random keys that read back, quoting what needs it', () => {
    const random = mulberry32(78);
    for (let trial = 0; trial < 1500; trial++) {
      const key = randomString(random);
      if (key === '__proto__' || key === 'x') continue;
      const result = applyFrontmatterPatches('---\nx: 1\n---\n', [set([key], undefined, 'v'), { op: 'renameKey', from: 'x', to: `${key}2` }]);
      expect(result.conflicts, JSON.stringify(key)).toEqual([]);
      expect(readAsObsidian(result.text)).toEqual({ [key]: 'v', [`${key}2`]: 1 });
    }
  });

  it('writes no plain scalar a YAML 1.1 reader takes for another type', () => {
    for (const value of ['yes', 'No', 'on', 'OFF', 'y', 'n', '2024-01-01', '2001-12-14t21:59:43.10-05:00', '1:30', '1_000', '0b101', '0777', '.Inf']) {
      const result = applyFrontmatterPatches('---\nx: 1\n---\n', [set(['x'], 1, value)]);
      const yaml = result.text.split('\n').slice(1, -2).join('\n');
      expect(parse(yaml, { version: '1.1' })).toEqual({ x: value });
    }
  });
});

function structuredCopy(value: Record<string, FieldValue>): Record<string, FieldValue> {
  return JSON.parse(JSON.stringify(value)) as Record<string, FieldValue>;
}

function assignAt(target: Record<string, FieldValue>, path: readonly (string | number)[], value: FieldValue): void {
  let current: FieldValue = target;
  path.forEach((segment, index) => {
    const last = index === path.length - 1;
    if (Array.isArray(current) && typeof segment === 'number') {
      if (last) current[segment] = value;
      else current = current[segment] ?? null;
    } else if (current !== null && typeof current === 'object' && !Array.isArray(current) && typeof segment === 'string') {
      if (last) current[segment] = value;
      else current = current[segment] ?? null;
    }
  });
}
