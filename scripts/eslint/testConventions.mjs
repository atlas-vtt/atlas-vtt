/**
 * The conventions of test files, one named rule each (`atlas/test-<name>`, built by
 * `atlasPlugin.mjs`), in the shape of `conventions.mjs`. `npm run lint:tests` holds the tests to
 * them (`testsConfig.mjs`): without type information, so each is a reading of the syntax.
 *
 * A test is worth its place only if a mistake in the code can make it fail. Each entry names one
 * way a test loses that: it asserts nothing, compares a value with itself, or runs its own
 * stand-ins in the code's place.
 */
import { mockCount, mockEcho, mocksItsSubject, pureModuleMock, selfComparison, testAsserts } from './testRules.mjs';

/** @typedef {import('./conventions.mjs').Convention} Convention */

const VI_MOCK = "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock)$/]";
const RUNNERS = '/^(it|test|describe|suite|bench)$/';
const HOST_OBJECTS = '/^(globalThis|global|window|self|document|navigator|process)$/';
const HOST_CLASSES = '/^(HTML\\w*|SVG\\w*|Element|Node|Document|Window)$/';

/** @type {Convention[]} */
export const TEST_CONVENTIONS = [
  {
    name: 'test-asserts',
    create: testAsserts,
    message: "Assert what the code did: `expect(…)`, or `expect(() => …).not.toThrow()` where not throwing is the point. Two things need none, and show it: a test that writes its picture or record for a person to judge (`savePng(…)`, `page.screenshot(…)`, `commands.writeFile(…)`), and a tool declared only where the environment asks for it (`it.runIf(import.meta.env.VITE_…)`, `if (import.meta.env.VITE_… === 'print') { … }`).",
    why: 'A test without an assertion passes whatever the code does, short of throwing.',
    bad: [
      "it('loads the scene', async () => {\n  await loadScene('a');\n});",
      "test.each([1, 2])('rounds %d', (value) => {\n  round(value);\n});",
      "it.concurrent('saves', async function () {\n  await save();\n});",
      "const opened = (id: string): Promise<void> => loadScene(id);\nit('loads the scene', async () => {\n  await opened('a');\n});",
      // What a test prints is no outcome: nobody reads the log of a run that passed.
      "it('measures the draw', () => {\n  console.log(`${cost(draw)} ms`);\n});",
      // A capture is told by its whole callee: writing a note is none, nor is a method that happens to share the name.
      "it('writes the note', async () => {\n  await vault.adapter.writeFile('a.md', text);\n});",
      "it('draws the toolbar', async () => {\n  await toolbar.screenshot();\n});",
      // `floor` asserts where it comes from tests/helpers/visibilityTrials, and under no other object.
      "import { floor } from '../helpers/rounding';\nit('rounds down', () => {\n  floor(scale(3));\n});",
      "import { floor } from '../helpers/visibilityTrials';\nit('rounds down', () => {\n  Math.floor(scale(3));\n});",
      // No tools: Vite sets `DEV` in every run, a negated variable and one compared with its fallback hold where nothing is set, and the `else` is what runs unasked.
      "it.runIf(import.meta.env.DEV)('prints the speed', () => {\n  console.log(speed());\n});",
      "it.runIf(!import.meta.env.VITE_QUICK)('prints the speed', () => {\n  console.log(speed());\n});",
      "const MEGAPIXELS = Number(import.meta.env.VITE_BENCH_MP ?? 0);\nit.runIf(MEGAPIXELS === 0)('prints the speed', () => {\n  console.log(speed());\n});",
      "it.skipIf(process.platform === 'win32')('prints the speed', () => {\n  console.log(speed());\n});",
      "if (import.meta.env.VITE_STATS === 'print') {\n  it('prints the numbers', () => {\n    console.log(stats());\n  });\n} else {\n  it('keeps the rule', () => {\n    problems();\n  });\n}",
    ],
    good: [
      "it('loads the scene', async () => {\n  expect(await loadScene('a')).toEqual({ id: 'a' });\n});",
      "it('keeps the invariants', () => {\n  fc.assert(fc.property(fc.integer(), (seed) => holdsFor(seed)));\n});",
      "it('opens the room', () => {\n  expectRoomOpen(build());\n});",
      "it('keeps the grid', () => {\n  harness.checkInvariants();\n});",
      // A helper of the file that asserts, itself or through another, is an assertion where it is called.
      "it('adds', () => {\n  bothNear(add(0.1, 0.2), 0.3);\n});\nconst near = (a: number, b: number): void => {\n  expect(Math.abs(a - b)).toBeLessThan(1e-6);\n};\nfunction bothNear(a: number, b: number): void {\n  near(a, b);\n  near(b, a);\n}",
      "import { floor } from '../helpers/visibilityTrials';\nit('meets every reason to cast again', () => {\n  floor(tally, 'passing runs', 0.2);\n});",
      "it.todo('moves the token');",
      "it.each(cases)('reads %s', readsCase);",
      // A picture or a record written for a person to judge is the outcome of the test that writes it, also through a helper of the file.
      "it('draws the cave', async () => {\n  await savePng(drawCave(), 'cave');\n});",
      "it('shows the empty page', async () => {\n  await page.screenshot({ path: 'sound-empty.png' });\n});",
      "it('records the cost of the ground', async () => {\n  await commands.writeFile('out/cost.txt', costs().join('\\n'));\n});",
      "async function savePixels(pixels: Uint8ClampedArray, name: string): Promise<void> {\n  await savePng(canvasOf(pixels), name);\n}\nit('lights the room', async () => {\n  await savePixels(frame(), 'room');\n});",
      // A tool, declared only where the environment asks for it: run by hand for what it prints.
      "it.runIf(import.meta.env.VITE_BENCH === '1')('prints the speed', () => {\n  console.log(speed());\n});",
      "const MEGAPIXELS = Number(import.meta.env.VITE_BENCH_MP ?? 0);\nit.runIf(MEGAPIXELS > 0)('prints the speed', () => {\n  console.log(speed(MEGAPIXELS));\n});",
      "describe('the chimneys', () => {\n  if (import.meta.env.VITE_CHIMNEY_STATS === 'print') {\n    it('prints their numbers', () => {\n      console.log(stats());\n    });\n    return;\n  }\n  it('keep the rule', () => {\n    expect(problems()).toEqual([]);\n  });\n});",
    ],
  },
  {
    name: 'test-self-comparison',
    create: selfComparison,
    message: 'Compare what the code returned with the value you expect, written out.',
    why: 'A value compared with itself, or a literal with a literal, is equal whatever the code does.',
    bad: [
      "it('keeps the token', () => {\n  expect(token.name).toBe(token.name);\n});",
      "it('runs', () => {\n  expect(true).toBe(true);\n});",
      "it('keeps the list', () => {\n  expect(state.tokens).toEqual(state.tokens);\n});",
    ],
    good: [
      "it('keeps the token', () => {\n  expect(token.name).toBe('Goblin');\n});",
      "it('answers anew each time', () => {\n  expect(nextId()).not.toBe(nextId());\n});",
      "it('builds the same list twice', () => {\n  expect(build()).toEqual(build());\n});",
    ],
  },
  {
    name: 'test-mocks-its-subject',
    create: mocksItsSubject,
    message: 'Leave the module a test file is named for as it is, and replace only what it reaches for.',
    why: 'A test that replaces its own subject tests the replacement.',
    filename: 'tests/unit/sceneLoader.test.ts',
    bad: ["vi.mock('../../src/app/services/sceneLoader', () => ({ loadScene: vi.fn() }));", "vi.doMock('../../src/app/services/sceneLoader.ts');"],
    good: ["vi.mock('../../src/app/services/sceneFiles', () => ({ readScene: vi.fn() }));"],
  },
  {
    name: 'test-obsidian-mock',
    selectors: [`${VI_MOCK}[arguments.0.value='obsidian']`],
    message: "Leave `obsidian` to the alias, which already supplies tests/mocks/obsidian.ts, and extend that mock with what the test drives.",
    why: 'An inline copy of Obsidian drifts from the shared one, and each file then tests against an Obsidian of its own.',
    bad: ["vi.mock('obsidian', () => ({ Notice: class {} }));", "vi.mock('obsidian');"],
    good: ["import { Notice } from 'obsidian';\nit('tells the GM', () => {\n  expect(new Notice('Saved')).toBeDefined();\n});"],
  },
  {
    name: 'test-pure-module-mock',
    create: pureModuleMock,
    message: 'Call the real module: what lies under src/app/utils/, src/app/gameSystems/ and src/app/resources/ is pure, but for React hooks and the helpers `NOT_PURE` names (scripts/eslint/testRules.mjs).',
    why: 'A stand-in for a pure function only repeats what the test believes the function does.',
    bad: [
      "vi.mock('../../src/app/utils/conditionValues', () => ({ conditionValue: () => 2 }));",
      "vi.mock('src/app/gameSystems/diceRules');",
      "vi.mock('../../src/app/resources/resourceValues', async (original) => ({ ...(await original()), spent: () => true }));",
    ],
    good: [
      "vi.mock('../../src/app/services/AssetService');",
      "vi.mock('./utils/render');",
      "vi.mock('../../src/app/resources/useMapResources', () => ({ useMapResources: () => [] }));",
      "vi.mock('../../src/app/utils/activeLeafGuard', () => ({ isActiveAtlasLeaf: () => true }));",
    ],
  },
  {
    name: 'test-mock-count',
    create: mockCount,
    message: 'Test the logic in a pure function, or render with the shared helpers, instead of adding one more `vi.mock`.',
    why: 'A test that needs more than six stand-ins tests its mocks.',
    bad: [Array.from({ length: 7 }, (_, index) => `vi.mock('../../src/app/services/part${index}');`).join('\n')],
    good: [Array.from({ length: 6 }, (_, index) => `vi.mock('../../src/app/services/part${index}');`).join('\n')],
  },
  {
    name: 'test-focused',
    selectors: [
      `MemberExpression[property.name=/^(only|skip)$/][object.name=${RUNNERS}]`,
      `MemberExpression[property.name=/^(only|skip)$/][object.type='MemberExpression'][object.object.name=${RUNNERS}]`,
    ],
    message: 'Remove `.only` and `.skip`: fix the test or delete it, and write `it.todo` for one still to be written.',
    why: 'A focused test switches every other test of its file off and a skipped one is never run, while both read as passing.',
    bad: [
      "it.only('moves', () => {\n  expect(move()).toBe(1);\n});",
      "describe.skip('the grid', () => {});",
      "test.concurrent.only('moves', () => {\n  expect(move()).toBe(1);\n});",
      "it.skip.each([1])('moves %d', (step) => {\n  expect(move(step)).toBe(1);\n});",
    ],
    good: [
      "it.skipIf(process.platform === 'win32')('reads the link', () => {\n  expect(read()).toBe(1);\n});",
      "it.todo('moves');",
      "it('skips nothing', (context) => {\n  context.skip();\n  expect(1 + 1).toBe(2);\n});",
    ],
  },
  {
    name: 'test-private-access',
    // Not what a test sets on the host (`globalThis`, an element's prototype): that is no member of the code under test.
    selectors: [`MemberExpression[object.type='TSAsExpression'][object.typeAnnotation.type='TSAnyKeyword']:not([object.expression.name=${HOST_OBJECTS}]):not([object.expression.object.name=${HOST_CLASSES}])`],
    message: 'Test through the public surface, or export the piece that needs testing.',
    why: 'A test that reaches a private member through `as any` breaks with every refactoring that keeps the behaviour, and the compiler no longer says where.',
    ignores: ['tests/mocks/**'],
    bad: [
      "it('counts', () => {\n  expect((service as any).cache.size).toBe(1);\n});",
      "it('flushes', () => {\n  (writer as any).flushNow();\n  expect(writer.pending).toBe(0);\n});",
      "it('sizes', () => {\n  (TokenRenderer.prototype as any).updateSizes.call(harness);\n  expect(harness.size).toBe(70);\n});",
    ],
    good: [
      "it('counts', () => {\n  expect(service.cachedCount()).toBe(1);\n});",
      "it('observes', () => {\n  (globalThis as any).ResizeObserver = class {};\n  expect(mount()).toBeDefined();\n});",
      "it('empties', () => {\n  (HTMLElement.prototype as any).empty = function empty(): void {};\n  expect(mount()).toBeDefined();\n});",
    ],
  },
  {
    name: 'test-mock-echo',
    create: mockEcho,
    message: 'Call the code that uses the mock and assert what that code made of its answer.',
    why: 'A mock called inside `expect(…)` and compared with the value it was told to return can only agree with itself.',
    bad: [
      "it('reads', () => {\n  const read = vi.fn().mockReturnValue(42);\n  expect(read()).toBe(42);\n});",
      "it('loads', async () => {\n  const load = vi.fn().mockResolvedValue(scene);\n  expect(await load('a')).toEqual(scene);\n});",
      "it('reads', () => {\n  const read = vi.fn(() => 'a');\n  expect(read()).toBe('a');\n});",
    ],
    good: ["it('reads', () => {\n  const read = vi.fn().mockReturnValue(42);\n  expect(double(read)).toBe(84);\n  expect(read).toHaveBeenCalledOnce();\n});"],
  },
];
