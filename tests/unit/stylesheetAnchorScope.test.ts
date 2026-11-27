import { describe, expect, it } from 'vitest';
import path from 'node:path';
import postcss from 'postcss';
import { compiledStylesheet, pluginStylesheets, repoRoot } from '../helpers/pluginStylesheets';

/**
 * Chromium 130 (Electron 33, which Obsidian 1.15's installer brings) has no `anchor-scope`. There an anchor name that several
 * elements carry is the last one's in the page for every element placed by it: each overlay scrollbar was drawn at the Sound
 * page's last scroll area, under the moods pane. An element that needs an anchor of its own gets a name of its own
 * (`--atlas-scrollbar-anchor`, set per area by `OverlayScrollbar`), never a shared name scoped by `anchor-scope`.
 */
function anchorScopes(css: string): string[] {
  const found: string[] = [];
  postcss.parse(css).walkDecls('anchor-scope', (declaration) => {
    const rule = declaration.parent;
    found.push(`${rule?.type === 'rule' ? (rule as postcss.Rule).selector : '?'} { anchor-scope: ${declaration.value} }`);
  });
  return found;
}

describe('anchor-scope', { timeout: 30_000 }, () => {
  it('is found wherever it is declared', () => {
    expect(anchorScopes('.area { anchor-name: --a; anchor-scope: --a; }')).toEqual(['.area { anchor-scope: --a }']);
    expect(anchorScopes('.area { anchor-name: var(--own-anchor); }')).toEqual([]);
  });

  it('is declared in none of the stylesheets the plugin imports', () => {
    const problems = pluginStylesheets().files.flatMap((file) =>
      anchorScopes(compiledStylesheet(file)).map((problem) => `${path.relative(repoRoot, file)}: ${problem}`));
    expect(problems).toEqual([]);
  });
});
