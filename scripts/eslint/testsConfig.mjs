/**
 * The lint of the test files (`npm run lint:tests`): the test conventions alone, read from the
 * syntax. No type information, so 2,900 files take seconds, and nothing of the preset the code
 * is linted with, which `eslint.config.mjs` keeps away from tests.
 *
 * ESLint starts the globs of a config named with `--config` from the directory it is run in, not
 * from the config's own, and reads no file outside that directory. So these are written from the
 * repository's root, where npm runs every script.
 */
import tseslint from 'typescript-eslint';
import { conventionConfigs } from './atlasPlugin.mjs';
import { TEST_CONVENTIONS } from './testConventions.mjs';

export const TEST_FILES = ['tests/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'];

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ESLint reads `.js`, `.cjs` and `.mjs` files without being asked. No test is one, and `npm run check` hands this config every changed file.
  { name: 'atlas/tests/scripts', ignores: ['**/*.{js,cjs,mjs,jsx}'] },
  {
    name: 'atlas/tests',
    files: TEST_FILES,
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    // A finding is fixed in the test or recorded in eslint.tests.suppressions.json, never switched off in a comment.
    linterOptions: { noInlineConfig: true },
  },
  ...conventionConfigs(TEST_FILES, TEST_CONVENTIONS),
];
