/**
 * The conventions tables as an ESLint plugin: one rule per convention, so a convention can be
 * scoped, suppressed and counted by its own name, and no config block has to repeat another's
 * selectors. The code's conventions (`conventions.mjs`) and the tests' (`testConventions.mjs`)
 * are rules of the one plugin; a config switches on the table it names.
 */
import { CONVENTIONS } from './conventions.mjs';
import { TEST_CONVENTIONS } from './testConventions.mjs';

/** @typedef {import('./conventions.mjs').Convention} Convention */

const PLUGIN = 'atlas';
const MESSAGE_ID = 'convention';

/**
 * @param {Convention} convention
 * @returns {import('eslint').Rule.RuleModule}
 */
function ruleOf(convention) {
  const { selectors = [], create } = convention;
  return {
    meta: {
      type: 'problem',
      docs: { description: convention.why },
      ...(convention.fixable && { fixable: convention.fixable }),
      schema: [],
      messages: { [MESSAGE_ID]: `${convention.message} ${convention.why}` },
    },
    create: create ?? ((context) => Object.fromEntries(selectors.map((selector) => [
      selector,
      /** @param {import('eslint').Rule.Node} node */
      (node) => context.report({ node, messageId: MESSAGE_ID }),
    ]))),
  };
}

/** @param {Convention} convention */
export const ruleId = (convention) => `${PLUGIN}/${convention.name}`;

/** @type {import('eslint').ESLint.Plugin} */
export const atlasPlugin = {
  meta: { name: PLUGIN },
  rules: Object.fromEntries([...CONVENTIONS, ...TEST_CONVENTIONS].map((convention) => [convention.name, ruleOf(convention)])),
};

/**
 * One config block per convention. Each block registers the plugin itself, so the rule is only
 * ever switched on for files that also have the plugin; `scriptFiles` keeps both away from the
 * files ESLint reads without the TypeScript parser (`package.json`).
 * @param {string[]} scriptFiles The globs of every linted script file.
 * @param {Convention[]} [conventions] The table to switch on: the code's without one.
 * @returns {import('eslint').Linter.Config[]}
 */
export function conventionConfigs(scriptFiles, conventions = CONVENTIONS) {
  return conventions.map((convention) => {
    const ignores = [...(convention.owners ?? []), ...(convention.ignores ?? [])];
    return {
      name: ruleId(convention),
      files: convention.files ?? scriptFiles,
      ...(ignores.length > 0 && { ignores }),
      plugins: { [PLUGIN]: atlasPlugin },
      rules: { [ruleId(convention)]: 'error' },
    };
  });
}
