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
// A note's text reaches the YAML parser only through the helper that checks it first. The import
// is flagged rather than the call, so an alias cannot pass; the member selector catches a
// namespace import, the export selector a re-export, the pattern selector a destructuring.
const PARSE_YAML_MESSAGE = "Parse the YAML of notes, bases and bundles with parseNoteYaml (services/noteYaml.ts), which checks the text first.";
const PARSE_YAML_USES = [
  { selector: "ImportSpecifier[imported.name='parseYaml']", message: PARSE_YAML_MESSAGE },
  { selector: "ExportSpecifier[local.name='parseYaml']", message: PARSE_YAML_MESSAGE },
  { selector: "MemberExpression[property.name='parseYaml']", message: PARSE_YAML_MESSAGE },
  { selector: "ObjectPattern > Property[key.name='parseYaml']", message: PARSE_YAML_MESSAGE },
  { selector: "ImportDeclaration[source.value='yaml']", message: PARSE_YAML_MESSAGE },
  { selector: "CallExpression[callee.name='require'][arguments.0.value='yaml']", message: PARSE_YAML_MESSAGE },
];
const NOTE_YAML_PARSER = "src/app/services/noteYaml.ts";
// Atlas' messages are Obsidian's notices in Atlas' look, which only the helper gives them.
const NATIVE_NOTICE = [
  { selector: "NewExpression[callee.name='Notice']", message: "Show a message with showNotice (src/app/ui/notice.ts), which gives it Atlas' look." },
];
const ATLAS_NOTICE = "src/app/ui/notice.ts";

// The map holds only the tokens that are not kept beside it (`tokens/offMap.ts`): code that draws,
// hit-tests, selects, sees, lights, hears, measures, moves with the map or shares the map with
// players reads them through `mapTokens`, and says so with `sceneTokens` where it means every token.
const MAP_TOKEN_MESSAGE = "Read the map's tokens with mapTokens, or every token of the scene with sceneTokens (tokens/offMap.ts): tokens kept beside the map are no part of it.";
const MAP_TOKEN_READS = [
  { selector: "MemberExpression[property.name='tokens'][object.property.name='objects']", message: MAP_TOKEN_MESSAGE },
  { selector: "MemberExpression[property.name='tokens'][object.name='objects']", message: MAP_TOKEN_MESSAGE },
  { selector: "VariableDeclarator[init.property.name='objects'] > ObjectPattern > Property[key.name='tokens']", message: MAP_TOKEN_MESSAGE },
  { selector: "VariableDeclarator[init.name='objects'] > ObjectPattern > Property[key.name='tokens']", message: MAP_TOKEN_MESSAGE },
];
const MAP_TOKEN_READERS = [
  "src/app/pixi/**/*.{ts,tsx}",
  "src/app/vision/**/*.{ts,tsx}",
  "src/app/lighting/**/*.{ts,tsx}",
  "src/app/audio/**/*.{ts,tsx}",
  "src/app/fog/**/*.{ts,tsx}",
  "src/app/grid/**/*.{ts,tsx}",
  "src/app/clipboard/**/*.{ts,tsx}",
  "src/app/PixiRendererOrchestrator.ts",
  "src/app/react/useMapNavigationHotkeys.ts",
  "src/app/online/gm/{TokenShare,sceneInputs,gmMarks,dragRulers,MapLayerShare,LiveShare,playerMoves,playerDrags,playerTokenVision}.ts",
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
      "no-restricted-syntax": ["error", ...NATIVE_NOTICE, ...NO_NATIVE_TITLE, ...PARSE_YAML_USES],
    },
  },
  {
    files: MAP_TOKEN_READERS,
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error", ...NATIVE_NOTICE, ...NO_NATIVE_TITLE, ...PARSE_YAML_USES, ...MAP_TOKEN_READS],
    },
  },
  // Which tokens give sight and which a picture always shows is decided in one place,
  // `vision/tokenSightPolicy.ts`. A later block replaces the rule's options for the files it
  // matches, so both blocks repeat the `title` selectors.
  {
    files: ["src/app/vision/**/*.{ts,tsx}", "src/app/pixi/lighting/**/*.{ts,tsx}"],
    ignores: ["src/app/vision/tokenSightPolicy.ts", ...VISION_ON_ASKERS, "**/__tests__/**"],
    rules: {
      "no-restricted-syntax": ["error", ...NATIVE_NOTICE, ...NO_NATIVE_TITLE, ...PARSE_YAML_USES, ...VISION_FIELD_READS, ...VISION_ON_USES, ...MAP_TOKEN_READS],
    },
  },
  {
    files: VISION_ON_ASKERS,
    rules: {
      "no-restricted-syntax": ["error", ...NATIVE_NOTICE, ...NO_NATIVE_TITLE, ...PARSE_YAML_USES, ...VISION_FIELD_READS, ...MAP_TOKEN_READS],
    },
  },
  {
    files: [NOTE_YAML_PARSER],
    rules: {
      "no-restricted-syntax": ["error", ...NATIVE_NOTICE, ...NO_NATIVE_TITLE],
    },
  },
  {
    files: [ATLAS_NOTICE],
    rules: {
      "no-restricted-syntax": ["error", ...NO_NATIVE_TITLE, ...PARSE_YAML_USES],
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
