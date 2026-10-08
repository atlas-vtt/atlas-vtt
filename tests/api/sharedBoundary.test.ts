import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { setLocale, t as atlasT, type MessageKey } from '../../src/app/i18n';
import { SHARED_ENGLISH, t as englishT } from '../../src/shared/englishTexts';

const ENTRIES = ['grid', 'draw', 'rules', 'dice3d', 'diceDisplay'] as const;
/** The only packages an entry may import: dice3d renders with three; the rest, diceDisplay included, import relative modules only. */
const ALLOWED_PACKAGES: Record<(typeof ENTRIES)[number], readonly string[]> = { grid: [], draw: [], rules: [], dice3d: ['three'], diceDisplay: [] };
const IMPORT = /(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const EXTENSIONS = ['.ts', '.tsx', '/index.ts'];
/** The packages' build resolves Atlas's translation module to the English one (`vite.shared.config.mts`); so does this test. */
const I18N = resolve('src/app/i18n/index.ts');
const ENGLISH = resolve('src/shared/englishTexts.ts');

function isFile(path: string): boolean {
  return existsSync(path) && statSync(path).isFile();
}

function resolveLocal(from: string, spec: string, english: boolean): string | null {
  const base = resolve(dirname(from), spec);
  if (/\.(webp|png|svg)(\?.*)?$/.test(spec)) return null;
  for (const candidate of [base, ...EXTENSIONS.map((ext) => base + ext)]) if (isFile(candidate)) return english && resolve(candidate) === I18N ? ENGLISH : candidate;
  throw new Error(`Cannot resolve ${spec} from ${from}`);
}

const reached = new Map<string, { files: Set<string>; packages: Set<string> }>();

/** `walk`, once per entry and resolution: the walk reads every module, which is slow under a busy test run. */
function reach(entry: string, english = true): { files: Set<string>; packages: Set<string> } {
  const key = `${entry}:${english}`;
  const known = reached.get(key);
  if (known) return known;
  const result = walk(entry, english);
  reached.set(key, result);
  return result;
}

/**
 * Every module an entry reaches, and the packages they import: as the packages' build bundles them (`english`, the
 * default), or as `tsc -p tsconfig.packages.json` reads them for the declarations, which knows no such resolution.
 */
function walk(entry: string, english: boolean): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [resolve(`src/shared/${entry}.ts`)];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const spec = match[1] ?? match[2]!;
      if (spec.startsWith('.')) {
        const next = resolveLocal(file, spec, english);
        if (next) queue.push(next);
      } else {
        packages.add(spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]!);
      }
    }
  }
  return { files, packages };
}

// Each entry's walk reads a few hundred modules once; a busy full run can take longer than the default 5 seconds.
describe('shared modules package', { timeout: 30_000 }, () => {
  for (const entry of ENTRIES) {
    it(`${entry} imports only relative modules and its allowed packages`, () => {
      const { packages } = reach(entry);
      expect([...packages].filter((name) => !ALLOWED_PACKAGES[entry].includes(name))).toEqual([]);
    });
  }

  it('only dice3d reads the activeDocument and createEl globals', () => {
    for (const entry of ENTRIES.filter((name) => name !== 'dice3d')) {
      for (const file of reach(entry).files) {
        expect(readFileSync(file, 'utf8'), file).not.toMatch(/\b(activeDocument|createEl|activeWindow)\b/);
      }
    }
  });

  it("gives every text Atlas's modules there translate in English, and those modules take nothing but t from the translations", () => {
    const keys = new Set<string>();
    for (const entry of ENTRIES) {
      for (const file of reach(entry).files) {
        const text = readFileSync(file, 'utf8');
        for (const match of text.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) keys.add(match[1]!);
        for (const match of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+['"][./]*i18n['"]/g)) {
          expect(match[1]!.split(',').map((name) => name.trim()), file).toEqual(['t']);
        }
      }
    }
    expect([...keys].filter((key) => !(key in SHARED_ENGLISH))).toEqual([]);
    expect(keys.size).toBeGreaterThan(0);
  });

  it("reads each of those texts as Atlas's English does", () => {
    setLocale('en');
    for (const key of Object.keys(SHARED_ENGLISH)) expect(englishT(key), key).toBe(atlasT(key as MessageKey));
  });

  it('keeps the module closure small, so the package .d.ts stays small', () => {
    const all = new Set<string>();
    for (const entry of ENTRIES) for (const file of reach(entry, false).files) all.add(file);
    // About 170 of these are Atlas's translations (en and ru), which tsc reads through t(). The packages' JavaScript
    // carries only the English texts it uses (src/shared/englishTexts.ts), and their types only the declarations the
    // entries' types reach, none of them a translation (scripts/declaration-tree.mjs, tests/api/declarationTree.test.ts).
    expect(all.size).toBeLessThan(270);
  });
});
