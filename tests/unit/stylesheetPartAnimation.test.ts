import { describe, expect, it } from 'vitest';
import path from 'node:path';
import postcss from 'postcss';
import { compiledStylesheet, pluginStylesheets, repoRoot } from '../helpers/pluginStylesheets';

/**
 * An animation a document's `::part()` rule gives a shadow tree's element runs only where the engine finds the document's
 * `@keyframes` for it. Chromium 130 (Electron 33, which Obsidian 1.15's installer brings) does not, and the element is never
 * animated: the overlay scrollbar's thumbs stood still there while the list scrolled under them. A part's animation and its
 * keyframes go in the shadow root's own stylesheet.
 */
function partAnimations(css: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkRules((rule) => {
    if (!rule.selector.includes('::part(')) return;
    rule.walkDecls(/^animation(-name)?$/, (declaration) => {
      found.push(`${rule.selector} { ${declaration.prop}: ${declaration.value} }`);
    });
  });
  return found;
}

describe('animations of shadow parts', { timeout: 30_000 }, () => {
  it('are found in a ::part() rule, and not in a shadow root\'s own', () => {
    expect(partAnimations('.area::part(thumb) { animation: move 1s; }')).toEqual(['.area::part(thumb) { animation: move 1s }']);
    expect(partAnimations('.area::part(thumb) { animation-name: move; }')).toHaveLength(1);
    expect(partAnimations('[part~="thumb"] { animation: move 1s; } .area::part(thumb) { transition: opacity 1s; animation-timeline: --t; }')).toEqual([]);
  });

  it('come in no ::part() rule of the stylesheets the plugin imports', () => {
    const problems = pluginStylesheets().files.flatMap((file) =>
      partAnimations(compiledStylesheet(file)).map((problem) => `${path.relative(repoRoot, file)}: ${problem}`));
    expect(problems).toEqual([]);
  });
});
