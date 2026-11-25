import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';

// The build inlines the pictures into main.js: these are their budgets.
const FOLDER = join(__dirname, '../../src/app/assets/welcome');
const SWORD = join(__dirname, '../../src/app/assets/brand/sword.webp');
const SLIDES = ['dice', 'generator', 'maps', 'players', 'sound', 'tokens', 'welcome', 'yours'];
// The guides behind the help page, in a dark and a light scheme.
const HELP = ['help-dark', 'help-light'];

const dimensions = (file: string): Promise<{ width: number; height: number }> => imageDimensions(new Blob([readFileSync(file)]));

describe('the welcome wizard\'s pictures', () => {
  it('holds a picture for every slide and the help page, and no other file', () => {
    expect(readdirSync(FOLDER).sort()).toEqual([...SLIDES, ...HELP].sort().map((name) => `${name}.webp`));
  });

  it.each(SLIDES)('keeps the %s slide at 1280 × 800 px within 80 KB', async (name) => {
    const file = join(FOLDER, `${name}.webp`);
    expect(statSync(file).size).toBeLessThanOrEqual(80 * 1024);
    expect(await dimensions(file)).toEqual({ width: 1280, height: 800 });
  });

  it.each(HELP)('keeps the %s picture behind the help page at 1280 × 800 px within 80 KB', async (name) => {
    const file = join(FOLDER, `${name}.webp`);
    expect(statSync(file).size).toBeLessThanOrEqual(80 * 1024);
    expect(await dimensions(file)).toEqual({ width: 1280, height: 800 });
  });

  it('keeps the sword on the welcome slide within 60 KB', () => {
    expect(statSync(SWORD).size).toBeLessThanOrEqual(60 * 1024);
  });
});
