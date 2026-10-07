import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_VERSION } from '../../src/api/version';

const ROOT = 'api-report';
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]));
const report = files(ROOT).map((file) => ({ path: relative(ROOT, file).split(sep).join('/'), text: readFileSync(file, 'utf8') }));

describe('API report', () => {
  it('is a declaration tree whose entry is src/api/public.d.ts', () => {
    expect(report.every((file) => file.path.endsWith('.d.ts'))).toBe(true);
    expect(report.map((file) => file.path)).toContain('src/api/public.d.ts');
  });

  it('imports nothing outside the tree but obsidian, and none of Atlas\'s translations', () => {
    const packages = report.flatMap((file) => [...file.text.matchAll(/(?:from\s*|import\(\s*)['"]([^'"]+)['"]/g)].map((match) => match[1]!))
      .filter((source) => !source.startsWith('.'));
    expect(new Set(packages)).toEqual(new Set(['obsidian']));
    expect(report.some((file) => file.path.startsWith('src/app/i18n/'))).toBe(false);
  });

  it('carries the API version as a literal', () => {
    const version = report.find((file) => file.path === 'src/api/version.d.ts');
    expect(version?.text).toContain(`export declare const API_VERSION = "${API_VERSION}";`);
  });
});
