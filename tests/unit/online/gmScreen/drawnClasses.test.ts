import { fileURLToPath } from 'node:url';
import * as sass from 'sass';
import { describe, expect, it } from 'vitest';
import { DRAWN_CLASSES, STATBLOCK_STYLE_CLASSES } from '../../../../src/app/online/gmScreen/statblocks/drawnClasses.ts';
import { DRAWN_CLASS_PATTERN } from '../../../../src/app/online/protocol/index.ts';

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

function selectedClasses(file: string): string[] {
  const { css } = sass.compile(`${root}${file}`, { logger: sass.Logger.silent, loadPaths: [`${root}styles`, `${root}src`] });
  const selectors = css.replace(/\{[^{}]*\}/g, '{}');
  return [...selectors.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(([, name = '']) => name);
}

// Compiles four stylesheets: a few seconds on a busy machine.
describe('the classes a drawn statblock keeps', { timeout: 60_000 }, () => {
  it('hold every class the statblock stylesheets select on, so the device draws a statblock as the DM screen does', () => {
    const selected = new Set(STATBLOCK_STYLESHEETS.flatMap(selectedClasses));
    selected.delete(SCOPE);
    const listed = new Set(STATBLOCK_STYLE_CLASSES);

    expect(selected.size).toBeGreaterThan(150);
    expect([...selected].filter((name) => !listed.has(name))).toEqual([]);
  });

  it('are class names the page reads, and never the scope of Atlas\'s whole interface', () => {
    expect([...DRAWN_CLASSES].filter((name) => !DRAWN_CLASS_PATTERN.test(name))).toEqual([]);
    expect(DRAWN_CLASSES.has(SCOPE)).toBe(false);
  });
});
