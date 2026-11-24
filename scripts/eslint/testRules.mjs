/**
 * The hand-written rules of the test conventions (`testConventions.mjs`): what no selector can
 * say, because it needs the file's name, a count, or everything a test's function holds.
 */
import path from 'node:path';
import { asksEnvironment, asserts, assertingImports, calleeChain, captures, holds, mockedSpecifier, repositoryPath, resolvedSpecifier, runConditions, testCallback } from './testSyntax.mjs';

/** @typedef {import('eslint').Rule.RuleContext} Context */
/** @typedef {import('eslint').Rule.RuleListener} Listener */
/** @typedef {import('eslint').Rule.Node} Node */

const MESSAGE = { messageId: 'convention' };
const COMPARISONS = new Set(['toBe', 'toEqual', 'toStrictEqual']);
const CALLS = new Set(['CallExpression', 'NewExpression', 'TaggedTemplateExpression', 'AwaitExpression', 'YieldExpression', 'UpdateExpression', 'AssignmentExpression']);
const PURE_FOLDERS = /^src\/app\/(utils|gameSystems|resources)\//;
/** What lies in those folders and is not pure: React hooks, and the helpers that ask the workspace or move the DOM. */
const NOT_PURE = /\/(use[A-Z]\w*|activeLeafGuard|scrollWithin)(\.[cm]?[jt]sx?)?$/;
const MOCKS_ALLOWED = 6;
const TOLD_RETURNS = new Set(['mockReturnValue', 'mockReturnValueOnce', 'mockResolvedValue', 'mockResolvedValueOnce']);

/**
 * The name a helper is called by: a declared function, a function a constant holds, a method.
 * @param {Node} node A function.
 * @returns {string | null}
 */
function helperName(node) {
  if (node.type === 'FunctionDeclaration') return node.id?.name ?? null;
  const { parent } = node;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if ((parent.type === 'Property' || parent.type === 'MethodDefinition') && parent.value === node && parent.key.type === 'Identifier') return parent.key.name;
  return null;
}

/** @typedef {{ outcome: boolean, calls: Set<string> }} Body What a helper or a test holds: an outcome of its own, and the names it calls. */

/**
 * The names of the file's helpers that have an outcome, themselves or through another helper of the file.
 * @param {Map<string, Body>} helpers
 * @returns {Set<string>}
 */
function helpersWithOutcome(helpers) {
  const settled = new Set([...helpers].filter(([, helper]) => helper.outcome).map(([name]) => name));
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, helper] of helpers) {
      if (settled.has(name) || ![...helper.calls].some((called) => settled.has(called))) continue;
      settled.add(name);
      grew = true;
    }
  }
  return settled;
}

/**
 * A test without an outcome: it asserts nothing, and writes no picture or record for a person to
 * judge. A call of a helper the file defines counts where that helper has an outcome, itself or
 * through another helper of the file, so the file is judged once it is read. What is declared
 * only where the environment asks for it is a tool, run by hand for what it prints, and no test.
 * @param {Context} context
 * @returns {Listener}
 */
export function testAsserts(context) {
  const file = repositoryPath(context);
  /** @type {Map<string, Body>} */
  const helpers = new Map();
  /** @type {(Body & { call: import('estree').CallExpression })[]} */
  const tests = [];
  /** @type {{ node: Node, record: Body }[]} */
  const open = [];
  /** @type {Set<string>} The file's names for the imported helpers that assert. */
  const imported = new Set();
  /** @type {Set<string>} The file's constants that hold only where the environment asks. */
  const asking = new Set();
  return {
    ImportDeclaration(node) {
      for (const name of assertingImports(node, file)) imported.add(name);
    },
    VariableDeclarator(node) {
      if (node.parent.kind === 'const' && node.id.type === 'Identifier' && node.init && asksEnvironment(node.init, asking)) asking.add(node.id.name);
    },
    ':function'(/** @type {Node} */ node) {
      const name = helperName(node);
      if (name === null) return;
      const record = helpers.get(name) ?? { outcome: false, calls: new Set() };
      helpers.set(name, record);
      open.push({ node, record });
    },
    ':function:exit'(/** @type {Node} */ node) {
      if (open.at(-1)?.node === node) open.pop();
    },
    CallExpression(node) {
      const outcome = asserts(node, imported) || captures(node);
      const { root, names } = calleeChain(node.callee);
      const called = node.callee.type === 'Identifier' ? root : names.at(-1);
      for (const { record } of open) {
        if (outcome) record.outcome = true;
        else if (called) record.calls.add(called);
      }
      if (!testCallback(node) || runConditions(node).some((condition) => asksEnvironment(condition, asking))) return;
      const test = { call: node, outcome: false, calls: new Set() };
      tests.push(test);
      open.push({ node, record: test });
    },
    'CallExpression:exit'(node) {
      if (open.at(-1)?.node === node) open.pop();
    },
    'Program:exit'() {
      const settled = helpersWithOutcome(helpers);
      for (const test of tests) {
        if (!test.outcome && ![...test.calls].some((called) => settled.has(called))) context.report({ node: test.call.callee, ...MESSAGE });
      }
    },
  };
}

/**
 * `expect(a).toBe(a)` where nothing between the two readings can change `a`, and a literal
 * compared with a literal.
 * @param {Context} context
 * @returns {Listener}
 */
export function selfComparison(context) {
  const { sourceCode } = context;
  const isLiteral = (/** @type {Node} */ node) => node.type === 'Literal' || (node.type === 'TemplateLiteral' && node.expressions.length === 0);
  return {
    CallExpression(node) {
      const { callee } = node;
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || !COMPARISONS.has(callee.property.name)) return;
      const subject = callee.object;
      if (subject.type !== 'CallExpression' || subject.callee.type !== 'Identifier' || subject.callee.name !== 'expect') return;
      const [actual] = subject.arguments;
      const [expected] = node.arguments;
      if (!actual || !expected || actual.type === 'SpreadElement' || expected.type === 'SpreadElement') return;
      const literals = isLiteral(actual) && isLiteral(expected);
      const same = sourceCode.getText(actual) === sourceCode.getText(expected) && !holds(actual, CALLS, sourceCode);
      if (literals || same) context.report({ node, ...MESSAGE });
    },
  };
}

/** @param {Context} context @returns {Listener} */
export function mocksItsSubject(context) {
  if (!/\.test\.[cm]?[jt]sx?$/.test(context.filename)) return {};
  const subject = path.basename(context.filename).split('.')[0];
  return {
    CallExpression(node) {
      const specifier = mockedSpecifier(node);
      if (specifier === null) return;
      const target = path.posix.basename(specifier).replace(/\.[cm]?[jt]sx?$/, '');
      if (target === subject) context.report({ node, ...MESSAGE });
    },
  };
}

/** @param {Context} context @returns {Listener} */
export function pureModuleMock(context) {
  const file = repositoryPath(context);
  return {
    CallExpression(node) {
      const specifier = mockedSpecifier(node);
      if (specifier === null) return;
      const target = resolvedSpecifier(specifier, file);
      if (PURE_FOLDERS.test(target) && !NOT_PURE.test(target)) context.report({ node, ...MESSAGE });
    },
  };
}

/** @param {Context} context @returns {Listener} */
export function mockCount(context) {
  let mocks = 0;
  return {
    CallExpression(node) {
      const { root, names } = calleeChain(node.callee);
      if (node.callee.type !== 'MemberExpression' || root !== 'vi' || names.join('.') !== 'mock') return;
      mocks += 1;
      if (mocks > MOCKS_ALLOWED) context.report({ node, ...MESSAGE });
    },
  };
}

/**
 * What a mock was told to answer, as written: the arguments of `mockReturnValue` and its kin along
 * the chain a `vi.fn()` starts, and the body of `vi.fn(() => value)`.
 * @param {import('estree').Node} init
 * @param {import('eslint').SourceCode} sourceCode
 * @returns {string[]}
 */
function toldAnswers(init, sourceCode) {
  const answers = [];
  let node = init;
  while (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
    const { object, property } = node.callee;
    const [answer] = node.arguments;
    if (object.type === 'Identifier' && object.name === 'vi' && property.name === 'fn') {
      if (answer?.type === 'ArrowFunctionExpression' && answer.body.type !== 'BlockStatement') answers.push(sourceCode.getText(answer.body));
      return answers;
    }
    if (TOLD_RETURNS.has(property.name) && answer) answers.push(sourceCode.getText(answer));
    node = object;
  }
  return [];
}

/**
 * `const f = vi.fn().mockReturnValue(v); expect(f()).toBe(v)`: the mock itself is called inside
 * `expect(…)` and compared with what it was told to answer.
 * @param {Context} context
 * @returns {Listener}
 */
export function mockEcho(context) {
  const { sourceCode } = context;
  /** @type {Map<string, Set<string>>} */
  const told = new Map();
  return {
    VariableDeclarator(node) {
      if (node.id.type !== 'Identifier' || !node.init) return;
      const answers = toldAnswers(node.init, sourceCode);
      if (answers.length > 0) told.set(node.id.name, new Set(answers));
    },
    CallExpression(node) {
      const { callee } = node;
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || !COMPARISONS.has(callee.property.name)) return;
      const subject = callee.object.type === 'MemberExpression' ? callee.object.object : callee.object;
      if (subject.type !== 'CallExpression' || subject.callee.type !== 'Identifier' || subject.callee.name !== 'expect') return;
      const [given] = subject.arguments;
      const called = given?.type === 'AwaitExpression' ? given.argument : given;
      const [expected] = node.arguments;
      if (called?.type !== 'CallExpression' || called.callee.type !== 'Identifier' || !expected) return;
      if (told.get(called.callee.name)?.has(sourceCode.getText(expected))) context.report({ node, ...MESSAGE });
    },
  };
}
