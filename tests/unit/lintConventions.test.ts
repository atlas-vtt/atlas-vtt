import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { conventionConfigs, ruleId } from '../../scripts/eslint/atlasPlugin.mjs';
import { CONVENTIONS } from '../../scripts/eslint/conventions.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT_FILES = ['**/*.{ts,tsx}'];
/** Where an example is linted unless its convention names a file: in no convention's own scope. */
const ANYWHERE = 'src/app/example.ts';

// Without type information: the conventions are selectors over the syntax, and a parse is fast.
const linter = new Linter({ cwd: ROOT });
const config: Linter.Config[] = [{ files: SCRIPT_FILES, languageOptions: { parser: tseslint.parser } }, ...conventionConfigs(SCRIPT_FILES)];

function lint(code: string, filename: string): Linter.LintMessage[] {
  return linter.verify(code, config, { filename: join(ROOT, filename) });
}

const isPlainFile = (path: string): boolean => !/[*{]/.test(path);

const TRACKED = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\0').filter(Boolean);

/** The globs the conventions use: `**` over directories, `*` within a name, `{a,b}`. */
function globPattern(glob: string): RegExp {
  const source = glob
    .replace(/[.+?^$()|[\]\\]/g, '\\$&')
    .replace(/\{([^}]*)\}/g, (_braces, list: string) => `(${list.split(',').join('|')})`)
    .replace(/\*\*\/|\*\*|\*/g, (stars) => (stars === '**/' ? '(.*/)?' : stars === '**' ? '.*' : '[^/]*'));
  return new RegExp(`^${source}$`);
}

const pathsNamedIn = (text: string): string[] => text.match(/\bsrc\/[\w/.-]+\.tsx?\b/g) ?? [];

describe('the lint conventions', () => {
  it('have names of their own, in kebab-case', () => {
    const names = CONVENTIONS.map((convention) => convention.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-z]+(-[a-z0-9]+)*$/);
  });

  describe.each(CONVENTIONS)('atlas/$name', (convention) => {
    const filename = convention.filename ?? ANYWHERE;

    it('says what to do instead and why, with examples of both', () => {
      expect(convention.message.trim()).not.toBe('');
      expect(convention.why.trim()).not.toBe('');
      expect(convention.bad.length).toBeGreaterThan(0);
      expect(convention.good.length).toBeGreaterThan(0);
      expect(Boolean(convention.selectors?.length) !== Boolean(convention.create)).toBe(true);
    });

    it('names owners and helpers that exist', () => {
      const named = [...(convention.owners ?? []).filter(isPlainFile), ...pathsNamedIn(`${convention.message} ${convention.why}`)];
      for (const path of named) expect(existsSync(join(ROOT, path)), path).toBe(true);
    });

    it('reports its bad examples, and nothing else does', () => {
      for (const code of convention.bad) {
        const messages = lint(code, filename);
        expect(messages.length, code).toBeGreaterThan(0);
        for (const message of messages) {
          expect(message.ruleId, `${code}\n${message.message}`).toBe(ruleId(convention));
          expect(message.message).toContain(convention.message);
          expect(message.message).toContain(convention.why);
        }
      }
    });

    it('accepts its good examples', () => {
      for (const code of convention.good) expect(lint(code, filename), code).toEqual([]);
    });

    it('names in every glob a file the repository tracks, so a renamed folder cannot switch it off', () => {
      for (const glob of [...(convention.files ?? []), ...(convention.owners ?? []), ...(convention.ignores ?? [])]) {
        const pattern = globPattern(glob);
        expect(TRACKED.some((file) => pattern.test(file)), glob).toBe(true);
      }
    });

    it('leaves its owners and the files outside its scope alone', () => {
      const code = convention.bad[0] ?? '';
      const elsewhere = convention.files ? [filename.replace(/^.*(\.tsx?)$/, 'src/app/example$1')] : [];
      for (const path of [...(convention.owners ?? []).filter(isPlainFile), ...elsewhere]) expect(lint(code, path), path).toEqual([]);
    });
  });
});
