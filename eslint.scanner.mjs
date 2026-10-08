// Obsidian's community directory lints the whole repository with the
// obsidianmd `recommended` preset and the type-aware parser, ignoring this
// repository's own eslint.config.mjs. A file the parser cannot place in a
// TypeScript project is a fatal parsing error there and fails the review, so
// `npm run lint:scan` (scripts/lint-scan.js) runs the same setup and fails on
// any fatal message. Warnings are allowed: they only show on the scorecard.
import obsidianmd from "eslint-plugin-obsidianmd";

export default [
  // Local-only folders (git-ignored dev vaults and side projects) that a clean clone never contains.
  { ignores: ["node_modules/", "dist/", "build/", "dist-packages/", "api-report/", "release/", "test-vault/", "networking-test-vault/", "workspace-vault/", "atlas-website/", "token-ui-examples/", "party/", "logs/", "benchmarks/"] },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mts,cts,js,cjs,mjs,jsx}"],
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.*", "eslint.scanner.*"] },
      },
    },
  },
];
