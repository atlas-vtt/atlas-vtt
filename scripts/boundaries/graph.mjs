import fs from 'node:fs';
import path from 'node:path';
import { builtinModules } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const CODE = /\.[cm]?[jt]sx?$/;
const TEST = /(?:\/__tests__\/|\.(?:test|spec)\.)/;
const builtins = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const normalized = value => value.split(path.sep).join('/');
const sameList = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

/** Collect value, type, re-export, dynamic-import and CommonJS edges. */
function imports(source) {
  const edges = [];
  function add(node, literal) {
    edges.push({ specifier: literal && ts.isStringLiteralLike(literal) ? literal.text : null, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier) add(node, node.moduleSpecifier);
    } else if (ts.isImportTypeNode(node)) {
      add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null);
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      add(node, node.arguments[0]);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      add(node, node.moduleReference.expression);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const ref of source.referencedFiles) edges.push({ specifier: './' + ref.fileName, line: source.getLineAndCharacterOfPosition(ref.pos).line + 1 });
  for (const ref of source.typeReferenceDirectives) edges.push({ specifier: ref.fileName, line: source.getLineAndCharacterOfPosition(ref.pos).line + 1 });
  return edges;
}

function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
}

/** Audit the positive module boundary, including files not yet staged by the developer. */
export function checkBoundaries(root, manifest) {
  root = path.resolve(root);
  const violations = [];
  const files = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const code = [...new Set(files)].filter(file => CODE.test(file) && !TEST.test(file) && (file.startsWith('src/') || file === 'main.ts'));
  const memberships = new Map();
  const counts = { plugin: 0 };
  for (const [name, rule] of Object.entries(manifest.BOUNDARIES)) {
    counts[name] = 0;
    const matches = ts.sys.readDirectory(root, ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'], rule.exclude, rule.include);
    for (const match of matches) {
      const file = normalized(path.relative(root, match));
      if (memberships.has(file)) violations.push(`${file}:1  class overlap: ${memberships.get(file)}, ${name}`);
      memberships.set(file, name);
    }
  }
  const config = ts.readConfigFile(path.join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) return { violations: ['tsconfig.json:1  project cannot be read'], counts };
  const options = ts.parseJsonConfigFileContent(config.config, ts.sys, root).options;
  for (const file of code) {
    const owner = memberships.get(file) ?? 'plugin';
    counts[owner]++;
    if (owner === 'plugin') continue;
    const rule = manifest.BOUNDARIES[owner];
    const absolute = path.join(root, file);
    const source = ts.createSourceFile(absolute, fs.readFileSync(absolute, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const { specifier, line } of imports(source)) {
      const fail = message => violations.push(`${file}:${line}  ${specifier ?? '<computed>'}  ->  ${message}`);
      if (specifier === null) { fail('unresolved computed import'); continue; }
      const clean = specifier.split('?')[0];
      if (clean.startsWith('src/') || clean.startsWith('@/')) { fail('alias import; use a relative path'); continue; }
      const local = clean.startsWith('.');
      if (!local) {
        const name = packageName(clean);
        const allowed = rule.packages.some(entry => entry === name || (entry.endsWith('/*') && name.startsWith(entry.slice(0, -1))));
        if (clean.startsWith('node:') || builtins.has(clean) || !allowed) { fail('package not allowed'); continue; }
      }
      const assetPath = path.resolve(path.dirname(absolute), clean);
      if (local && !CODE.test(clean) && path.extname(clean)) {
        const relative = normalized(path.relative(root, assetPath));
        const allowed = manifest.ASSET_ROOTS.some(prefix => relative.startsWith(prefix)) || (/\.(?:scss|css)$/.test(clean) && path.dirname(assetPath) === path.dirname(absolute));
        if (!allowed) fail(`asset outside allowed roots: ${relative}`);
        else if (!fs.existsSync(assetPath)) fail(`unresolved asset: ${relative}`);
        continue;
      }
      const resolved = ts.resolveModuleName(clean, absolute, options, ts.sys).resolvedModule;
      if (!resolved) { fail('unresolved module'); continue; }
      if (!local && resolved.isExternalLibraryImport) continue;
      const target = normalized(path.relative(root, resolved.resolvedFileName));
      const targetClass = memberships.get(target) ?? 'plugin';
      if (!rule.mayImport.includes(targetClass)) fail(`class ${targetClass}: ${target}`);
    }
  }
  for (const [project, expected] of Object.entries(manifest.TYPE_PROJECTS)) {
    const actual = ts.readConfigFile(path.join(root, project), ts.sys.readFile);
    if (actual.error || !sameList(actual.config.include ?? [], expected.include) || !sameList(actual.config.exclude ?? [], expected.exclude)) {
      violations.push(`${project}:1  project membership differs from manifest`);
    }
  }
  return { violations, counts };
}
