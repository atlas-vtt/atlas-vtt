import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as sass from 'sass';

/**
 * WCAG 2.1 AA, 1.4.3: a row that takes the hover wash on a sidebar stands on the darkest ground Atlas sets quiet text
 * on. Faint text reaches 4.5:1 there only as dark as the muted ink (Medieval and Sci-fi light: 4.45 and 4.47:1, Obsidian's
 * default theme: 4.0 to 4.2:1), so such a row hands its faint text the muted ink while hovered.
 */

const MAIN = fileURLToPath(new URL('../../styles/main.scss', import.meta.url));
/** Rows that take the hover wash on a sidebar. */
const SIDEBAR_ROWS = ['atlas-loot-tree__row'];

/** The value each hovered sidebar row gives `--text-faint`, as `row: value`. */
function hoveredFaint(css: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkDecls('--text-faint', (declaration) => {
    const rule = declaration.parent;
    if (rule?.type !== 'rule') return;
    for (const selector of (rule as postcss.Rule).selectors) {
      const row = SIDEBAR_ROWS.find((name) => selector.endsWith(`.${name}:hover`));
      if (row) found.push(`${row}: ${declaration.value}`);
    }
  });
  return found;
}

describe('a hovered row on a sidebar', { timeout: 30_000 }, () => {
  it('is found with the faint ink its hover gives', () => {
    expect(hoveredFaint('.p .atlas-loot-tree__row:hover { --text-faint: var(--text-muted); }'))
      .toEqual(['atlas-loot-tree__row: var(--text-muted)']);
    expect(hoveredFaint('.p .atlas-loot-tree__row { --text-faint: red; }')).toEqual([]);
  });

  it('sets its faint text in the muted ink', () => {
    const css = sass.compile(MAIN, { logger: sass.Logger.silent }).css;
    expect(hoveredFaint(css)).toEqual(SIDEBAR_ROWS.map((row) => `${row}: var(--text-muted)`));
  });
});
