import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';
import { DRAWN_CLASSES, parseDrawnNodes, STATBLOCK_STYLE_CLASSES } from '../../../../src/app/online/protocol/index.ts';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
/** The stylesheets a statblock is drawn with: the Fantasy Statblocks renderer's, the native card's, a linked card's, a token portrait's. */
const STATBLOCK_STYLESHEETS = [
  'src/app/react/components/statblock/statblock.scss',
  'src/app/statblocks/render/statblock-sheet.scss',
  'src/app/statblocks/render/linked-statblock.scss',
  'src/app/packages/components/shared/token-portrait.scss',
];
/** The scope every Atlas stylesheet stands in; the device's page gives it, a drawn element never carries it. */
const SCOPE = 'atlas-vtt-plugin';
const CLASS = /\.(-?[_a-zA-Z][\w-]*)/g;

const compiled = (file: string): string => sass.compile(`${root}${file}`, { logger: sass.Logger.silent, loadPaths: [`${root}styles`, `${root}src`] }).css;

function selectedClasses(css: string): string[] {
  const selectors = css.replace(/\{[^{}]*\}/g, '{}');
  return [...selectors.matchAll(CLASS)].map(([, name = '']) => name);
}

// Compiles four stylesheets: a few seconds on a busy machine.
describe('the classes a drawn statblock keeps', { timeout: 60_000 }, () => {
  const sheets = STATBLOCK_STYLESHEETS.map(compiled);

  it('hold every class the statblock stylesheets select on, so the device draws a statblock as the DM screen does', () => {
    const selected = new Set(sheets.flatMap(selectedClasses));
    selected.delete(SCOPE);
    const listed = new Set(STATBLOCK_STYLE_CLASSES);

    expect(selected.size).toBeGreaterThan(150);
    expect([...selected].filter((name) => !listed.has(name))).toEqual([]);
  });

  it('are the only classes the device\'s parser keeps, and never the scope of Atlas\'s whole interface', () => {
    const nodes = parseDrawnNodes([{ e: 'div', c: ['atlas-sb-item', 'atlas-sidekick-tab', 'modal-container', SCOPE, 'atlas-token-ring', 'Evil_1'] }]);
    expect(nodes).toEqual([{ e: 'div', c: ['atlas-sb-item', 'atlas-token-ring'] }]);
    expect(parseDrawnNodes([{ e: 'p', c: [...DRAWN_CLASSES].slice(0, 16) }])?.[0]).toEqual({ e: 'p', c: [...DRAWN_CLASSES].slice(0, 16) });
    expect(DRAWN_CLASSES.has(SCOPE)).toBe(false);
  });

  it('get no rule that loads a file, but the token ring\'s one fixed image', () => {
    const loading = sheets.flatMap((css) => [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)])
      .filter(([, selector = '', body = '']) => /url\(/i.test(body) && [...selector.matchAll(CLASS)].some(([, name = '']) => DRAWN_CLASSES.has(name)))
      .map(([, selector = '', body = '']) => [selector.trim(), body.match(/[\w-]+\s*:\s*url\([^)]*\)/gi)]);
    expect(loading).toEqual([['.atlas-token-ring', ["--atlas-token-ring-image: url('../../../assets/token-ring-small.webp')"]]]);
  });
});
