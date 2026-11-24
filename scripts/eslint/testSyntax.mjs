/**
 * How a test file's syntax is read by the test conventions (`testRules.mjs`): which call is a
 * test, which call asserts, which writes a picture, which test is a tool, what a `vi.mock` names.
 */
import path from 'node:path';

/** @typedef {import('estree').Node} Node */
/** @typedef {import('estree').CallExpression} Call */

const TEST_ROOTS = new Set(['it', 'test']);
/** `it.each(rows)` and its kin return the function that takes the test; they are no test themselves. */
const TABLE_CALLS = new Set(['each', 'for', 'runIf', 'skipIf']);
const ASSERTING = /^(expect|assert|check|verify)(?![a-z])/;
/** Helpers that assert under a name that does not say so, by the module that exports them. */
const ASSERTING_EXPORTS = new Map([['tests/helpers/visibilityTrials', new Set(['floor'])]]);
/**
 * What writes a picture or a record to disk for a person to judge: Vitest's two browser calls and
 * the harnesses' helper over them, each by its whole callee. `vault.adapter.writeFile(…)` is none.
 */
const CAPTURES = new Set(['savePng', 'page.screenshot', 'commands.writeFile']);
/** What a run is given by whoever starts it. Vite sets `DEV`, `MODE` and their kin in every run: they ask for nothing. */
const ASKED_VARIABLE = /^VITE_/;
const EQUALITIES = new Set(['==', '===']);
const ASKING_CASTS = new Set(['Boolean', 'Number']);
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
 * a helper named for what it does (`expectRoom(…)`, `harness.checkInvariants()`), and one of
 * `assertingImports` called by the name the file gave it.
 * @param {Call} call
 * @param {Set<string>} imported
 * @returns {boolean}
 */
export function asserts(call, imported) {
  const { root, names } = calleeChain(call.callee);
  if (call.callee.type === 'Identifier' && imported.has(call.callee.name)) return true;
  return ASSERTING.test(root ?? '') || ASSERTING.test(names.at(-1) ?? '');
}

/**
 * The names an import gives the helpers that assert without saying so (`ASSERTING_EXPORTS`).
 * @param {import('estree').ImportDeclaration} declaration
 * @param {string} file The importing file, from the repository's root.
 * @returns {string[]}
 */
export function assertingImports(declaration, file) {
  const exported = ASSERTING_EXPORTS.get(resolvedSpecifier(String(declaration.source.value), file));
  if (!exported) return [];
  return declaration.specifiers.flatMap((specifier) => (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier' && exported.has(specifier.imported.name) ? [specifier.local.name] : []));
}

/**
 * Whether a call writes a picture or a record for a person to judge (`CAPTURES`).
 * @param {Call} call
 * @returns {boolean}
 */
export function captures(call) {
  const { root, names } = calleeChain(call.callee);
  return root !== null && CAPTURES.has([root, ...names].join('.'));
}

/**
 * Whether an expression holds only where the environment asks for it: `import.meta.env.VITE_…`
 * or a constant of `asking`, as it stands, compared with a value, or made a number or a boolean.
 * Nothing negated: `!import.meta.env.VITE_QUICK` holds wherever nothing is set.
 * @param {Node} node
 * @param {Set<string>} asking The file's constants that hold only where the environment asks.
 * @returns {boolean}
 */
export function asksEnvironment(node, asking) {
  const asks = (/** @type {Node} */ part) => asksEnvironment(part, asking);
  const unset = (/** @type {Node} */ part) => part.type === 'Literal' && !part.value;
  switch (node.type) {
    case 'Identifier': return asking.has(node.name);
    case 'MemberExpression': {
      const { object, property } = node;
      const variable = !node.computed && property.type === 'Identifier' && ASKED_VARIABLE.test(property.name);
      return variable && object.type === 'MemberExpression' && object.object.type === 'MetaProperty' && object.property.type === 'Identifier' && object.property.name === 'env';
    }
    case 'BinaryExpression': {
      const { operator, right } = node;
      if (right.type !== 'Literal' || !asks(node.left)) return false;
      // Above a number, or equal to a value an unset variable cannot have, also after `?? 0`.
      return operator === '>' ? typeof right.value === 'number' : EQUALITIES.has(operator) && Boolean(right.value);
    }
    case 'LogicalExpression': return node.operator === '&&' ? asks(node.left) || asks(node.right) : asks(node.left) && unset(node.right);
    case 'CallExpression': {
      const [value] = node.arguments;
      return node.callee.type === 'Identifier' && ASKING_CASTS.has(node.callee.name) && value !== undefined && value.type !== 'SpreadElement' && asks(value);
    }
    default: return false;
  }
}

/**
 * The conditions a test is declared under, as its file writes them: `.runIf(…)` on the test and on
 * the suites around it, and every `if (…)` it stands inside, not in its `else`.
 * @param {import('eslint').Rule.Node} call A test's call.
 * @returns {Node[]}
 */
export function runConditions(call) {
  const conditions = [];
  for (let inner = null, node = call; node; inner = node, node = node.parent) {
    if (node.type === 'IfStatement' && node.consequent === inner) conditions.push(node.test);
    if (node.type === 'CallExpression' && node.callee.type === 'CallExpression' && calleeChain(node.callee.callee).names.at(-1) === 'runIf') conditions.push(...node.callee.arguments.slice(0, 1));
  }
  return conditions;
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
