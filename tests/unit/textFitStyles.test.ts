import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A box that keeps its text on one line (`white-space: nowrap`) and may still be made narrower than that text
 * (`min-width: 0`) paints the text past its edge, over whatever lies beside it: the dice lab's "Explodierende
 * Würfel" ran under its dropdown. Such a box must clip (`overflow: hidden`, or `atlas-truncate` for an
 * ellipsis), or let its text wrap (`atlas-row-label` for a setting's name beside its control).
 * The browser test `textFitLanguages.gpu.test.ts` measures the surfaces in every language; this check runs in CI.
 */
const ROOTS = ['src', 'styles'];
const CLIPS = /overflow(-x)?\s*:\s*(hidden|clip)|@include\s+atlas-(truncate|line-clamp)\b/;

function scssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : scssFiles(path);
    return path.endsWith('.scss') ? [path] : [];
  });
}

/** Each rule's own declarations (nested rules left out) with the line its block opens on. */
function ownDeclarations(source: string): Array<{ line: number; selector: string; declarations: string }> {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
  const blocks: Array<{ line: number; selector: string; declarations: string }> = [];
  const open: Array<{ line: number; selector: string; declarations: string }> = [];
  let pending = '';
  let line = 1;
  for (const char of text) {
    if (char === '\n') line++;
    if (char === '{') {
      open.push({ line, selector: pending.trim().split('\n').pop()!.trim(), declarations: '' });
      pending = '';
    } else if (char === '}') {
      const block = open.pop();
      if (block) blocks.push({ ...block, declarations: block.declarations + pending });
      pending = '';
    } else if (char === ';') {
      if (open.length > 0) open[open.length - 1]!.declarations += `${pending};`;
      pending = '';
    } else {
      pending += char;
    }
  }
  return blocks;
}

describe('one-line text never runs out of its box', () => {
  it('clips or wraps wherever a box keeps its text on one line and may be narrower than it', () => {
    const offenders = ROOTS.flatMap(scssFiles).flatMap((file) =>
      ownDeclarations(readFileSync(file, 'utf8'))
        .filter(({ declarations }) =>
          /white-space\s*:\s*nowrap/.test(declarations) && /min-width\s*:\s*0\b/.test(declarations) && !CLIPS.test(declarations))
        .map(({ line, selector }) => `${relative(process.cwd(), file)}:${line} ${selector}`));
    expect(offenders).toEqual([]);
  });
});
