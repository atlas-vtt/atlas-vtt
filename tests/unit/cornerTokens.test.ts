import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Atlas has three corners (`styles/_tokens.scss`): a mark, a control and a surface, plus the pill.
 * A corner is a token or worked out from one, never a length of its own, and every surface that
 * publishes its corner for the controls inside it has the one surface radius.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const TOKENS = 'styles/_tokens.scss';
/** A radius declaration whose value names no token, variable or calculation of one. */
const RADIUS = /(?:^|[;{\s])(border(?:-[a-z]+)*-radius)\s*:\s*([^;\n]+)/g;
const KEYWORD = /^(?:0(?:px)?|[\d.]+%|inherit|initial|unset|none)(?:\s+!important)?$/;
const PANEL_RADIUS = /@include\s+atlas-panel-radius\(\s*([^,)]+)/g;

function stylesheets(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : stylesheets(file);
    return /\.scss$/.test(entry.name) ? [file] : [];
  });
}

function withoutComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function offenders(pattern: RegExp, accept: (value: string) => boolean): string[] {
  return ['src', 'styles'].flatMap((folder) => stylesheets(path.join(root, folder))).flatMap((file) => {
    const name = path.relative(root, file);
    if (name === TOKENS) return [];
    const text = withoutComments(fs.readFileSync(file, 'utf8'));
    return [...text.matchAll(pattern)].map((match) => match[match.length - 1].trim()).filter((value) => !accept(value)).map((value) => `${name}: ${value}`);
  });
}

describe('corners', () => {
  it('come from the corner tokens', () => {
    expect(offenders(RADIUS, (value) => KEYWORD.test(value) || /\$|var\(/.test(value))).toEqual([]);
  });

  it('are the surface radius on every surface whose corner its controls follow', () => {
    expect(offenders(PANEL_RADIUS, (value) => value === '$surface-radius')).toEqual([]);
  });
});
