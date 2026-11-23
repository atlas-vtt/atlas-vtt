/**
 * Atlas' own lint conventions, one named rule each (`atlas/<name>`, built by `atlasPlugin.mjs`).
 *
 * A convention is a pattern the code must not hold outside the one place that owns it. Each entry
 * says what to write instead (`message`) and the reason (`why`); both are reported. `bad` and
 * `good` are examples the unit test lints (`tests/unit/lintConventions.test.ts`), so a selector
 * that stops matching fails a test.
 *
 * @typedef {object} Convention
 * @property {string} name Kebab-case; the rule's id is `atlas/<name>`.
 * @property {string[]} [selectors] ESLint selectors; each match is a finding. Either these or `create`.
 * @property {(context: import('eslint').Rule.RuleContext) => import('eslint').Rule.RuleListener} [create]
 *   A hand-written rule, for what no selector can express. It reports with `messageId: 'convention'`.
 * @property {string} message What to do instead, with the helper and its path.
 * @property {string} why The reason, in one sentence.
 * @property {string[]} [files] Globs the rule applies to; every linted script file without them.
 * @property {string[]} [owners] The files that are the one legitimate place, which the rule leaves alone.
 * @property {string[]} [ignores] Other globs the rule leaves alone.
 * @property {string[]} bad Code the rule must report.
 * @property {string[]} good Code the rule must accept.
 * @property {string} [filename] Where the examples are linted: a path inside `files`, or a `.tsx` name for JSX.
 */

const TEST_HELPERS = '**/__tests__/**';

/** What draws, hit-tests, sees, lights, hears, measures or shares the map. */
const MAP_TOKEN_READERS = [
  'src/app/pixi/**/*.{ts,tsx}',
  'src/app/vision/**/*.{ts,tsx}',
  'src/app/lighting/**/*.{ts,tsx}',
  'src/app/audio/**/*.{ts,tsx}',
  'src/app/fog/**/*.{ts,tsx}',
  'src/app/grid/**/*.{ts,tsx}',
  'src/app/clipboard/**/*.{ts,tsx}',
  'src/app/PixiRendererOrchestrator.ts',
  'src/app/react/useMapNavigationHotkeys.ts',
  'src/app/online/gm/{TokenShare,sceneInputs,gmMarks,dragRulers,MapLayerShare,LiveShare,playerMoves,playerDrags,playerTokenVision}.ts',
];
const LEVEL_OBJECT_READERS = [
  'src/app/pixi/**/*.{ts,tsx}',
  'src/app/vision/**/*.{ts,tsx}',
  'src/app/lighting/**/*.{ts,tsx}',
  'src/app/fog/**/*.{ts,tsx}',
  'src/app/audio/**/*.{ts,tsx}',
];
const SIGHT_RULES = ['src/app/vision/**/*.{ts,tsx}', 'src/app/pixi/lighting/**/*.{ts,tsx}'];
const SIGHT_POLICY = 'src/app/vision/tokenSightPolicy.ts';

const FILE_FIELDS = '/^(maxStress|statblockResources|showHPBars|showStressBars)$/';
const SHADER_CLASSES = '/^(Shader|GlProgram)$/';
const UNFINISHED = /\b(TODO|FIXME|HACK|XXX)\b/;

/**
 * Every way a module is taken from a package: the import is flagged rather than the use, so an
 * alias cannot pass.
 * @param {string} source The package as a selector value: a quoted name or a pattern.
 * @returns {string[]}
 */
function importsOf(source) {
  return [
    `ImportDeclaration[source.value=${source}]`,
    `ImportExpression[source.value=${source}]`,
    `ExportNamedDeclaration[source.value=${source}]`,
    `ExportAllDeclaration[source.value=${source}]`,
    `CallExpression[callee.name='require'][arguments.0.value=${source}]`,
  ];
}

/** @type {Convention[]} */
export const CONVENTIONS = [
  {
    name: 'native-notice',
    selectors: ["NewExpression[callee.name='Notice']"],
    message: 'Show a message with showNotice (src/app/ui/notice.ts).',
    why: "Atlas' messages are Obsidian's notices in Atlas' look, which only the helper gives them.",
    owners: ['src/app/ui/notice.ts'],
    bad: ["import { Notice } from 'obsidian';\nnew Notice('Saved');"],
    good: ["import { showNotice } from './ui/notice';\nshowNotice('Saved');"],
  },
  {
    name: 'native-title',
    selectors: [
      "JSXOpeningElement[name.name=/^[a-z]/] > JSXAttribute[name.name='title']",
      "CallExpression[callee.property.name=/^(setAttribute|setAttr)$/][arguments.0.value='title']",
      "Property[key.name='attr'] > ObjectExpression > Property[key.name='title']",
      "AssignmentExpression > MemberExpression.left[property.name='title'][object.type!='ThisExpression']:not([object.name=/^(doc|document)$/])",
    ],
    message: 'Name the control with `aria-label`, or show `LabelTooltip` (src/app/packages/components/primitives/tooltip.tsx) where a tooltip is wanted.',
    why: "A `title` attribute shows the browser's tooltip, and Atlas shows its own.",
    filename: 'src/app/example.tsx',
    bad: [
      'export const close = <button title="Close" />;',
      "declare const el: HTMLElement;\nel.setAttribute('title', 'Close');",
      "declare const el: HTMLElement;\nel.createEl('div', { attr: { title: 'Close' } });",
      "declare const el: HTMLElement;\nel.title = 'Close';",
    ],
    good: [
      'export const close = <button aria-label="Close" />;',
      'declare const Panel: (props: { title: string }) => null;\nexport const panel = <Panel title="Scenes" />;',
      "document.title = 'Atlas';",
      "export class Card { title = ''; rename(title: string): void { this.title = title; } }",
    ],
  },
  {
    name: 'parse-yaml',
    // The member selector catches a namespace import, the pattern selector a destructuring.
    selectors: [
      "ImportSpecifier[imported.name='parseYaml']",
      "ExportSpecifier[local.name='parseYaml']",
      "MemberExpression[property.name='parseYaml']",
      "ObjectPattern > Property[key.name='parseYaml']",
      "ImportDeclaration[source.value='yaml']",
      "CallExpression[callee.name='require'][arguments.0.value='yaml']",
    ],
    message: 'Parse the YAML of notes, bases and bundles with parseNoteYaml (src/app/services/noteYaml.ts).',
    why: "A note is not Atlas' own text and what the parser costs depends on the text, so only the helper, which checks the text first, hands it to the parser.",
    owners: ['src/app/services/noteYaml.ts'],
    bad: [
      "import { parseYaml } from 'obsidian';\nexport const read = (text: string): unknown => parseYaml(text);",
      "export { parseYaml } from 'obsidian';",
      "import * as obsidian from 'obsidian';\nexport const read = (text: string): unknown => obsidian.parseYaml(text);",
      "import * as obsidian from 'obsidian';\nconst { parseYaml } = obsidian;\nexport const read = parseYaml;",
      "import { parse } from 'yaml';\nexport const read = parse;",
      "export const yaml: unknown = require('yaml');",
    ],
    good: ["import { parseNoteYaml } from './services/noteYaml';\nexport const read = (text: string): unknown => parseNoteYaml(text);"],
  },
  {
    name: 'map-token-reads',
    // The declarator selectors catch `const { tokens } = state.objects`.
    selectors: [
      "MemberExpression[property.name='tokens'][object.property.name='objects']",
      "MemberExpression[property.name='tokens'][object.name='objects']",
      "VariableDeclarator[init.property.name='objects'] > ObjectPattern > Property[key.name='tokens']",
      "VariableDeclarator[init.name='objects'] > ObjectPattern > Property[key.name='tokens']",
    ],
    message: "Read the map's tokens with mapTokens, or every token of the scene with sceneTokens (src/app/tokens/offMap.ts).",
    why: 'The map holds only the tokens that are not kept beside it, and code that draws, hit-tests, selects, sees, lights, hears, measures or shares the map must not take the others for part of it.',
    files: MAP_TOKEN_READERS,
    ignores: [TEST_HELPERS],
    filename: 'src/app/grid/example.ts',
    bad: [
      'export const tokensOf = (state: { objects: { tokens: object } }): object => state.objects.tokens;',
      'export const tokensOf = (objects: { tokens: object }): object => objects.tokens;',
      'export function tokensOf(state: { objects: { tokens: object } }): object {\n  const { tokens } = state.objects;\n  return tokens;\n}',
      'export function tokensOf(objects: { tokens: object }): object {\n  const { tokens } = objects;\n  return tokens;\n}',
    ],
    good: ["import { mapTokens } from '../tokens/offMap';\nexport const tokensOf = (state: { objects: { tokens: Record<string, object> } }): object => mapTokens(state.objects);"],
  },
  {
    name: 'level-object-reads',
    // The pattern selector catches `const { objects } = state` and `({ objects }) =>`.
    selectors: ["MemberExpression[property.name='objects']", "ObjectPattern > Property[key.name='objects']"],
    message: "Read a view's objects with levelObjects(state) (src/app/levels/levelObjects.ts).",
    why: "What draws, hit-tests, sees or selects reads the objects of the level its view shows; a raw read would show every floor's tokens and walls at once.",
    files: LEVEL_OBJECT_READERS,
    ignores: [TEST_HELPERS],
    filename: 'src/app/fog/example.ts',
    bad: [
      'export const wallsOf = (state: { objects: { walls: object } }): object => state.objects.walls;',
      'export const wallsOf = ({ objects }: { objects: { walls: object } }): object => objects.walls;',
    ],
    good: ["import { levelObjects, type LevelObjectsState } from '../levels/levelObjects';\nexport const wallsOf = (state: LevelObjectsState): object => levelObjects(state).walls;"],
  },
  {
    name: 'vision-field-reads',
    selectors: ["MemberExpression[property.name='enabled'][object.property.name='vision']", "MemberExpression[property.name='enabled'][object.name='vision']"],
    message: "Ask the picture's SightPolicy (src/app/vision/tokenSightPolicy.ts) instead of reading a token's vision switch.",
    why: 'Which tokens give sight or are always seen is decided in that one place.',
    files: SIGHT_RULES,
    owners: [SIGHT_POLICY],
    ignores: [TEST_HELPERS],
    filename: 'src/app/vision/example.ts',
    bad: [
      'export const sees = (token: { vision?: { enabled: boolean } }): boolean => token.vision?.enabled === true;',
      'export const sees = (vision: { enabled: boolean }): boolean => vision.enabled;',
    ],
    good: ["import type { SightPolicy } from './tokenSightPolicy';\nexport const sees = (policy: SightPolicy, token: Parameters<SightPolicy['givesSight']>[0]): boolean => policy.givesSight(token);"],
  },
  {
    name: 'vision-on-uses',
    // The import is flagged rather than the call, so an alias cannot pass; the member selector
    // catches a namespace import, the export selector a re-export.
    selectors: ["ImportSpecifier[imported.name='visionOn']", "ExportSpecifier[local.name='visionOn']", "MemberExpression[property.name='visionOn']"],
    message: "Ask the picture's SightPolicy (src/app/vision/tokenSightPolicy.ts) instead of visionOn.",
    why: 'Only sightSources and selectSight ask visionOn: no token is a source without vision on, whatever a policy says, and the selection checks every token.',
    files: SIGHT_RULES,
    owners: [SIGHT_POLICY, 'src/app/vision/sight.ts', 'src/app/vision/selectSight.ts'],
    ignores: [TEST_HELPERS],
    filename: 'src/app/vision/example.ts',
    bad: [
      "import { visionOn } from './tokenSightPolicy';\nexport const on = visionOn;",
      "export { visionOn } from './tokenSightPolicy';",
      "import * as policy from './tokenSightPolicy';\nexport const on = policy.visionOn;",
    ],
    good: ["import { PLAYER_SIGHT_POLICY } from './tokenSightPolicy';\nexport const givesSight = PLAYER_SIGHT_POLICY.givesSight;"],
  },
  {
    name: 'file-format-fields',
    selectors: [`:matches(Property[key.name=${FILE_FIELDS}], MemberExpression[property.name=${FILE_FIELDS}])`],
    message: 'Convert with tokenFromFile / tokenToFile and sceneFromFile / sceneToFile (src/app/resources/resourceFileFormat.ts).',
    why: 'Files keep the fields older versions of Atlas read, and nothing but that module knows them: in memory a token holds `resources` and a scene `hiddenResources`.',
    owners: ['src/app/resources/resourceFileFormat.ts'],
    bad: [
      'export const stressOf = (token: { maxStress: number }): number => token.maxStress;',
      'export const settings = { showHPBars: true };',
      'export const restOf = ({ statblockResources, ...rest }: { statblockResources: object; id: string }): object => rest;',
    ],
    good: ["import { tokenToFile } from './resources/resourceFileFormat';\nexport const saved = (token: Parameters<typeof tokenToFile>[0]): unknown => tokenToFile(token);"],
  },
  {
    name: 'clipper-imports',
    selectors: importsOf("'clipper2-ts'"),
    message: 'Unite, cut and inflate shapes with the functions of src/app/lighting/polygonClip.ts.',
    why: 'That module alone hands the clipping library quantized coordinates and returns its shapes with their contours in one deterministic order.',
    owners: ['src/app/lighting/polygonClip.ts'],
    bad: ["import { union } from 'clipper2-ts';\nexport const unite = union;", "export { union } from 'clipper2-ts';"],
    good: ["import { unionShapes } from './lighting/polygonClip';\nexport const unite = unionShapes;"],
  },
  {
    name: 'process-front-matter',
    selectors: ["MemberExpression[property.name='processFrontMatter']"],
    message: "Change a quest note's properties with the functions of src/app/campaigns/quests/questNotes.ts, and a statblock note's values through NoteFieldWriter (src/app/statblocks/notes/NoteFieldWriter.ts).",
    why: "Obsidian's writer writes the whole frontmatter anew, while the statblock writer rewrites only the range of the value it was given, so every other byte of the note stays as it was.",
    owners: ['src/app/campaigns/quests/questNotes.ts'],
    bad: ["import type { App, TFile } from 'obsidian';\nexport const close = (app: App, file: TFile): Promise<void> => app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => { frontmatter.status = 'done'; });"],
    good: ["import type { App } from 'obsidian';\nimport { setQuestStatus } from './campaigns/quests/questNotes';\nexport const close = (app: App, path: string): Promise<boolean> => setQuestStatus(app, path, 'done');"],
  },
  {
    name: 'bestiary-lookup',
    selectors: ["MemberExpression[property.name='getCreatureFromBestiary']"],
    message: 'Ask bestiaryCreatureByName (src/app/services/FantasyStatblocksService.ts) for a creature of the bestiary.',
    why: "Fantasy Statblocks' own lookup throws while the plugin still parses the vault, which it does after every start.",
    owners: ['src/app/services/FantasyStatblocksService.ts'],
    bad: ["export const goblin = (api: { getCreatureFromBestiary(name: string): unknown }): unknown => api.getCreatureFromBestiary('Goblin');"],
    good: ["import { bestiaryCreatureByName } from './services/FantasyStatblocksService';\nexport const goblin = (api: Parameters<typeof bestiaryCreatureByName>[0]): unknown => bestiaryCreatureByName(api, 'Goblin');"],
  },
  {
    name: 'layout-size-morph',
    selectors: ["JSXOpeningElement[name.object.name='motion'] > JSXAttribute[name.name='layout']:matches([value=null], [value.expression.value=true], [value.value='size'], [value.expression.value='size'])"],
    message: 'Animate the real height (useElementHeight, src/app/react/hooks/useElementHeight.ts) and give the element `layout="position"` at most.',
    why: 'A layout size morph is a scale, which stretches corners, borders and the dice.',
    filename: 'src/app/example.tsx',
    bad: [
      "import { motion } from 'framer-motion';\nexport const panel = <motion.div layout />;",
      "import { motion } from 'framer-motion';\nexport const panel = <motion.div layout={true} />;",
      "import { motion } from 'framer-motion';\nexport const panel = <motion.li layout=\"size\" />;",
    ],
    good: [
      "import { motion } from 'framer-motion';\nexport const panel = <motion.div layout=\"position\" />;",
      "import { motion } from 'framer-motion';\nexport const panel = (reduced: boolean): unknown => <motion.div layout={reduced ? false : 'position'} />;",
      'declare const Grid: (props: { layout: string }) => null;\nexport const grid = <Grid layout="row" />;',
    ],
  },
  {
    name: 'graphics-svg',
    selectors: ["CallExpression[callee.property.name='svg']"],
    message: 'Rasterise the glyph once in white with createGlyphTexture (src/app/pixi/utils/pinIconTexture.ts) and tint a sprite of it.',
    why: 'A Graphics builds the curves of an SVG from straight pieces, whose corners show once the map is zoomed in.',
    files: ['src/app/pixi/**/*.{ts,tsx}'],
    filename: 'src/app/pixi/example.ts',
    bad: ["import { Graphics } from 'pixi.js';\nexport const glyph = (markup: string): Graphics => new Graphics().svg(markup);"],
    good: ["import { Sprite } from 'pixi.js';\nimport { createGlyphTexture } from './utils/pinIconTexture';\nexport const glyph = (path: string): Sprite => new Sprite(createGlyphTexture(path) ?? undefined);"],
  },
  {
    name: 'pixi-culler',
    selectors: ["ImportSpecifier[imported.name='Culler']"],
    message: 'Let the layer decide what the view being drawn shows, as src/app/pixi/annotations/AnnotationLayer.ts does.',
    why: "The stage is drawn for several views in turn (the canvas, the players' frame, a thumbnail), and what the Culler hid for one is missing in the next.",
    bad: ["import { Culler } from 'pixi.js';\nexport const culler = Culler.shared;"],
    good: ["import { Container } from 'pixi.js';\nexport const layer = new Container();"],
  },
  {
    name: 'viewport-pause',
    selectors: [
      "AssignmentExpression[left.property.name='pause'][left.object.property.name='viewport']",
      "AssignmentExpression[left.property.name='pause'][left.object.name='viewport']",
    ],
    message: "Pause the drag plugin for the length of the gesture: viewport.plugins.pause('drag'), and resume it when the gesture ends.",
    why: 'A paused viewport stops the zoom too.',
    bad: [
      'export class Tool { viewport = { pause: false }; start(): void { this.viewport.pause = true; } }',
      'export const start = (viewport: { pause: boolean }): void => { viewport.pause = true; };',
    ],
    good: [
      "export const start = (viewport: { plugins: { pause(name: string): void } }): void => viewport.plugins.pause('drag');",
      'export const paused = (viewport: { pause: boolean }): boolean => viewport.pause;',
    ],
  },
  {
    name: 'dice-dom-events',
    selectors: ["CallExpression[callee.property.name='addEventListener'][arguments.0.value=/^dice-/]"],
    message: "Subscribe on the view's ServiceManager bus (getEventBus, src/app/services/ServiceManager.ts).",
    why: "The dice tool emits its events on its view's bus, so every map hears only its own rolls; nothing sends them to the document.",
    bad: ["export const listen = (onRoll: () => void): void => document.addEventListener('dice-rolled', onRoll);"],
    good: [
      "export const listen = (bus: { on(name: string, handler: () => void): void }, onRoll: () => void): void => bus.on('dice-rolled', onRoll);",
      "export const listen = (onKey: () => void): void => document.addEventListener('keydown', onKey);",
    ],
  },
  {
    name: 'translated-pieces',
    // A translation joined with a text, another translation or a sum that ends in one. A translation
    // followed by a value alone (a roll's modifiers after its line) is left alone.
    selectors: [
      "BinaryExpression[operator='+'][left.callee.name='t']:matches([right.callee.name='t'], [right.type='Literal'], [right.type='TemplateLiteral'])",
      "BinaryExpression[operator='+'][right.callee.name='t']:matches([left.type='Literal'], [left.type='TemplateLiteral'])",
      "BinaryExpression[operator='+'][right.callee.name='t'][left.type='BinaryExpression'][left.operator='+']",
    ],
    message: 'Write the sentence as one key with {placeholders}, and join lists with formatList (src/app/i18n/index.ts).',
    why: 'Languages order their words differently, so a sentence joined from translated pieces cannot be translated.',
    bad: [
      "import { t } from './i18n';\nexport const label = (name: string): string => t('roll.by') + ' ' + name;",
      "import { t } from './i18n';\nexport const label = (): string => t('roll.by') + t('roll.dice');",
      "import { t } from './i18n';\nexport const label = (): string => '(' + t('roll.dice');",
      "import { t } from './i18n';\nexport const label = (count: number): string => count + ' ' + t('roll.dice');",
    ],
    good: [
      "import { t } from './i18n';\nexport const label = (name: string): string => t('roll.by', { name });",
      "import { formatList, t } from './i18n';\nexport const label = (names: string[]): string => t('roll.by', { name: formatList(names) });",
    ],
  },
  {
    name: 'engine-shader-creation',
    selectors: [`:matches(NewExpression[callee.name=${SHADER_CLASSES}], MemberExpression[object.name=${SHADER_CLASSES}][property.name='from'])`],
    message: 'Create the shader with createShader or engineProgram (src/app/pixi/lighting/engine/gpu.ts) from an entry of ENGINE_SHADERS (src/app/pixi/lighting/engine/engineShaders.ts).',
    why: 'The rules the tests hold the shader sources to and the check that they compile on the device cover only the listed programs, and only the helper reads every lighting texture at full precision.',
    files: ['src/app/pixi/lighting/engine/**/*.{ts,tsx}'],
    owners: ['src/app/pixi/lighting/engine/gpu.ts'],
    filename: 'src/app/pixi/lighting/engine/example.ts',
    bad: [
      "import { GlProgram, Shader } from 'pixi.js';\nexport const shader = (glProgram: GlProgram): Shader => new Shader({ glProgram, resources: {} });",
      "import { GlProgram } from 'pixi.js';\nexport const program = (vertex: string, fragment: string): GlProgram => GlProgram.from({ vertex, fragment });",
    ],
    good: ["import type { Shader } from 'pixi.js';\nimport { ENGINE_SHADERS } from './engineShaders';\nimport { createShader } from './gpu';\nexport const shader = (): Shader => createShader(ENGINE_SHADERS.lightMap, {});"],
  },
  {
    name: 'three-imports',
    // A selector's pattern ends at the first slash, so the one after the package's name is written as its code point.
    selectors: importsOf('/^three(\\u002F|$)/'),
    message: 'Keep three.js inside src/app/dice3d/ and show dice through its stages (src/app/dice3d/DiceRenderer.ts).',
    why: 'PIXI draws the map; three.js draws the dice alone, through the one WebGL context a document has for them.',
    owners: ['src/app/dice3d/**'],
    bad: [
      "import * as THREE from 'three';\nexport const scene = new THREE.Scene();",
      "import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';\nexport const room = RoomEnvironment;",
      "export const three = (): Promise<unknown> => import('three');",
    ],
    good: [
      "import { DiceRenderer } from './dice3d/DiceRenderer';\nexport const renderer = DiceRenderer;",
      "import { fold } from 'threefold';\nexport const folded = fold;",
    ],
  },
  {
    name: 'unfinished-markers',
    create: (context) => ({
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (comment.loc && UNFINISHED.test(comment.value)) context.report({ loc: comment.loc, messageId: 'convention' });
        }
      },
    }),
    message: 'Finish the work, or open an issue for it and leave the marker out.',
    why: 'A marker in code is copied and never done.',
    bad: ['// TODO: snap to the grid\nexport const snapped = false;', '/* FIXME */\nexport const snapped = false;', '/** HACK around the first frame. */\nexport const snapped = false;'],
    good: ['// Todo lists are widgets.\nexport const snapped = false;', "export const label = 'TODO';", '// TODOS_FOLDER holds the lists.\nexport const snapped = false;'],
  },
];
