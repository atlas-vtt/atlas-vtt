import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const script = resolve('scripts/declaration-tree.mjs');
const ENTRIES = ['grid', 'draw', 'rules', 'dice3d', 'diceDisplay'].map((entry) => `src/shared/${entry}`);

/** An emitted declaration tree: the entries, what they reach, a stale file and translations no entry's types name. */
function emitted(extra: Record<string, string> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'declaration-tree-'));
  const files: Record<string, string> = {
    ...Object.fromEntries(ENTRIES.map((entry) => [`${entry}.d.ts`, `export type { Cell } from '../app/grid/cell';\n`])),
    'src/app/grid/cell.d.ts': `/// <reference path="./ambient.d.ts" />\nexport * from './point';\nexport type Cell = import('../types/size').Size;\n`,
    'src/app/grid/ambient.d.ts': 'declare const AMBIENT: number;\n',
    'src/app/grid/point.d.ts': `import type { Object3D } from 'three';\nexport type Point = { at: Object3D };\n`,
    'src/app/types/size/index.d.ts': 'export type Size = number;\n',
    'src/app/stale.d.ts': 'export type Stale = 1;\n',
    'src/app/i18n/index.d.ts': `export type { MessageKey } from './types';\n`,
    'src/app/i18n/types.d.ts': 'export type MessageKey = string;\n',
    'src/app/i18n/locales/ru/dice.d.ts': 'export declare const dice: {};\n',
    ...extra,
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), text);
  }
  return dir;
}

const run = (args: string[]): { status: number | null; stderr: string } => {
  const result = spawnSync('node', [script, ...args], { encoding: 'utf8' });
  return { status: result.status, stderr: result.stderr };
};

describe('declaration-tree', () => {
  it("copies only what the entries' types reach: imports, export *, import() types and references", () => {
    const from = emitted();
    const to = join(from, 'out');
    expect(run([from, to, '--no-translations', ...ENTRIES]).status).toBe(0);
    for (const file of ['src/shared/grid.d.ts', 'src/app/grid/cell.d.ts', 'src/app/grid/ambient.d.ts', 'src/app/grid/point.d.ts', 'src/app/types/size/index.d.ts']) {
      expect(existsSync(join(to, file)), file).toBe(true);
    }
    expect(existsSync(join(to, 'src/app/i18n'))).toBe(false);
    expect(existsSync(join(to, 'src/app/stale.d.ts'))).toBe(false);
  });

  it('empties the target first, so a file the entries no longer reach goes', () => {
    const from = emitted();
    const to = join(from, 'out');
    mkdirSync(join(to, 'src'), { recursive: true });
    writeFileSync(join(to, 'src/old.d.ts'), 'export {};\n');
    expect(run([from, to, ...ENTRIES]).status).toBe(0);
    expect(existsSync(join(to, 'src/old.d.ts'))).toBe(false);
  });

  it("with --no-translations, fails when an entry's types reach Atlas's translations", () => {
    const from = emitted({ 'src/shared/rules.d.ts': `export type { MessageKey } from '../app/i18n';\n` });
    const result = run([from, join(from, 'out'), '--no-translations', ...ENTRIES]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("reach Atlas's translations");
  });

  it('fails for an entry that was not emitted', () => {
    const from = emitted();
    const result = run([from, join(from, 'out'), 'src/api/public']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('was not emitted');
  });
});
