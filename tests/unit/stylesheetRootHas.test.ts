// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as sass from 'sass';

const root = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = /\.tsx?$/;
const TEST_FILE = /(\.test\.|__tests__)/;
const STYLE_IMPORT = /import\s+'(\.[^']+\.scss)'/g;
/** `:has()` on the document's root or its body, whatever else that compound names. */
const ROOT_HAS = /(^|[\s>+~,(])(html|body|:root)(?![\w-])[^\s>+~,]*:has\(/;

function scripts(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return scripts(file);
    return SCRIPT.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

/** Every stylesheet the build compiles: the ones the plugin's code imports. */
function stylesheets(): string[] {
  const found = new Set<string>();
  for (const script of [path.join(root, 'main.ts'), ...scripts(path.join(root, 'src'))]) {
    for (const [, relative = ''] of fs.readFileSync(script, 'utf8').matchAll(STYLE_IMPORT)) {
      found.add(path.resolve(path.dirname(script), relative));
    }
  }
  return [...found];
}

function selectorsOf(file: string): string[] {
  const { css } = sass.compile(file, { logger: sass.Logger.silent });
  const selectors: string[] = [];
  postcss.parse(css).walkRules((rule) => { selectors.push(...rule.selectors); });
  return selectors;
}

/**
 * Chromium remembers on an element that a `:has()` rule was once matched against it, and on
 * everything that rule looked through that a change there may matter. On the body that is
 * the whole document, for the rest of the session: with any other stylesheet's `:has()` rule
 * that can match anything (Fantasy Statblocks ships one), every element put into or taken out
 * of the document then restyles all of it. Measured at 22 ms per insertion in a document of
 * 4,700 elements on Electron 44 and 305 ms on Electron 28.
 */
describe('the stylesheet Atlas adds to Obsidian', () => {
  it('looks at every stylesheet the plugin imports', () => {
    const files = stylesheets();
    expect(files.length).toBeGreaterThan(20);
    expect(files).toContain(path.join(root, 'styles/main.scss'));
  });

  it('never matches `:has()` on the document root or its body', () => {
    const offending = stylesheets().flatMap((file) => selectorsOf(file)
      .filter((selector) => ROOT_HAS.test(selector))
      .map((selector) => `${path.relative(root, file)}: ${selector}`));

    expect(offending).toEqual([]);
  });
});
