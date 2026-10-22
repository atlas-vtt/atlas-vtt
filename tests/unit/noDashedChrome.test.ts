import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Atlas' interface draws no dashed or dotted lines: an empty socket is a quiet fill, a drop
 * target a solid accent ring, a separator a solid hairline. Dashes on the map are PIXI's,
 * not a stylesheet's, and stay out of this.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const FOLDERS = ['src', 'styles'];
const STYLESHEET = /\.s?css$/;
/** A declaration that draws a line, whose value names a dashed or dotted style. */
const BROKEN_LINE = /(?:^|[;{\s])((?:border|outline|column-rule|text-decoration)[a-z-]*)\s*:[^;{}]*\b(dashed|dotted)\b/g;
const DASH_ARRAY = /\bstroke-dasharray\s*:/g;
const COMPONENT = /\.tsx$/;
/**
 * The online table log frames a whisper and a private roll in dashes, as chat clients mark what
 * only some see; it shows in the players' browsers too. Kept apart until that look is settled.
 */
const DASHED_BY_DESIGN = new Set(['src/app/online/tableLog/styles/_log-roll.scss', 'src/app/online/tableLog/styles/_log-speech.scss']);
/** An SVG stroke given a fixed dash pattern in a component; an arc drawn as one computed dash (a gauge's fill) is no dashed line. */
const DASH_PATTERN = /\bstrokeDasharray=\{?[^}\n]*['"`][\d.]+[\s,]+[\d.]+['"`]/g;

function filesIn(folder: string, kind: RegExp): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : filesIn(file, kind);
    return kind.test(entry.name) ? [file] : [];
  });
}

/** The text with its comments blanked out, so line numbers stay where they were. */
function withoutComments(text: string): string {
  const blank = (comment: string): string => comment.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/[^\n]*/g, (match, before: string) => before + blank(match.slice(before.length)));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

function brokenLines(file: string): string[] {
  const text = withoutComments(fs.readFileSync(file, 'utf8'));
  const where = (index: number): string => `${path.relative(root, file)}:${lineOf(text, index)}`;
  return [
    ...[...text.matchAll(BROKEN_LINE)].map((match) => `${where(match.index)} ${match[1]}: ${match[2]}`),
    ...[...text.matchAll(DASH_ARRAY)].map((match) => `${where(match.index)} stroke-dasharray`),
  ];
}

describe("the interface's stylesheets", () => {
  it('draw no dashed or dotted borders, outlines or separators', () => {
    const files = FOLDERS.flatMap((folder) => filesIn(path.join(root, folder), STYLESHEET))
      .filter((file) => !DASHED_BY_DESIGN.has(path.relative(root, file).split(path.sep).join('/')));
    expect(files.length).toBeGreaterThan(50);
    expect(files.flatMap(brokenLines)).toEqual([]);
  });

  it('notices a dashed border however it is written', () => {
    const scan = (css: string): number => [...withoutComments(css).matchAll(BROKEN_LINE)].length;
    expect(scan('.a { border: 1px dashed red; }')).toBe(1);
    expect(scan('.a {\n  outline: $w dotted var(--x);\n}')).toBe(1);
    expect(scan('.a { border-style: dashed }')).toBe(1);
    expect(scan('.a { border-bottom: 1px solid red; } // dashed once')).toBe(0);
  });
});

describe("the interface's components", () => {
  it('give no SVG stroke a dash pattern', () => {
    const files = filesIn(path.join(root, 'src'), COMPONENT);
    expect(files.length).toBeGreaterThan(50);
    const dashed = files.flatMap((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return [...text.matchAll(DASH_PATTERN)].map((match) => `${path.relative(root, file)}:${lineOf(text, match.index)}`);
    });
    expect(dashed).toEqual([]);
  });

  it('notices a dash pattern and leaves a gauge arc alone', () => {
    const scan = (tsx: string): number => [...tsx.matchAll(DASH_PATTERN)].length;
    expect(scan(`<circle strokeDasharray="4 5.6" />`)).toBe(1);
    expect(scan(`<circle strokeDasharray={dashed ? '4 5.6' : undefined} />`)).toBe(1);
    expect(scan('<circle strokeDasharray={`${length * fill} ${length}`} />')).toBe(0);
  });
});
