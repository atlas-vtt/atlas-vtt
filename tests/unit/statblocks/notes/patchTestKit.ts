import { parse, parseDocument, isMap, isScalar } from 'yaml';
import { cacheFrontmatter, frontmatterBounds } from '../../../../src/app/statblocks/notes/frontmatterBounds';
import { applyFrontmatterPatches } from '../../../../src/app/statblocks/notes/frontmatterPatch';
import type { FieldValue } from '../../../../src/app/statblocks/model/templateTypes';
import type { FieldPath, NotePatch, PatchResult } from '../../../../src/app/statblocks/notes/patchTypes';

export function set(path: FieldPath, base: FieldValue | undefined, next: FieldValue): NotePatch {
  return { op: 'set', path, base, next };
}

/** A seeded PRNG, so every random case can be replayed from its seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

export function int(random: () => number, below: number): number {
  return Math.floor(random() * below);
}

/** The frontmatter as Obsidian's metadata cache reads it (`{}` for none). */
export function readAsObsidian(text: string): Record<string, FieldValue> {
  const yaml = cacheFrontmatter(text);
  if (yaml === null) return {};
  const value: unknown = parse(yaml);
  if (value === null || value === undefined) return {};
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('frontmatter is not a map');
  return value as Record<string, FieldValue>;
}

export function bodyOf(text: string): string {
  return text.slice(frontmatterBounds(text).contentStart);
}

/** Applies patches and checks the invariants every result must keep. */
export function patched(text: string, patches: readonly NotePatch[]): PatchResult {
  const result = applyFrontmatterPatches(text, patches);
  expect(result.applied.length + result.conflicts.length).toBe(patches.length);
  if (result.text !== text) {
    expect(bodyOf(result.text)).toBe(frontmatterBounds(text).exists ? bodyOf(text) : text.replace(/^﻿/, ''));
    expect(result.text.startsWith('﻿')).toBe(text.startsWith('﻿'));
  }
  return result;
}

/**
 * The frontmatter cut into top-level entries (from a key's line to the end of its value's last
 * line) and the gaps between them (comments, blank lines), adjacent gaps merged.
 */
export function segments(yaml: string): Array<{ key: string | null; text: string }> {
  const doc = parseDocument(yaml, { keepSourceTokens: true });
  const parts: Array<{ key: string | null; text: string }> = [];
  let at = 0;
  const pushGap = (to: number): void => {
    if (to <= at) return;
    const last = parts[parts.length - 1];
    if (last && last.key === null) last.text += yaml.slice(at, to);
    else parts.push({ key: null, text: yaml.slice(at, to) });
  };
  if (isMap(doc.contents)) {
    for (const pair of doc.contents.items) {
      if (!isScalar(pair.key) || !pair.key.range) continue;
      const start = yaml.lastIndexOf('\n', pair.key.range[0] - 1) + 1;
      const value = pair.value as { range?: [number, number, number] } | null;
      const valueEnd = value?.range?.[1] ?? pair.key.range[1];
      const end = valueEnd > 0 && yaml.charAt(valueEnd - 1) === '\n'
        ? valueEnd
        : (yaml.indexOf('\n', valueEnd) + 1 || yaml.length);
      pushGap(start);
      parts.push({ key: String(pair.key.value), text: yaml.slice(start, end) });
      at = end;
    }
  }
  pushGap(yaml.length);
  return parts;
}

/** Every top-level entry not in `touched`, and every gap, is byte-identical between the two texts. */
export function expectUntouchedLinesKept(before: string, after: string, touched: ReadonlySet<string>): void {
  const yamlOf = (text: string): string => {
    const bounds = frontmatterBounds(text);
    return bounds.exists ? text.slice(bounds.from, bounds.to) : '';
  };
  const kept = (text: string): Array<{ key: string | null; text: string }> => {
    const merged: Array<{ key: string | null; text: string }> = [];
    for (const part of segments(yamlOf(text))) {
      if (part.key !== null && touched.has(part.key)) continue;
      const last = merged[merged.length - 1];
      if (part.key === null && last && last.key === null) last.text += part.text;
      else merged.push({ ...part });
    }
    return merged;
  };
  expect(kept(after)).toEqual(kept(before));
}
