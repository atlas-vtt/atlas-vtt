import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SRC = join(ROOT, 'src');
const I18N = join(SRC, 'app/i18n');
const WORKER_IMPORT = /from\s+['"](\.[^'"]+)\?worker&inline['"]/g;
const VALUE_IMPORT = /^(?:import|export)\s+(?!type\b)[^;]*?from\s+['"](\.[^'"?]+)['"]/gm;

function sourceFiles(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function resolveModule(from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')].find((path) => existsSync(path) && /\.tsx?$/.test(path)) ?? null;
}

/** The chain of value imports from `entry` to the first module under `src/app/i18n`, or null. */
function pathToTexts(entry: string): string[] | null {
  const seen = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  for (let file = queue.shift(); file; file = queue.shift()) {
    if (file.startsWith(I18N)) {
      const chain: string[] = [];
      for (let at: string | null | undefined = file; at; at = seen.get(at)) chain.unshift(relative(ROOT, at));
      return chain;
    }
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(VALUE_IMPORT)) {
      const next = specifier ? resolveModule(file, specifier) : null;
      if (next && !seen.has(next)) {
        seen.set(next, file);
        queue.push(next);
      }
    }
  }
  return null;
}

const workers = sourceFiles(SRC).flatMap((file) =>
  [...readFileSync(file, 'utf8').matchAll(WORKER_IMPORT)].map(([, specifier]) => resolveModule(file, specifier ?? '')),
).filter((file): file is string => file !== null);

// A worker never gets the language (`setLocale`), so a text in it would be English, and every
// import of `t` carries the English texts (some 300 KB) into the worker's code and start.
describe('inline workers', () => {
  it('are found', () => {
    expect(workers.length).toBeGreaterThan(5);
  });

  it.each(workers.map((file) => [relative(ROOT, file), file]))('%s imports no texts', (_name, file) => {
    expect(pathToTexts(file)).toBeNull();
  });
});
