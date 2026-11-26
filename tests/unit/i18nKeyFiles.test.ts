import { describe, expect, it } from 'vitest';
import { en } from '../../src/app/i18n/locales/en';

/** Every file of the English texts but the index that joins them, by its path. */
const FILES = import.meta.glob<Record<string, unknown>>(['../../src/app/i18n/locales/en/*.ts', '!**/index.ts'], { eager: true });

const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1, -'.ts'.length);

/** The message keys a file of texts holds: the keys of every object it exports. */
function keysOf(module: Record<string, unknown>): string[] {
  return Object.values(module).flatMap((exported) => (typeof exported === 'object' && exported !== null ? Object.keys(exported) : []));
}

describe('the files of the English texts', () => {
  it('hold only keys that begin with their own name, so a key says which file it is in', () => {
    const misplaced = Object.entries(FILES).flatMap(([path, module]) => {
      const name = fileName(path);
      return keysOf(module).filter((key) => !key.startsWith(`${name}.`)).map((key) => `${name}.ts holds ${key}`);
    });
    expect(misplaced, "Move each key into the file its first segment names (`palette.moveTool` lives in locales/en/palette.ts), or rename it after the file it is in.").toEqual([]);
  });

  it('are all joined into the English texts, and the index adds only keys that begin with `index.`', () => {
    const inFiles = new Set(Object.values(FILES).flatMap(keysOf));
    expect([...inFiles].filter((key) => !(key in en)), 'A file of texts is not spread into locales/en/index.ts.').toEqual([]);
    const ofIndex = Object.keys(en).filter((key) => !inFiles.has(key));
    expect(ofIndex.filter((key) => !key.startsWith('index.')), 'locales/en/index.ts holds keys of its own that belong in the file their first segment names.').toEqual([]);
  });
});
