import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sass from 'sass';

export const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = /\.tsx?$/;
const TEST_FILE = /(\.test\.|__tests__)/;
/** A stylesheet named by a static or dynamic import, a re-export or a `require`. */
const STYLE_IMPORT = /(?:\bimport\b|\bfrom\b|\brequire\s*\()[\s(]*(['"])([^'"\n]+\.s?css)(?:\?[^'"\n]*)?\1/g;
/** Any statement that brings a stylesheet in, however it is written. */
const STYLE_STATEMENT = /\b(?:import|from|require)\b[^;\n]*?\.s?css\b[^;\n]*/g;

function scripts(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return scripts(file);
    return SCRIPT.test(entry.name) && !TEST_FILE.test(file) ? [file] : [];
  });
}

export interface Stylesheets { files: string[]; unread: string[] }

/** The stylesheets a script brings in, and its statements that bring one in where a test cannot follow them all. */
export function stylesheetsOf(script: string, source: string): Stylesheets {
  const imports = [...source.matchAll(STYLE_IMPORT)];
  const relative = imports.filter(([, , specifier = '']) => specifier.startsWith('.'));
  const statements = source.match(STYLE_STATEMENT) ?? [];
  const unread = statements.length === relative.length ? [] : statements;
  return {
    files: relative.map(([, , specifier = '']) => path.resolve(path.dirname(script), specifier)),
    unread: unread.map((statement) => `${path.relative(repoRoot, script)}: ${statement.trim()}`),
  };
}

/** Every stylesheet the build compiles: the ones the plugin's code imports. */
export function pluginStylesheets(): Stylesheets {
  const perScript = [path.join(repoRoot, 'main.ts'), ...scripts(path.join(repoRoot, 'src'))]
    .map((script) => stylesheetsOf(script, fs.readFileSync(script, 'utf8')));
  return {
    files: [...new Set(perScript.flatMap(({ files }) => files))],
    unread: perScript.flatMap(({ unread }) => unread),
  };
}

export const compiledStylesheet = (file: string): string =>
  (file.endsWith('.scss') ? sass.compile(file, { logger: sass.Logger.silent }).css : fs.readFileSync(file, 'utf8'));
