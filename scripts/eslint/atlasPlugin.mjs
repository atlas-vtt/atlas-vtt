/**
 * The conventions table as an ESLint plugin: one rule per convention, so a convention can be
 * scoped, suppressed and counted by its own name, and no config block has to repeat another's
 * selectors.
 */
import { CONVENTIONS } from './conventions.mjs';

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
  rules: Object.fromEntries(CONVENTIONS.map((convention) => [convention.name, ruleOf(convention)])),
};

/**
 * One config block per convention. Each block registers the plugin itself, so the rule is only
 * ever switched on for files that also have the plugin; `scriptFiles` keeps both away from the
 * files ESLint reads without the TypeScript parser (`package.json`).
 * @param {string[]} scriptFiles The globs of every linted script file.
 * @returns {import('eslint').Linter.Config[]}
 */
export function conventionConfigs(scriptFiles) {
  return CONVENTIONS.map((convention) => {
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
