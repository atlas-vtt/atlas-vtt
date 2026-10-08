// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

interface Compound { text: string; combinator: string }

interface RootHas {
  MEASURED_SELECTORS: readonly string[];
  OBSIDIAN_BODY_CLASSES: readonly string[];
  compoundsOf: (selector: string) => Compound[];
  rootHasProblems: (css: string, measured?: readonly string[]) => string[];
}

const { MEASURED_SELECTORS, OBSIDIAN_BODY_CLASSES, compoundsOf, rootHasProblems } =
  createRequire(import.meta.url)('../../scripts/root-has.js') as RootHas;

const root = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = /\.tsx?$/;
const TEST_FILE = /(\.test\.|__tests__)/;
/** A stylesheet named by a static or dynamic import, a re-export or a `require`. */
const STYLE_IMPORT = /(?:\bimport\b|\bfrom\b|\brequire\s*\()[\s(]*(['"])([^'"\n]+\.s?css)(?:\?[^'"\n]*)?\1/g;
/** Any statement that brings a stylesheet in, however it is written. */
const STYLE_STATEMENT = /\b(?:import|from|require)\b[^;\n]*?\.s?css\b[^;\n]*/g;

function scripts(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return scripts(file);
    return SCRIPT.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

interface Stylesheets { files: string[]; unread: string[] }

/** The stylesheets a script brings in, and its statements that bring one in where this test cannot follow them all. */
function stylesheetsOf(script: string, source: string): Stylesheets {
  const imports = [...source.matchAll(STYLE_IMPORT)];
  const relative = imports.filter(([, , specifier = '']) => specifier.startsWith('.'));
  const statements = source.match(STYLE_STATEMENT) ?? [];
  const unread = statements.length === relative.length ? [] : statements;
  return {
    files: relative.map(([, , specifier = '']) => path.resolve(path.dirname(script), specifier)),
    unread: unread.map((statement) => `${path.relative(root, script)}: ${statement.trim()}`),
  };
}

/** Every stylesheet the build compiles: the ones the plugin's code imports. */
function stylesheets(): Stylesheets {
  const perScript = [path.join(root, 'main.ts'), ...scripts(path.join(root, 'src'))]
    .map((script) => stylesheetsOf(script, fs.readFileSync(script, 'utf8')));
  return {
    files: [...new Set(perScript.flatMap(({ files }) => files))],
    unread: perScript.flatMap(({ unread }) => unread),
  };
}

const compiled = (file: string): string =>
  (file.endsWith('.scss') ? sass.compile(file, { logger: sass.Logger.silent }).css : fs.readFileSync(file, 'utf8'));

const rule = (selector: string): string => `${selector} { z-index: 1; }`;
const ARGUMENT = '.atlas-asset-manager-modal';
const onRoot = (selector: string): string => `matches :has() on the document root or its body: ${selector}`;
const notOwn = (selector: string): string => `matches :has() on an element that is not Atlas' own: ${selector}`;

/** What the guard is for is told in `scripts/root-has.js`; `npm run preflight` holds the built stylesheet to it. */
describe('`:has()` in the stylesheet Atlas adds to Obsidian', () => {
  describe('is refused', () => {
    it.each([
      `body:has(${ARGUMENT}) > .menu`,
      `html:has(${ARGUMENT}) .menu`,
      `:root:has(${ARGUMENT}) .menu`,
      `body.theme-dark:has(${ARGUMENT}) > .menu`,
      `body:not(.is-mobile, .is-phone):has(${ARGUMENT}) > .menu`,
      `:is(body):has(${ARGUMENT}) > .menu`,
      `:where(html, body):has(${ARGUMENT}) > .menu`,
      `.atlas-vtt-plugin body:has(${ARGUMENT})`,
    ])('on the document root or its body: %s', (selector) => {
      expect(rootHasProblems(rule(selector))).toEqual([onRoot(selector)]);
    });

    it.each(OBSIDIAN_BODY_CLASSES)('on a class Obsidian puts on the body: .%s', (name) => {
      const selector = `.${name}:has(${ARGUMENT}) > .menu`;
      expect(rootHasProblems(rule(selector))).toEqual([onRoot(selector)]);
      expect(rootHasProblems(rule(`.atlas-vtt-root.${name}:has(${ARGUMENT})`))).toHaveLength(1);
    });

    it('on a class the stylesheet itself writes on the body', () => {
      const selector = `.atlas-hide-status-bar:has(${ARGUMENT}) > .menu`;
      expect(rootHasProblems(`${rule('body.atlas-hide-status-bar .status-bar')} ${rule(selector)}`)).toEqual([onRoot(selector)]);
      expect(rootHasProblems(`${rule('body.atlas-hide-status-bar')} ${rule(`.atlas-hide-status-bar .workspace:has(${ARGUMENT})`)}`)).toHaveLength(1);
    });

    it.each([
      `:has(${ARGUMENT}) > .menu`,
      `*:has(${ARGUMENT}) > .menu`,
      `.workspace:has(${ARGUMENT})`,
      `.app-container:has(${ARGUMENT}) .menu`,
      `div:has(> ${ARGUMENT})`,
      `.workspace-leaf:not(:has(${ARGUMENT}))`,
      `:is(.theme-dark, .theme-light):has(${ARGUMENT}) > .menu`,
      `.atlas-vtt-plugin ~ .workspace:has(${ARGUMENT})`,
      `.atlas-vtt-plugin + div:has(${ARGUMENT})`,
      `.workspace-tab-container:has(.workspace-tab-header[data-other="true"])`,
    ])('on an element that is not Atlas\' own: %s', (selector) => {
      expect(rootHasProblems(rule(selector))).toEqual([notOwn(selector)]);
    });
  });

  describe('is let through', () => {
    it.each([
      `.atlas-widget-clock:has(.atlas-widget-btn) .atlas-clock-wedge`,
      `.atlas-sb-item:has(> .atlas-sb-rule) + .atlas-sb-item`,
      `.atlas-overlay-scroll:has(> [data-scrolling]) > .atlas-overlay-scroll__thumb`,
      `.atlas-vtt-plugin .workspace-tab-container:has(.workspace-tab-header)`,
      `.atlas-vtt-plugin > div.is-active:not(:has(input:disabled))`,
      `.atlas-card.is-active:has(input[name="body"])`,
      `body.theme-dark .atlas-card:has(input)`,
      `.atlas-card:hover`,
    ])('on an element of Atlas or inside one: %s', (selector) => {
      expect(rootHasProblems(rule(selector))).toEqual([]);
    });

    it('where the selector is one whose cost is measured, and only that selector', () => {
      expect(MEASURED_SELECTORS).toHaveLength(1);
      for (const selector of MEASURED_SELECTORS) {
        expect(rootHasProblems(rule(selector))).toEqual([]);
        expect(rootHasProblems(rule(selector), [])).toHaveLength(1);
        expect(rootHasProblems(rule(`${selector} *`))).toHaveLength(1);
      }
    });
  });

  it('reads a selector as its compounds and the combinators between them', () => {
    expect(compoundsOf('a>b.c:not(.d > .e) ~ [f="g h"]  +i')).toEqual([
      { text: 'a', combinator: '' },
      { text: 'b.c:not(.d > .e)', combinator: '>' },
      { text: '[f="g h"]', combinator: '~' },
      { text: 'i', combinator: '+' },
    ]);
  });

  describe('in the stylesheets the plugin imports', () => {
    const { files, unread } = stylesheets();

    it('finds them all: no stylesheet is brought in in a way this test cannot follow', () => {
      expect(unread).toEqual([]);
      expect(files.length).toBeGreaterThan(20);
      expect(files).toContain(path.join(root, 'styles/main.scss'));
      expect(files).toContain(path.join(root, 'styles/index.css'));
    });

    it('follows every way of writing an import, and names the ones it cannot', () => {
      const script = path.join(root, 'src/app/example.ts');
      const read = (source: string): Stylesheets => stylesheetsOf(script, source);
      const sheet = path.join(root, 'src/app/sheet.scss');
      expect(read("import './sheet.scss';").files).toEqual([sheet]);
      expect(read('import "./sheet.scss";').files).toEqual([sheet]);
      expect(read("import css from './sheet.scss?inline';").files).toEqual([sheet]);
      expect(read("const css = await import('./sheet.scss');").files).toEqual([sheet]);
      expect(read("export { default } from './sheet.scss';").files).toEqual([sheet]);
      expect(read("require('./sheet.scss');").files).toEqual([sheet]);
      expect(read("import '@/styles/sheet.scss';").unread).toEqual(["src/app/example.ts: import '@/styles/sheet.scss'"]);
      expect(read('import(`./${name}.scss`);').unread).toHaveLength(1);
      expect(read("import './sheet.scss'; import(`./${name}.css`);").unread).toHaveLength(2);
    });

    it('stands only on elements of Atlas', () => {
      const problems = files.flatMap((file) => rootHasProblems(compiled(file)).map((problem) => `${path.relative(root, file)} ${problem}`));
      expect(problems).toEqual([]);
    });

    it('still holds the rule whose cost is measured', () => {
      const css = compiled(path.join(root, 'styles/main.scss'));
      const unquoted = (text: string): string => text.replace(/["']/g, '');
      expect(rootHasProblems(css, []).map(unquoted)).toEqual(MEASURED_SELECTORS.map((selector) => unquoted(notOwn(selector))));
    });
  });
});
