import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import reactHooks from "eslint-plugin-react-hooks";
import { builtinModules } from "node:module";
import { BOUNDARIES, PLUGIN_ONLY_SPECIFIER } from "./scripts/boundaries.mjs";
import { conventionConfigs } from "./scripts/eslint/atlasPlugin.mjs";

// Keep the directory rules and add the restrictions for shared helpers.
const restrictedGlobals = new Map();
for (const config of obsidianmd.configs.recommended) {
  const rule = config.rules?.["no-restricted-globals"];
  if (Array.isArray(rule)) for (const entry of rule.slice(1)) {
    restrictedGlobals.set(typeof entry === "string" ? entry : entry.name, entry);
  }
}
for (const name of ["fetch", "XMLHttpRequest", "WebSocket", "localStorage", "indexedDB"]) {
  restrictedGlobals.set(name, { name, message: "Shared helpers must receive data from their caller." });
}
const nodeNames = builtinModules.map(name => name.replace(/^node:/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

// Obsidian's community directory scores the plugin with `recommended`, so every
// finding of those rules is a public scorecard row. Additions below only make
// the local gate stricter, never looser.
//
// The overrides are limited to script files. `recommended` also lints
// `package.json` (without the TypeScript plugin), and an unscoped
// `@typescript-eslint/*` rule there is a fatal ESLint error, which is what
// Obsidian's whole-repository scan runs into.
const SCRIPT_FILES = ["**/*.{ts,cts,mts,tsx,js,cjs,mjs,jsx}"];

export default defineConfig([
  globalIgnores(["atlas-website/", "token-ui-examples/", "party/", "logs/", "benchmarks/", "release/", "dist/", "node_modules/", "test-vault/", "networking-test-vault/", "tests/", "scripts/", "docs/", "vite/", "**/*.test.*", "*.js", "*.cjs", "*.mjs", "*.mts", "*.config.ts"]),
  ...obsidianmd.configs.recommended,
  {
    files: SCRIPT_FILES,
    rules: {
      // "Atlas" is the product name. `ignoreWords` rather than `brands`,
      // because `brands` replaces the rule's built-in list (Obsidian, GitHub, …).
      "obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["Atlas", "Fantasy", "Statblocks"] }],
      // Stricter than the scorecard: type errors are fixed, not silenced.
      "@typescript-eslint/ban-ts-comment": ["error", {
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-expect-error": true,
      }],
    },
  },
  {
    // TypeScript files only: a return type is written out, so a reader and a caller see it without
    // inferring it, and a switch over a union names every member or says `default`.
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": ["error", {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
        allowIIFEs: true,
      }],
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
    },
  },
  // Atlas' own conventions, one named rule each (scripts/eslint/conventions.mjs). They are rules
  // of their own because a later block replaces the options of a rule for the files it matches:
  // as selectors of `no-restricted-syntax`, every block had to repeat the others'.
  ...conventionConfigs(SCRIPT_FILES),
  // React: the rules of hooks, and what a render or an effect may not do. Only `.tsx` and
  // `use*.ts`, where components and hooks are written: in any other module `rules-of-hooks`
  // takes a callback that happens to be named `use` for a hook.
  // `exhaustive-deps` stays off while memos are invalidated by a revision counter in their
  // dependency list: the rule calls that dependency unnecessary, and removing it is a bug.
  // `refs` stays off: it also reports handlers a hook returns and ref-callback factories.
  {
    files: ["src/**/*.tsx", "src/**/use*.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/set-state-in-effect": "error",
      // No findings when they were switched on, so they stay that way.
      "react-hooks/set-state-in-render": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/globals": "error",
      "react-hooks/error-boundaries": "error",
      "react-hooks/unsupported-syntax": "error",
    },
  },
  // Statblocks: only the drag-and-drop wrapper may import dnd-kit, and the pure
  // core (model, format, expressions, values, the patcher, the FS layout
  // converter) imports neither Obsidian nor React. The core rule is used
  // because the obsidianmd preset owns the TypeScript variant, and overriding
  // it would drop its options.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/statblocks/editor/dnd/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@dnd-kit/*"], message: "Only statblocks/editor/dnd/ imports dnd-kit." }],
      }],
    },
  },
  {
    files: [
      "src/app/statblocks/{model,format,expressions,values}/**/*.{ts,tsx}",
      "src/app/statblocks/notes/{frontmatterPatch,frontmatterBounds,frontmatterModel,yamlSplice,yamlDocument,yamlValueText,listIdentity,patchTypes}.ts",
      "src/app/statblocks/fs/{fsLayoutToTemplate,fsBlocks,fsBlockParts,fsLeafBlocks,fsCallbackPatterns,fsCallbackSyntax,fsCallbackLexer,fsImportState,fsScripts,fsLayoutTypes,fsTrackReplacement}.ts",
    ],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "obsidian", message: "The statblock core is pure: no Obsidian." },
          { name: "react", message: "The statblock core is pure: no React." },
          { name: "react-dom", message: "The statblock core is pure: no React." },
        ],
        patterns: [{ group: ["@dnd-kit/*"], message: "Only statblocks/editor/dnd/ imports dnd-kit." }],
      }],
    },
  },
  {
    files: SCRIPT_FILES,
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
    linterOptions: {
      // Findings are fixed at their root. An accepted exception is recorded in
      // eslint.suppressions.json, where a review sees it, never in a comment.
      // The file is not at ESLint's default location on purpose: Obsidian's
      // directory review runs ESLint with its own rule set, and a suppression
      // that set does not use makes ESLint exit 2, which the review reports
      // as a fatal error. Only npm run lint passes --suppressions-location.
      noInlineConfig: true,
    },
  },
  {
    files: BOUNDARIES.shared.include,
    ignores: BOUNDARIES.shared.exclude,
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          regex: `^(obsidian|electron)(/|$)|^(@codemirror|@lezer)/|^node:|^(?:${nodeNames.join("|")})(/|$)|^(src/|@/)|${PLUGIN_ONLY_SPECIFIER.source}`,
          message: "Shared helpers must not import plugin services or host APIs.",
        }],
      }],
      "no-restricted-globals": ["error", {
        globals: [...restrictedGlobals.values()],
        checkGlobalObject: true,
      }],
    },
  },
]);
