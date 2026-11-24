/**
 * `atlas/restating-comments`: a comment that stands on a declaration and says only what its name
 * says. The words are judged in `restatingWords.mjs`; this module finds the comments that may be
 * judged at all and removes one with its line.
 */
import { isRestating } from './restatingWords.mjs';

/** @typedef {import('eslint').SourceCode} SourceCode */
/** @typedef {import('estree').Comment & { range: [number, number], loc: import('estree').SourceLocation }} Comment */
/** @typedef {{ type: string, range: [number, number], loc: import('estree').SourceLocation, parent?: AnyNode, [key: string]: any }} AnyNode */
/** @typedef {{ comment: Comment, name: string, text: string, range: [number, number] }} Restating */

const EXPORTS = new Set(['ExportNamedDeclaration', 'ExportDefaultDeclaration']);
/** Declared where a module's or a namespace's statements stand; inside a body a comment may head the statements after it. */
const TOP_LEVEL = new Set(['FunctionDeclaration', 'TSDeclareFunction', 'ClassDeclaration', 'TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'VariableDeclaration']);
const MEMBERS = new Set([
  'PropertyDefinition', 'MethodDefinition', 'TSAbstractPropertyDefinition', 'TSAbstractMethodDefinition', 'AccessorProperty',
  'TSPropertySignature', 'TSMethodSignature', 'TSEnumMember', 'Property', 'TSParameterProperty',
]);

/**
 * @param {AnyNode | null | undefined} key
 * @returns {string | null}
 */
function keyName(key) {
  if (key?.type === 'Identifier' || key?.type === 'PrivateIdentifier') return key.name;
  return key?.type === 'Literal' && typeof key.value === 'string' ? key.value : null;
}

/**
 * The name a declaration declares, where it declares exactly one.
 * @param {AnyNode | null | undefined} node
 * @returns {string | null}
 */
export function declaredName(node) {
  if (!node) return null;
  if (EXPORTS.has(node.type)) return declaredName(node.declaration);
  if (TOP_LEVEL.has(node.type)) {
    const holder = EXPORTS.has(node.parent?.type ?? '') ? node.parent?.parent : node.parent;
    if (holder?.type !== 'Program' && holder?.type !== 'TSModuleBlock') return null;
    if (node.type !== 'VariableDeclaration') return keyName(node.id);
    return node.declarations.length === 1 ? keyName(node.declarations[0].id) : null;
  }
  if (!MEMBERS.has(node.type) || node.computed) return null;
  if (node.type === 'Property' && node.parent?.type !== 'ObjectExpression') return null;
  if (node.type === 'TSParameterProperty') return keyName(node.parameter.type === 'AssignmentPattern' ? node.parameter.left : node.parameter);
  return keyName(node.key ?? node.id);
}

/**
 * The outermost node that begins at an index: the declaration a token opens, if it opens one.
 * @param {SourceCode} sourceCode
 * @param {number} index
 * @returns {AnyNode | null}
 */
function nodeStartingAt(sourceCode, index) {
  /** @type {AnyNode | null} */
  let node = sourceCode.getNodeByRangeIndex(index);
  if (!node || node.range[0] !== index) return null;
  while (node.parent && node.parent.type !== 'Program' && node.parent.range[0] === index) node = node.parent;
  return node;
}

/** @param {Comment} comment */
const textOf = (comment) => (comment.type === 'Line' ? comment.value : comment.value.slice(1).replace(/^\s*\*+/gm, ''));

/**
 * Whether a comment can only belong to the declaration under it: the block ends after the
 * declaration, or what follows has a comment of the same kind, a `//` line after a `//` line and a
 * JSDoc block after a JSDoc block. Above members without one it may name the group.
 * @param {SourceCode} sourceCode
 * @param {Comment} comment
 * @param {AnyNode} declaration
 * @returns {boolean}
 */
function standsAlone(sourceCode, comment, declaration) {
  const next = sourceCode.lines.slice(declaration.loc.end.line).find((line) => line.trim() !== '');
  if (next === undefined || /^\s*[})\]]/.test(next)) return true;
  return (comment.type === 'Line' ? /^\s*\/\// : /^\s*\/\*\*/).test(next);
}

/**
 * The declaration a comment stands on: the comment begins its line, no other comment touches it,
 * and the declaration follows on the same or the next line.
 * @param {SourceCode} sourceCode
 * @param {Comment} comment
 * @returns {AnyNode | null}
 */
function declarationUnder(sourceCode, comment) {
  if (comment.type === 'Block' && !comment.value.startsWith('*')) return null;
  const before = sourceCode.getTokenBefore(comment, { includeComments: true });
  const after = sourceCode.getTokenAfter(comment, { includeComments: true });
  if (!before || !after || after.type === 'Block' || after.type === 'Line') return null;
  if (before.loc.end.line === comment.loc.start.line || after.loc.start.line > comment.loc.end.line + 1) return null;
  if ((before.type === 'Block' || before.type === 'Line') && before.loc.end.line === comment.loc.start.line - 1) return null;
  const declaration = nodeStartingAt(sourceCode, after.range[0]);
  return declaration && standsAlone(sourceCode, comment, declaration) ? declaration : null;
}

/**
 * What removing a comment removes: its lines whole where it stands alone on them, else the comment
 * and the space up to the declaration on its line.
 * @param {SourceCode} sourceCode
 * @param {Comment} comment
 * @returns {[number, number]}
 */
export function removalRange(sourceCode, comment) {
  const { text } = sourceCode;
  const lineStart = text.lastIndexOf('\n', comment.range[0] - 1) + 1;
  const rest = /^[^\S\n]*(\n?)/.exec(text.slice(comment.range[1]));
  const end = comment.range[1] + (rest?.[0].length ?? 0);
  return rest?.[1] === '\n' || end === text.length ? [lineStart, end] : [comment.range[0], end];
}

/**
 * Every comment of a file that only repeats the name it stands on.
 * @param {SourceCode} sourceCode
 * @returns {Restating[]}
 */
export function restatingComments(sourceCode) {
  /** @type {Restating[]} */
  const found = [];
  for (const comment of /** @type {Comment[]} */ (sourceCode.getAllComments())) {
    const name = declaredName(declarationUnder(sourceCode, comment));
    const text = textOf(comment).replace(/\s+/g, ' ').trim();
    if (name !== null && isRestating(text, name)) found.push({ comment, name, text, range: removalRange(sourceCode, comment) });
  }
  return found;
}

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @returns {import('eslint').Rule.RuleListener}
 */
export function create(context) {
  return {
    Program() {
      for (const { comment, range } of restatingComments(context.sourceCode)) {
        context.report({ loc: comment.loc, messageId: 'convention', fix: (fixer) => fixer.removeRange(range) });
      }
    },
  };
}
