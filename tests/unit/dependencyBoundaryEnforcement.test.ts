import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';

let eslint: ESLint;
// The first typed lint loads the whole project; keep that work outside each assertion.
beforeAll(async () => {
  eslint = new ESLint();
  await eslint.lintText('export {};', { filePath: 'src/app/host/dom.ts' });
}, 60_000);

describe('shared source enforcement', () => {
  it.each(['fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'indexedDB', 'window.indexedDB', "globalThis['WebSocket']"])(
    'rejects access to %s', async expression => {
      const [result] = await eslint.lintText(`export const forbidden = ${expression};`, { filePath: 'src/app/host/dom.ts' });
      expect(result.messages.some(message => message.ruleId === 'no-restricted-globals')).toBe(true);
    },
  );

  it.each(['obsidian', 'node:fs', '../plugin/service', 'src/app/types'])(
    'rejects imports from %s', async specifier => {
      const [result] = await eslint.lintText(`import '${specifier}';`, { filePath: 'src/app/host/dom.ts' });
      expect(result.messages.some(message => message.ruleId === 'no-restricted-imports')).toBe(true);
    },
  );

  it('checks dependencies before Plugin CI builds what is released', () => {
    const source = readFileSync('.github/workflows/plugin-ci.yml', 'utf8');
    const build = source.indexOf('\n  build-plugin:');
    const check = source.indexOf('run: npm run check:boundaries');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(build);
    const needs = /^ {4}needs: \[(.*)\]$/m.exec(source.slice(build));
    expect(needs?.[1].split(',').map(job => job.trim())).toContain('static-checks');
    expect(source.indexOf('run: npm run build:ci', build)).toBeGreaterThan(build);
  });

  it('releases the build Plugin CI tested instead of building again', () => {
    const source = readFileSync('.github/workflows/plugin-release.yml', 'utf8');
    expect(source).not.toContain('npm run build:ci');
    expect(source).toContain('actions/workflows/plugin-ci.yml/runs');
  });
});
