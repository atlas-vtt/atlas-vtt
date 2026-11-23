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
 * @property {'code'} [fixable] Set where the hand-written rule offers a fix.
 * @property {string} message What to do instead, with the helper and its path.
 * @property {string} why The reason, in one sentence.
 * @property {string[]} [files] Globs the rule applies to; every linted script file without them.
 * @property {string[]} [owners] The files that are the one legitimate place, which the rule leaves alone.
 * @property {string[]} [ignores] Other globs the rule leaves alone.
 * @property {string[]} bad Code the rule must report.
 * @property {string[]} good Code the rule must accept.
 * @property {string} [filename] Where the examples are linted: a path inside `files`, or a `.tsx` name for JSX.
 */
import { create as restatingComments } from './restatingComments.mjs';

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
const EVENT_BUTTON = "MemberExpression[property.name='button']:not([object.type='ThisExpression'])";
// A selector's pattern ends at the first slash, so each slash is written as its code point.
const TEST_CODE = '/(\\.test(\\.|$)|\\u002F__tests__\\u002F|^tests\\u002F|\\u002Ftests\\u002F)/';

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
      // Obsidian's element helpers set the attribute from their options (`DomElementInfo.title`).
      "CallExpression:matches([callee.property.name=/^(createEl|createDiv|createSpan)$/], [callee.name=/^(createEl|createDiv|createSpan)$/]) > ObjectExpression > Property[key.name='title']",
      "AssignmentExpression > MemberExpression.left[property.name='title'][object.type!='ThisExpression']:not([object.name=/^(doc|document)$/])",
    ],
    message: 'Name the control with `aria-label`, or show `LabelTooltip` (src/app/packages/components/primitives/tooltip.tsx) where a tooltip is wanted.',
    why: "A `title` attribute shows the browser's tooltip, and Atlas shows its own.",
    filename: 'src/app/example.tsx',
    bad: [
      'export const close = <button type="button" title="Close" />;',
      "declare const el: HTMLElement;\nel.setAttribute('title', 'Close');",
      "declare const el: HTMLElement;\nel.createEl('div', { attr: { title: 'Close' } });",
      "declare const el: HTMLElement;\nel.createEl('div', { title: 'Close' });",
      "declare const el: HTMLElement;\nexport const add = (title: string): HTMLElement => el.createDiv({ title });",
      "export const label = createSpan({ cls: 'label', title: 'Close' });",
      "declare const el: HTMLElement;\nel.title = 'Close';",
    ],
    good: [
      'export const close = <button type="button" aria-label="Close" />;',
      'declare const Panel: (props: { title: string }) => null;\nexport const panel = <Panel title="Scenes" />;',
      "document.title = 'Atlas';",
      "export class Card { title = ''; rename(title: string): void { this.title = title; } }",
      "declare const el: HTMLElement;\nel.createEl('div', { text: 'Close', attr: { 'aria-label': 'Close' } });",
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
      ...importsOf("'yaml'"),
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
      "export const yaml = (): Promise<unknown> => import('yaml');",
      "export * from 'yaml';",
      "export { parse } from 'yaml';",
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
      "AssignmentExpression[left.property.name='pause'][left.object.type='TSNonNullExpression']:matches([left.object.expression.property.name='viewport'], [left.object.expression.name='viewport'])",
    ],
    message: "Pause the drag plugin for the length of the gesture: viewport.plugins.pause('drag'), and resume it when the gesture ends.",
    why: 'A paused viewport stops the zoom too.',
    bad: [
      'export class Tool { viewport = { pause: false }; start(): void { this.viewport.pause = true; } }',
      'export const start = (viewport: { pause: boolean }): void => { viewport.pause = true; };',
      'export class Tool { viewport?: { pause: boolean }; start(): void { this.viewport!.pause = true; } }',
      'export const start = (viewport?: { pause: boolean }): void => { viewport!.pause = true; };',
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
    selectors: ["BinaryExpression[operator='+'] > CallExpression[callee.name='t']"],
    message: 'Write the sentence as one key with {placeholders}, and join lists with formatList (src/app/i18n/index.ts).',
    why: 'Languages order their words differently, so a sentence joined from translated pieces cannot be translated.',
    bad: [
      "import { t } from './i18n';\nexport const label = (name: string): string => t('roll.by') + ' ' + name;",
      "import { t } from './i18n';\nexport const label = (suffix: string): string => t('roll.dice') + suffix;",
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
    name: 'pixi-asset-loads',
    selectors: ["MemberExpression[object.name='Assets'][property.name='load']"],
    message: 'Load the asset with loadAsset (src/app/pixi/utils/assetLifecycle.ts).',
    why: 'An unload of the same URL may still be under way, and a load beside it gets the texture that unload is about to destroy.',
    owners: ['src/app/pixi/utils/assetLifecycle.ts'],
    bad: ["import { Assets, type Texture } from 'pixi.js';\nexport const ring = (url: string): Promise<Texture> => Assets.load<Texture>(url);"],
    good: ["import type { Texture } from 'pixi.js';\nimport { loadAsset } from './pixi/utils/assetLifecycle';\nexport const ring = (url: string): Promise<Texture> => loadAsset<Texture>(url);"],
  },
  {
    name: 'pixi-resource-urls',
    selectors: ["MemberExpression[property.name='getResourcePath']", "CallExpression[callee.name='getResourcePath']"],
    message: "Read the file's bytes with vault.readBinary and decode them with decodeImage (src/app/pixi/decodedImage.ts).",
    why: 'PIXI fetches a URL it is given, and Obsidian answers a fetch of `app://` only from newer installers, so vault images reach PIXI as bytes.',
    files: ['src/app/pixi/**/*.{ts,tsx}'],
    filename: 'src/app/pixi/example.ts',
    bad: [
      "import type { App, TFile } from 'obsidian';\nexport const urlOf = (app: App, file: TFile): string => app.vault.getResourcePath(file);",
      'declare function getResourcePath(path: string): string;\nexport const urlOf = (path: string): string => getResourcePath(path);',
    ],
    good: ["import type { App, TFile } from 'obsidian';\nimport { decodeImage, type DecodedImage } from './decodedImage';\nexport const imageOf = async (app: App, file: TFile): Promise<DecodedImage> => decodeImage(await app.vault.readBinary(file), 'image/png', 2048);"],
  },
  {
    name: 'default-collection-id',
    // A field, a default, a variable, an assignment or a comparison of a collection with the old id.
    selectors: [
      ":matches(Property, PropertyDefinition)[key.name=/[cC]ollection(Id)?$/][value.value='default']",
      "AssignmentPattern[left.name=/[cC]ollection(Id)?$/][right.value='default']",
      "VariableDeclarator[id.name=/[cC]ollection(Id)?$/][init.value='default']",
      "AssignmentExpression[right.value='default']:matches([left.name=/[cC]ollection(Id)?$/], [left.property.name=/[cC]ollection(Id)?$/])",
      "BinaryExpression[right.value='default']:matches([left.name=/[cC]ollection(Id)?$/], [left.property.name=/[cC]ollection(Id)?$/])",
    ],
    message: "Ask defaultCollectionIdOf (src/app/services/collectionRecords.ts) or the asset service's getDefaultCollectionId() for the default collection.",
    why: "The default collection is recorded in the index and follows its folder when that is renamed, so only older vaults keep it in `default`.",
    owners: ['src/app/services/collectionRecords.ts'],
    bad: [
      "export const state = { currentCollectionId: 'default' };",
      "export class Picker { collection = 'default'; }",
      "export const add = (name: string, collection = 'default'): string => `${collection}/${name}`;",
      "export const collectionId = 'default';",
      "export const reset = (asset: { collection: string }): void => { asset.collection = 'default'; };",
      "export const isDefault = (asset: { collection: string }): boolean => asset.collection === 'default';",
    ],
    good: [
      "import { defaultCollectionIdOf } from './services/collectionRecords';\nexport const collectionOf = (metadata: Parameters<typeof defaultCollectionIdOf>[0]): string => defaultCollectionIdOf(metadata);",
      "export const options = { sort: 'default' };",
    ],
  },
  {
    name: 'dice-randomness',
    selectors: ["MemberExpression[object.name='Math'][property.name='random']"],
    message: 'Take the random stream as a parameter without a default; the plugin hands in diceRandom (src/app/services/offlineDiceInputs.ts).',
    why: "Every roll draws from the one stream its caller was given at the plugin's boundary, which a table can replace and a test can fix, and a default hides the caller that forgot it.",
    files: ['src/app/tools/{dice*,Dice*,*ormula*,rollDiceTerm}.ts', 'src/app/initiative/**/*.{ts,tsx}'],
    filename: 'src/app/tools/diceExample.ts',
    bad: [
      'export const rollFace = (sides: number, random: () => number = Math.random): number => Math.floor(random() * sides) + 1;',
      'export const rollFace = (sides: number): number => Math.floor(Math.random() * sides) + 1;',
    ],
    good: ['export const rollFace = (sides: number, random: () => number): number => Math.floor(random() * sides) + 1;'],
  },
  {
    name: 'pointerup-button',
    // `PointerUp` ends a word of the name, so `onPointerUpdate` is no release; `this.button` is a field, not the event's button.
    selectors: [
      `:matches(MethodDefinition, PropertyDefinition)[key.name=/[Pp]ointerUp(?![a-z])|^on(Mouse)?Up$/] ${EVENT_BUTTON}`,
      `:matches(FunctionDeclaration, VariableDeclarator)[id.name=/[Pp]ointerUp(?![a-z])|^on(Pointer|Mouse)?Up$/] ${EVENT_BUTTON}`,
      `CallExpression[arguments.0.value=/^pointerup/] > :function ${EVENT_BUTTON}`,
    ],
    message: 'Note on pointerdown which press began the gesture (isPrimaryPress, src/app/pixi/utils/pointerButtons.ts) and end it on any pointerup.',
    why: 'A browser sends pointerup only when the last button is released, and with that button, so a stroke whose release is ignored stays open.',
    bad: [
      'export class Stroke { open = false; handlePointerUp(event: { button: number }): void { if (event.button === 0) this.open = false; } }',
      'export class Stroke { open = false; onPointerUp = (event: { button: number }): void => { if (event.button === 0) this.open = false; }; }',
      'export const listen = (end: () => void): void => { const onUp = (event: PointerEvent): void => { if (event.button === 0) end(); }; window.addEventListener("pointerup", onUp); };',
      "export const listen = (end: () => void): void => window.addEventListener('pointerup', (event) => { if (event.button === 0) end(); });",
    ],
    good: [
      'export class Stroke { open = false; handlePointerDown(event: { button: number }): void { this.open = event.button === 0; } handlePointerUp(): void { this.open = false; } }',
      'export class Stroke { moved = false; onPointerUpdate(event: { button: number }): void { this.moved = event.button === 0; } }',
      'export class Stroke { button: HTMLElement | null = null; handlePointerUp(): void { this.button?.blur(); } }',
    ],
  },
  {
    name: 'destroy-children',
    // An application's destroy takes its own options first, so it has two arguments and is left alone.
    selectors: ["CallExpression[callee.property.name='destroy'][arguments.length=1] > ObjectExpression > Property[key.name='children'][value.value=true]"],
    message: 'Destroy a display object with its children through destroyTree (src/app/pixi/utils/destroyTree.ts).',
    why: "PIXI frees a Graphics' geometry only when destroy gets no options or `context: true`, so `{ children: true }` alone leaves it with the renderer until the application is destroyed.",
    owners: ['src/app/pixi/utils/destroyTree.ts'],
    ignores: [TEST_HELPERS],
    bad: ["import type { Container } from 'pixi.js';\nexport const remove = (layer: Container): void => layer.destroy({ children: true });"],
    good: [
      "import type { Container } from 'pixi.js';\nimport { destroyTree } from './pixi/utils/destroyTree';\nexport const remove = (layer: Container): void => destroyTree(layer);",
      "import type { Application } from 'pixi.js';\nexport const close = (app: Application): void => app.destroy({ removeView: true }, { children: true, texture: true });",
    ],
  },
  {
    name: 'condition-value-writes',
    // The map itself, an entry of it, and an entry behind a non-null assertion.
    selectors: [
      ":matches(AssignmentExpression[left.property.name='conditionValues'], UnaryExpression[operator='delete'][argument.property.name='conditionValues'])",
      ":matches(AssignmentExpression[left.object.property.name='conditionValues'], UnaryExpression[operator='delete'][argument.object.property.name='conditionValues'])",
      ":matches(AssignmentExpression[left.object.expression.property.name='conditionValues'], UnaryExpression[operator='delete'][argument.object.expression.property.name='conditionValues'])",
    ],
    message: "Change a token's conditions with setConditionValue, removeCondition or clearConditions (src/app/utils/conditionValues.ts).",
    why: 'A number never outlives its condition there, and an emptied list or map is deleted rather than left behind.',
    owners: ['src/app/utils/conditionValues.ts'],
    bad: [
      'export const clear = (token: { conditionValues?: Record<string, number> }): void => { delete token.conditionValues; };',
      'export const clear = (token: { conditionValues?: Record<string, number> }): void => { token.conditionValues = {}; };',
      'export const set = (token: { conditionValues: Record<string, number> }, id: string): void => { token.conditionValues[id] = 2; };',
      'export const remove = (token: { conditionValues: Record<string, number> }, id: string): void => { delete token.conditionValues[id]; };',
      'export const set = (token: { conditionValues?: Record<string, number> }, id: string): void => { token.conditionValues![id] = 2; };',
    ],
    good: ["import { clearConditions, type TokenConditionState } from './utils/conditionValues';\nexport const clear = (token: TokenConditionState): void => clearConditions(token);"],
  },
  {
    name: 'web-crypto',
    selectors: ["MemberExpression[property.name='subtle']"],
    message: 'Hash bytes with sha256, and a JSON value with hashJson (src/app/utils/hashing.ts).',
    why: 'Hashes are stored in vault files and compared between devices and windows, so one module makes their bytes and their hex.',
    // assetIds signs with a key, which is no content hash. The protocol directory is changed as a whole, never file by file.
    owners: ['src/app/utils/hashing.ts', 'src/app/online/gm/assets/assetIds.ts'],
    ignores: ['src/app/online/protocol/**'],
    bad: ["export const digest = (bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> => crypto.subtle.digest('SHA-256', bytes);"],
    good: ["import { sha256 } from './utils/hashing';\nexport const digest = (bytes: Uint8Array<ArrayBuffer>): Promise<string> => sha256(bytes);"],
  },
  {
    name: 'scroll-into-view',
    selectors: ["CallExpression[callee.property.name='scrollIntoView']"],
    message: 'Scroll the list alone with scrollWithin, or with revealInList where the list is the nearest ancestor that scrolls (src/app/utils/scrollWithin.ts).',
    why: '`scrollIntoView` scrolls every ancestor that can scroll, the map view around a panel included.',
    owners: ['src/app/utils/scrollWithin.ts'],
    // These glide to their element or centre it, which the helper does not do.
    ignores: [
      'src/app/packages/components/asset-manager/encounter-builder/RosterFeed.tsx',
      'src/app/packages/components/asset-manager/statblock-link/StatblockList.tsx',
      'src/app/react/components/loot/PlayerLootWindow.tsx',
      'src/app/react/hooks/useTabStripOverflow.ts',
      'src/app/statblocks/editor/rests/RuleCardLayer.tsx',
    ],
    bad: [
      "export const reveal = (row: Element): void => row.scrollIntoView({ block: 'nearest' });",
      "export const reveal = (list: Element | null): void => { list?.querySelector('[aria-selected]')?.scrollIntoView?.({ block: 'nearest' }); };",
    ],
    good: [
      "import { revealInList } from './utils/scrollWithin';\nexport const reveal = (row: Element): void => revealInList(row);",
      "import { scrollWithin } from './utils/scrollWithin';\nexport const reveal = (list: HTMLElement, row: Element): void => scrollWithin(list, row, 'nearest');",
    ],
  },
  {
    name: 'intl-locale',
    // A value of `undefined` is written out by its node type: a selector reads a missing name as the text "undefined".
    selectors: ["NewExpression[callee.object.name='Intl']:matches([arguments.length=0], [arguments.0.type='Identifier'][arguments.0.name='undefined'], [arguments.0.type='Literal'], [arguments.0.type='ArrayExpression'])"],
    message: 'Give the formatter getLocale() (src/app/i18n/index.ts).',
    why: "A formatter without a locale takes the system's, while Atlas' texts are in Obsidian's language.",
    owners: ['src/app/i18n/index.ts'],
    // The issue report is English whatever the language; a character is the same in every language, and a text wraps alike for the GM and the players.
    ignores: ['src/app/support/diagnostics.ts', 'src/app/annotations/textWrap.ts'],
    bad: [
      "export const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });",
      'export const number = new Intl.NumberFormat();',
      "export const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });",
      'export const list = new Intl.ListFormat([]);',
    ],
    good: [
      "import { getLocale } from './i18n';\nexport const byName = new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' });",
      'export const plural = (locale: string): Intl.PluralRules => new Intl.PluralRules(locale);',
    ],
  },
  {
    name: 'button-type',
    selectors: ["JSXOpeningElement:matches([name.name='button'], [name.object.name='motion'][name.property.name='button']):not(:has(JSXAttribute[name.name='type'])):not(:has(JSXSpreadAttribute))"],
    message: 'Give the button `type="button"`, or `type="submit"` where it submits its form.',
    why: 'A button without a type submits the form it stands in.',
    filename: 'src/app/example.tsx',
    bad: [
      'export const close = <button onClick={() => undefined}>Close</button>;',
      'export const close = <button />;',
      "import { motion } from 'framer-motion';\nexport const close = <motion.button whileTap={{ scale: 0.96 }}>Close</motion.button>;",
    ],
    good: [
      'export const close = <button type="button" onClick={() => undefined}>Close</button>;',
      'export const save = <button type="submit">Save</button>;',
      "import { motion } from 'framer-motion';\nexport const close = <motion.button type=\"button\" />;",
      "import { motion } from 'framer-motion';\nexport const panel = <motion.div />;",
      'export const close = (props: React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element => <button {...props} />;',
      'declare const Button: (props: { onClick: () => void }) => null;\nexport const close = <Button onClick={() => undefined} />;',
    ],
  },
  {
    name: 'shared-helpers',
    selectors: [':matches(FunctionDeclaration, VariableDeclarator)[id.name=/^(isRecord|clamp|lerp)$/]'],
    message: 'Import isRecord from src/app/utils/guards.ts, and clamp and lerp from src/app/utils/math.ts; a helper that does something else is named after what it does.',
    why: 'A copy drifts from the others, and the next file copies the copy.',
    owners: ['src/app/utils/**'],
    // The protocol directory is changed as a whole, never file by file.
    ignores: ['src/app/online/protocol/**'],
    bad: [
      "function isRecord(value: unknown): value is Record<string, unknown> {\n  return typeof value === 'object' && value !== null;\n}\nexport const read = (value: unknown): boolean => isRecord(value);",
      'const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));\nexport const share = (value: number): number => clamp(value, 0, 1);',
      'export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;',
    ],
    good: [
      "import { isRecord } from './utils/guards';\nexport const read = (value: unknown): boolean => isRecord(value);",
      "import { clamp, lerp } from './utils/math';\nexport const along = (from: number, to: number, t: number): number => lerp(from, to, clamp(t, 0, 1));",
      'const clampIndex = (index: number, size: number): number => Math.max(0, Math.min(size - 1, index));\nexport const first = clampIndex(-1, 4);',
    ],
  },
  {
    name: 'id-pattern',
    // The whole chain, so a hash or a counter written in base 36 passes.
    selectors: ["CallExpression[callee.property.name='toString'][arguments.0.value=36][callee.object.type='CallExpression'][callee.object.callee.object.name='Math'][callee.object.callee.property.name='random']"],
    message: 'Make the id with newId, or ids made together with newIds (src/app/utils/ids.ts).',
    why: 'An id written out again differs sooner or later in a separator or a length, and the next file copies the copy.',
    // Beside the helper, the ids of another format: other separators, a shorter random part, a time in base 36 or no prefix.
    owners: [
      'src/app/utils/ids.ts',
      'src/app/atlas-view.ts',
      'src/app/levels/levelEdits.ts',
      'src/app/packages/components/asset-manager/token-creator/previewItems.ts',
      'src/app/pixi/lighting/RoomEditor.ts',
      'src/app/react/components/ResponsiveWidgetBar.tsx',
      'src/app/react/components/dice/useDiceToasts.ts',
      'src/app/services/AssetService.ts',
      'src/app/services/assetImageFiles.ts',
      'src/app/snapshots/SceneSnapshotService.ts',
      'src/app/soundLibrary/MoodStore.ts',
      'src/app/stores/tabMetaStore.ts',
    ],
    ignores: ['src/app/online/protocol/**'],
    bad: [
      'export const wallId = (): string => `wall_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;',
      'export const suffix = (): string => Math.random().toString(36).substring(2, 8);',
    ],
    good: [
      "import { newId } from './utils/ids';\nexport const wallId = (): string => newId('wall');",
      "export const alias = (next: number): string => next.toString(36).padStart(4, '0');",
      'export const roll = (sides: number): number => Math.floor(Math.random() * sides) + 1;',
    ],
  },
  {
    name: 'test-code-imports',
    // ESLint reads no test file and nothing under `tests/`, so the rule holds for `main.ts` and the source under `src/`.
    selectors: importsOf(TEST_CODE),
    message: 'Move what the app needs into a source module, and let the test import it from there.',
    why: 'Test files and test helpers are not checked as the app is, and what the app imports from them is bundled into the plugin.',
    ignores: ['**/*.test.*', TEST_HELPERS],
    bad: [
      "import { seeded } from './measure/__tests__/areaTestKit';\nexport const random = seeded;",
      "import { fixture } from './grid/hexGeometry.test';\nexport const hexes = fixture;",
      "import { createApp } from '../../tests/mocks/obsidian';\nexport const app = createApp;",
      "export { seeded } from './measure/__tests__/areaTestKit';",
      "export * from './measure/__tests__/areaTestKit';",
      "export const kit = (): Promise<unknown> => import('./measure/__tests__/areaTestKit');",
    ],
    good: [
      "import { clamp } from './utils/math';\nexport const share = (value: number): number => clamp(value, 0, 1);",
      "import { latest } from './contests/latest';\nexport const newest = latest;",
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
  {
    name: 'restating-comments',
    // Judged by words alone (restatingWords.mjs), and only where no word of the comment is new: a
    // comment with one word the name lacks is left to its reader.
    create: restatingComments,
    fixable: 'code',
    message: 'This comment says what the name already says. Delete it, or say what the name cannot: a unit, a limit, a reason.',
    why: 'A comment that repeats its name is read every time and tells nothing, and among such comments the ones that give a reason are skipped too.',
    ignores: ['src/app/online/protocol/**', TEST_HELPERS, '**/*.d.ts'],
    bad: [
      'export interface Token {\n  /** The token id. */\n  tokenId: string;\n}',
      'export class Grid {\n  /** Set grid scale */\n  setGridScale(scale: number): void {\n    void scale;\n  }\n}',
      "export const first = 1;\n\n/**\n * Whether a path is absolute\n */\nexport function isAbsolutePath(path: string): boolean {\n  return path.startsWith('/');\n}",
      'export interface View {\n  isDragging: boolean;\n\n  // Selected ids\n  selectedIds: string[];\n}',
      'export const first = 1;\n/** Rooms per loop. */\nexport const ROOMS_PER_LOOP = 8;',
      'export const settings = {\n  /** The identifier of the token */ tokenId: 1,\n};',
      'export interface Token {\n  /** The token id. */\n  tokenId: string;\n  /** The token name. */\n  tokenName: string;\n}',
      'export interface Token {\n  // The token id\n  tokenId: string;\n  // Sizes are in cells.\n  tokenSize: number;\n}',
    ],
    good: [
      // A unit, a reason, a limit: one word the name lacks is enough.
      'export interface Token {\n  /** The token size in cells. */\n  tokenSize: number;\n}',
      'export interface Token {\n  /** The token ids, sorted so that two devices write the same file. */\n  tokenIds: string[];\n}',
      'export interface Token {\n  /** The hidden token id. */\n  tokenId: string;\n}',
      'export interface Token {\n  /** The token id, never empty. */\n  tokenId: string;\n}',
      'export interface Clip {\n  /** Clips to the floors. */\n  clipFloors(): void;\n}',
      // A tag, code or a number is for a tool or says something exact.
      'export interface Token {\n  /** @deprecated The token id. */\n  tokenId: string;\n}',
      'export interface Token {\n  /**\n   * The token id.\n   * @see Token\n   */\n  tokenId: string;\n}',
      'export interface Token {\n  /** The token id (`token_1`). */\n  tokenId: string;\n}',
      // Not on a declaration: trailing, heading a file, inside a body, a plain block.
      'export interface Token {\n  tokenId: string; // The token id\n}',
      "/** The token id. */\nexport const tokenId = 'token';",
      "export function tokenId(): string {\n  // The token id\n  const tokenId = 'token';\n  return tokenId;\n}",
      'export interface Token {\n  /* The token id. */\n  tokenId: string;\n}',
      // A label: one word, or a comment above members that have none of its kind.
      'export interface Item {\n  /** layout */\n  layout?: string;\n}',
      'export interface View {\n  // Token settings\n  tokenSettings: object;\n  tokenSize: number;\n}',
      'export interface View {\n  // Widget settings\n  widgetSettings: object;\n\n  widgetValues: object;\n}',
      'export interface View {\n  // Token settings\n  tokenSettings: object;\n  /** In cells. */\n  tokenSize: number;\n}',
      'export const view = {\n  /** Token settings */\n  tokenSettings: {},\n  tokenSize: 1,\n};',
      // A word the name only resembles: another number, another form, a longer spelling.
      'export interface Token {\n  /** The token ids. */\n  tokenId: string;\n}',
      'export interface Build {\n  /** The building id. */\n  buildId: string;\n}',
      'export interface Row {\n  /** Reference token. */\n  tokenRef: string;\n}',
      // A word that says how the names relate.
      'export interface Range {\n  /** Min or max. */\n  minMax: number;\n}',
      'export interface Token {\n  /** The class of the token. */\n  token: string;\n}',
      // More than one comment: the lines belong together.
      'export interface Token {\n  // The token id\n  // as the map file holds it.\n  tokenId: string;\n}',
    ],
  },
];
