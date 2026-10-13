/**
 * Finds `:has()` rules in Atlas' stylesheet that Chromium would have to keep the whole document
 * in mind for. Once such a rule has been matched against an element, every element the rule
 * looked through counts as one that element's style may depend on, for the rest of the session.
 * On the body, or on anything Obsidian owns high up, that is the whole document: together with
 * rules other stylesheets ship (Obsidian's own `section:has(div.annotationContent)`, Fantasy
 * Statblocks' `:has(+ .rule-container) *`), every element put into or taken out of the document
 * then restyles all of it. Measured at 22 ms per insertion in a document of 4,700 elements on
 * Electron 44 and 305 ms on Electron 28.
 *
 * So `:has()` may stand only on an element Atlas makes: one that carries an `atlas-` class, or
 * that lies inside one. Every function is pure: callers read the files.
 */

const postcss = require('postcss');

/** The classes Obsidian 1.14.4 puts on the body, read from its `app.js`. */
const OBSIDIAN_BODY_CLASSES = [
  'auto-full-screen', 'emulate-mobile', 'hide-cursor', 'in-progress', 'is-floating-nav', 'is-focused', 'is-frameless',
  'is-fullscreen', 'is-grabbing', 'is-hidden-frameless', 'is-hidden-nav', 'is-maximized', 'is-mobile', 'is-phone',
  'is-popout-modal', 'is-popout-window', 'is-screenshotting', 'is-tablet', 'is-translucent', 'mod-linux', 'mod-macos',
  'mod-rtl', 'mod-system-rtl', 'mod-toolbar-open', 'mod-windows', 'obsidian-app', 'show-inline-title', 'show-ribbon',
  'show-view-header', 'sliding-windows', 'styled-scrollbars', 'theme-dark', 'theme-light',
];

/**
 * Rules on elements of Obsidian that are known and measured. The tab container of a note
 * preview is restyled alone when something changes inside it (`tests/gpu/documentRestyle.gpu.test.ts`).
 */
const MEASURED_SELECTORS = [
  '.workspace-tab-container:has(.workspace-tab-header[data-atlas-preview="true"]):not(:has(.workspace-tab-header:not([data-atlas-preview="true"])))',
];

const OWN_CLASS = /^atlas-/;
const ROOT_ELEMENT = /(^|[^\w.#-])(html|body)(?![\w-])|:root(?![\w-])/;
const normalized = (selector) => selector.replace(/\s+/g, '').replace(/["']/g, '');

/** Where the bracket opened at `start` closes; quoted text may hold brackets of its own. */
function closingIndex(text, start) {
  const pairs = { '(': ')', '[': ']' };
  const stack = [];
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') index++;
    else if (char === '"' || char === "'") {
      index = text.indexOf(char, index + 1);
      if (index < 0) return text.length - 1;
    } else if (pairs[char]) stack.push(pairs[char]);
    else if (char === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return index;
    }
  }
  return text.length - 1;
}

/** The compounds of a selector with the combinator that leads to each: `a > b.c ~ d` is a, > b.c, ~ d. */
function compoundsOf(selector) {
  const compounds = [];
  let combinator = '';
  let text = '';
  const close = () => {
    if (text) compounds.push({ text, combinator });
    text = '';
  };
  for (let index = 0; index < selector.length; index++) {
    const char = selector[index];
    if (char === '(' || char === '[') {
      const end = closingIndex(selector, index);
      text += selector.slice(index, end + 1);
      index = end;
    } else if (/[\s>+~]/.test(char)) {
      if (text) {
        close();
        combinator = ' ';
      }
      if (char.trim()) combinator = char;
    } else {
      text += char;
    }
  }
  close();
  return compounds;
}

/** A compound without what stands in brackets: `.a:not(.b)[c="d"]` is `.a:not()[]`. With `only`, just those functions are emptied. */
function withoutArguments(compound, only) {
  let result = '';
  for (let index = 0; index < compound.length; index++) {
    const char = compound[index];
    if (char !== '(' && char !== '[') {
      result += char;
      continue;
    }
    const end = closingIndex(compound, index);
    const emptied = char === '[' || !only || only.test(result);
    result += emptied ? `${char}${compound[end]}` : compound.slice(index, end + 1);
    index = end;
  }
  return result;
}

const classesOf = (compound) => [...withoutArguments(compound).matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);
const hasHas = (text) => text.includes(':has(');
/** Whether a compound names the document's root or its body, also inside `:is()`, `:where()` or `:not()`. */
const namesRoot = (compound) => ROOT_ELEMENT.test(withoutArguments(compound, /:has$/));

function selectorsOf(css) {
  const selectors = [];
  postcss.parse(css).walkRules((rule) => { selectors.push(...rule.selectors); });
  return selectors;
}

/** The classes a stylesheet itself writes on the root or the body, such as `body.atlas-hide-status-bar`. */
function rootClassesOf(selectors) {
  const classes = new Set(OBSIDIAN_BODY_CLASSES);
  for (const selector of selectors) {
    for (const { text } of compoundsOf(selector)) {
      if (namesRoot(text)) classesOf(text).forEach((name) => classes.add(name));
    }
  }
  return classes;
}

/** What is wrong with the `:has()` of one selector, or null. */
function selectorProblem(selector, rootClasses) {
  const compounds = compoundsOf(selector);
  const isOwn = ({ text }) => classesOf(text).some((name) => OWN_CLASS.test(name) && !rootClasses.has(name));
  for (let index = 0; index < compounds.length; index++) {
    const compound = compounds[index];
    if (!hasHas(compound.text)) continue;
    if (namesRoot(compound.text) || classesOf(compound.text).some((name) => rootClasses.has(name))) {
      return 'matches :has() on the document root or its body';
    }
    // Inside an element of Atlas: reached from it through descendant and child combinators only.
    let outermost = index;
    while (outermost > 0 && /^[ >]$/.test(compounds[outermost].combinator)) outermost--;
    if (!compounds.slice(outermost, index + 1).some(isOwn)) return 'matches :has() on an element that is not Atlas\' own';
  }
  return null;
}

/**
 * The `:has()` rules of `css` that stand on the document root, its body, or an element Atlas
 * does not make. `measured` are selectors let through because their cost is known.
 */
function rootHasProblems(css, measured = MEASURED_SELECTORS) {
  const selectors = selectorsOf(css);
  const rootClasses = rootClassesOf(selectors);
  const allowed = new Set(measured.map(normalized));
  const problems = [];
  for (const selector of selectors) {
    if (!hasHas(selector) || allowed.has(normalized(selector))) continue;
    const problem = selectorProblem(selector, rootClasses);
    if (problem) problems.push(`${problem}: ${selector}`);
  }
  return [...new Set(problems)];
}

module.exports = { MEASURED_SELECTORS, OBSIDIAN_BODY_CLASSES, compoundsOf, rootHasProblems };
