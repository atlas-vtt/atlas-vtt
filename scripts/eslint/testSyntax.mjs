/**
 * How a test file's syntax is read by the test conventions (`testRules.mjs`): which call is a
 * test, which call asserts, what a `vi.mock` names.
 */
import path from 'node:path';

/** @typedef {import('estree').Node} Node */
/** @typedef {import('estree').CallExpression} Call */

const TEST_ROOTS = new Set(['it', 'test']);
/** `it.each(rows)` and its kin return the function that takes the test; they are no test themselves. */
const TABLE_CALLS = new Set(['each', 'for', 'runIf', 'skipIf']);
const ASSERTING = /^(expect|assert|check|verify)(?![a-z])/;
const MOCKS = new Set(['mock', 'doMock']);
const FUNCTIONS = new Set(['ArrowFunctionExpression', 'FunctionExpression']);

/**
 * The identifier a callee starts from and the property names after it: `it.concurrent.each(rows)`
 * gives `it` with `concurrent` and `each`, `expect(a).not.toBe` gives `expect` with `not` and `toBe`.
 * @param {Node} callee
 * @returns {{ root: string | null, names: string[] }}
 */
export function calleeChain(callee) {
  const names = [];
  let node = callee;
  for (;;) {
    if (node.type === 'MemberExpression') {
      if (!node.computed && node.property.type === 'Identifier') names.unshift(node.property.name);
      node = node.object;
    } else if (node.type === 'CallExpression') node = node.callee;
    else if (node.type === 'TaggedTemplateExpression') node = node.tag;
    else break;
  }
  return { root: node.type === 'Identifier' ? node.name : null, names };
}

/**
 * The function a test runs, where `call` is `it(…)`, `test(…)` or one of their forms (`.each(rows)(…)`,
 * `.concurrent(…)`, `.skipIf(…)(…)`) and the function is written in place. Not `.todo`.
 * @param {Call} call
 * @returns {Node | null}
 */
export function testCallback(call) {
  const { callee } = call;
  const { root, names } = calleeChain(callee);
  if (root === null || !TEST_ROOTS.has(root) || names.includes('todo')) return null;
  if (callee.type === 'MemberExpression' && TABLE_CALLS.has(names.at(-1) ?? '')) return null;
  return call.arguments.find((argument) => FUNCTIONS.has(argument.type)) ?? null;
}

/**
 * Whether a call asserts: `expect(…)` and what hangs from it, `assert.equal(…)`, `fc.assert(…)`,
 * and a helper named for what it does (`expectRoom(…)`, `harness.checkInvariants()`).
 * @param {Call} call
 * @returns {boolean}
 */
export function asserts(call) {
  const { root, names } = calleeChain(call.callee);
  return ASSERTING.test(root ?? '') || ASSERTING.test(names.at(-1) ?? '');
}

/**
 * The module a `vi.mock(…)` or `vi.doMock(…)` replaces, as written: a string, or `import('…')`.
 * @param {Call} call
 * @returns {string | null}
 */
export function mockedSpecifier(call) {
  const { callee } = call;
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier' || callee.object.name !== 'vi') return null;
  if (callee.property.type !== 'Identifier' || !MOCKS.has(callee.property.name)) return null;
  const [target] = call.arguments;
  const named = target?.type === 'ImportExpression' ? target.source : target;
  return named?.type === 'Literal' && typeof named.value === 'string' ? named.value : null;
}

/**
 * A linted file's path from the repository's root, with forward slashes.
 * @param {import('eslint').Rule.RuleContext} context
 * @returns {string}
 */
export function repositoryPath(context) {
  return path.relative(context.cwd, context.filename).split(path.sep).join('/');
}

/**
 * Where a specifier leads, from the repository's root: a relative one from its file's folder,
 * any other as written (`src/app/…` is an alias of the folder of that name, as `@/app/…` is).
 * @param {string} specifier
 * @param {string} file The importing file, from the repository's root.
 * @returns {string}
 */
export function resolvedSpecifier(specifier, file) {
  return specifier.startsWith('.') ? path.posix.join(path.posix.dirname(file), specifier) : specifier.replace(/^@\//, 'src/');
}

/**
 * Whether any node of a subtree has one of the types.
 * @param {Node} node
 * @param {Set<string>} types
 * @param {import('eslint').SourceCode} sourceCode
 * @returns {boolean}
 */
export function holds(node, types, sourceCode) {
  if (types.has(node.type)) return true;
  return (sourceCode.visitorKeys[node.type] ?? []).some((key) => {
    const child = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (node))[key];
    const children = Array.isArray(child) ? child : [child];
    return children.some((entry) => entry !== null && typeof entry === 'object' && holds(/** @type {Node} */ (entry), types, sourceCode));
  });
}
