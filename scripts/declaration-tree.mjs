// Copies the declarations that some entry declarations reach, and nothing else, from an emitted tree into another.
// `tsc` emits a declaration for every module a program holds, Atlas's translations included, while the entries'
// types reach far fewer. Used for the extension API report (`api-report/`, package.json `api:report`) and the
// `@atlas-vtt/shared` package types (`build:packages`).
//
//   node scripts/declaration-tree.mjs <from> <to> [--no-translations] <entry>...
//
// Entries are paths without `.d.ts`, relative to <from>. <to> is emptied first.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SPECIFIERS = [
  /\bfrom\s*['"]([^'"]+)['"]/g, // import … from, export … from, export * from
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // import('…') type expressions
  /\bimport\s*['"]([^'"]+)['"]/g, // side-effect imports
  /\/\/\/\s*<reference\s+path\s*=\s*['"]([^'"]+)['"]/g, // triple-slash references
];

function declarationOf(from, specifier) {
  const target = resolve(dirname(from), specifier);
  const candidates = [`${target}.d.ts`, target.replace(/\.(m?js|tsx?)$/, '.d.ts'), join(target, 'index.d.ts'), target];
  return candidates.find((file) => file.endsWith('.d.ts') && existsSync(file) && statSync(file).isFile()) ?? null;
}

/** The declaration files under `root` that the entries' declarations reach, as paths relative to `root` with `/`. */
export function reachedDeclarations(root, entries) {
  const seen = new Set();
  const queue = entries.map((entry) => resolve(root, `${entry}.d.ts`));
  for (const file of queue) if (!existsSync(file)) throw new Error(`declaration-tree: ${relative(root, file)} was not emitted`);
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const pattern of SPECIFIERS) {
      for (const [, specifier] of text.matchAll(pattern)) {
        if (!specifier.startsWith('.')) continue; // a package (three, obsidian): not ours to copy
        const target = declarationOf(file, specifier);
        if (target) queue.push(target);
      }
    }
  }
  return [...seen].map((file) => relative(root, file).split(sep).join('/')).sort();
}

/**
 * Copies what the entries reach from `from` to `to`, emptied first. With `noTranslations`,
 * refuses a tree that reaches Atlas's translations, which no entry's types may name.
 */
export function copyDeclarationTree(from, to, entries, { noTranslations = false } = {}) {
  const files = reachedDeclarations(from, entries);
  const translations = files.filter((file) => file.startsWith('src/app/i18n/'));
  if (noTranslations && translations.length > 0) {
    throw new Error(`declaration-tree: the declarations reach Atlas's translations (${translations.join(', ')})`);
  }
  rmSync(to, { recursive: true, force: true });
  for (const file of files) {
    mkdirSync(dirname(join(to, file)), { recursive: true });
    copyFileSync(join(from, file), join(to, file));
  }
  return files;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const noTranslations = args.includes('--no-translations');
  const [from, to, ...entries] = args.filter((arg) => arg !== '--no-translations');
  if (!from || !to || entries.length === 0) {
    console.error('usage: node scripts/declaration-tree.mjs <from> <to> [--no-translations] <entry>...');
    process.exit(2);
  }
  try {
    const files = copyDeclarationTree(from, to, entries, { noTranslations });
    console.log(`declaration-tree: ${files.length} declaration files in ${to}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
