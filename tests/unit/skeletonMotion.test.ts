import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A skeleton shows while the main thread loads what it stands for, so it may only move in ways
 * the compositor draws by itself: `transform` and `opacity`. Any other animated property (a
 * background, a size) is repainted by the busy main thread, and the skeleton stutters or stands still.
 */
const root = fileURLToPath(new URL('../..', import.meta.url));
const COMPOSITED = ['opacity', 'transform'];

function stylesheets(folder: string): string[] {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : stylesheets(file);
    return /\.scss$/.test(entry.name) ? [file] : [];
  });
}

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const SHEETS = ['src', 'styles'].flatMap((folder) => stylesheets(path.join(root, folder)))
  .map((file) => ({ name: path.relative(root, file), text: withoutComments(fs.readFileSync(file, 'utf8')) }));

/** The text between the brace at `open` and the brace that closes it. */
function block(text: string, open: number): string {
  let depth = 0;
  for (let at = open; at < text.length; at++) {
    if (text[at] === '{') depth++;
    else if (text[at] === '}' && --depth === 0) return text.slice(open + 1, at);
  }
  return text.slice(open + 1);
}

/** Every `@keyframes` of the stylesheets with the properties its steps set. */
const KEYFRAMES = new Map(SHEETS.flatMap(({ text }) => [...text.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)].map((match): [string, string[]] => {
  const steps = block(text, match.index + match[0].length - 1);
  return [match[1]!, [...new Set([...steps.matchAll(/([a-z-]+)\s*:[^;{}]+;/g)].map((property) => property[1]!))].sort()];
})));

/** The stylesheets of skeletons: the shared ones and each feature's own. */
const SKELETON_SHEETS = SHEETS.filter(({ name }) => /skeleton/i.test(path.basename(name)));

/**
 * What a declaration of `property` names first in each of its values: an animation's keyframes, a
 * transition's property. A value's arguments (`var(--phase, 0ms)`) hold commas of their own and are left out.
 */
function named(text: string, property: string): string[] {
  return [...text.matchAll(new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`, 'g'))]
    .flatMap((match) => match[1]!.replace(/\([^()]*\)/g, '').split(',').map((value) => value.trim().split(/\s+/)[0]!));
}

describe('skeletons', () => {
  it('move by transform and opacity alone in every keyframe animation named for them', () => {
    const skeletonFrames = [...KEYFRAMES].filter(([name]) => name.includes('skeleton'));
    expect(skeletonFrames.map(([name]) => name)).toEqual(expect.arrayContaining(['atlas-skeleton-breathe', 'atlas-skeleton-sweep']));
    const repainting = skeletonFrames.flatMap(([name, properties]) => properties.filter((property) => !COMPOSITED.includes(property)).map((property) => `${name} animates ${property}`));
    expect(repainting, 'A skeleton animates `transform` and `opacity` only: move the shape with a transform, or fade it, instead.').toEqual([]);
  });

  it('run no other animation and no other transition in their own stylesheets', () => {
    expect(SKELETON_SHEETS.map(({ name }) => name)).toEqual(expect.arrayContaining(['styles/_skeleton.scss', 'src/app/packages/components/primitives/skeleton.scss']));
    const others = SKELETON_SHEETS.flatMap(({ name, text }) => [
      ...named(text, 'animation').filter((animation) => animation !== 'none' && !(animation.includes('skeleton') && KEYFRAMES.has(animation))).map((animation) => `${name} runs the animation ${animation}`),
      ...named(text, 'transition').filter((property) => property !== 'none' && !COMPOSITED.includes(property)).map((property) => `${name} transitions ${property}`),
    ]);
    expect(others, "Give a skeleton's animation keyframes named `…skeleton…`, which the test above holds to `transform` and `opacity`, and let it transition those two alone.").toEqual([]);
  });
});
