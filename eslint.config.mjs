import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import { builtinModules } from "node:module";
import { BOUNDARIES, PLUGIN_ONLY_SPECIFIER } from "./scripts/boundaries.mjs";

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

// A `title` attribute shows the browser's tooltip. Atlas shows its own
// (`LabelTooltip`) where one is wanted and names controls with `aria-label`.
const TITLE_MESSAGE = "`title` shows the browser tooltip. Use `aria-label`, or `LabelTooltip` for a visible tooltip.";
const NO_NATIVE_TITLE = [
  { selector: "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']", message: TITLE_MESSAGE },
  { selector: "CallExpression[callee.property.name=/^(setAttribute|setAttr)$/][arguments.0.value='title']", message: TITLE_MESSAGE },
  { selector: "Property[key.name='attr'] > ObjectExpression > Property[key.name='title']", message: TITLE_MESSAGE },
  { selector: "AssignmentExpression > MemberExpression.left[property.name='title'][object.type!='ThisExpression']:not([object.name=/^(doc|document)$/])", message: TITLE_MESSAGE },
];

// Sight rules read a token's vision switch only through the sight policies.
const VISION_FIELD_MESSAGE = "Which tokens give sight or are always seen is decided in vision/tokenSightPolicy.ts.";
const VISION_FIELD_READS = [
  { selector: "MemberExpression[property.name='enabled'][object.property.name='vision']", message: VISION_FIELD_MESSAGE },
  { selector: "MemberExpression[property.name='enabled'][object.name='vision']", message: VISION_FIELD_MESSAGE },
];
// The import is flagged rather than the call, so an alias cannot pass; the member selector
// catches a namespace import, the export selector a re-export.
const VISION_ON_MESSAGE = "Only sightSources and selectSight ask visionOn; elsewhere ask the picture's SightPolicy (vision/tokenSightPolicy.ts).";
const VISION_ON_USES = [
  { selector: "ImportSpecifier[imported.name='visionOn']", message: VISION_ON_MESSAGE },
  { selector: "ExportSpecifier[local.name='visionOn']", message: VISION_ON_MESSAGE },
  { selector: "MemberExpression[property.name='visionOn']", message: VISION_ON_MESSAGE },
];
// The two files that may ask `visionOn`: no source without vision on, whatever a policy says,
// and the selection's check of every token.
const VISION_ON_ASKERS = ["src/app/vision/sight.ts", "src/app/vision/selectSight.ts"];

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
      "no-restricted-syntax": ["error", ...NO_NATIVE_TITLE],
    },
  },
  // Which tokens give sight and which a picture always shows is decided in one place,
  // `vision/tokenSightPolicy.ts`. A later block replaces the rule's options for the files it
  // matches, so both blocks repeat the `title` selectors.
  {
    files: ["src/app/vision/**/*.{ts,tsx}", "src/app/pixi/lighting/**/*.{ts,tsx}"],
    ignores: ["src/app/vision/tokenSightPolicy.ts", ...VISION_ON_ASKERS, "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error", ...NO_NATIVE_TITLE, ...VISION_FIELD_READS, ...VISION_ON_USES],
    },
  },
  {
    files: VISION_ON_ASKERS,
    rules: {
      "no-restricted-syntax": ["error", ...NO_NATIVE_TITLE, ...VISION_FIELD_READS],
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
