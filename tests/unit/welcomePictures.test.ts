import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';

// The build inlines the pictures into main.js: these are their budgets.
const FOLDER = join(__dirname, '../../src/app/assets/welcome');
const SWORD = join(__dirname, '../../src/app/assets/brand/sword.webp');
const SLIDES = ['dice', 'maps', 'online', 'players', 'statblocks', 'welcome'];

const dimensions = (file: string): Promise<{ width: number; height: number }> => imageDimensions(new Blob([readFileSync(file)]));

describe('the welcome wizard\'s pictures', () => {
  it('holds a picture for every slide and Atlas Sidebar, and no other file', () => {
    expect(readdirSync(FOLDER).sort()).toEqual([...SLIDES, 'sidebar'].sort().map((name) => `${name}.webp`));
  });

  it.each(SLIDES)('keeps the %s slide at 1280 × 800 px within 80 KB', async (name) => {
    const file = join(FOLDER, `${name}.webp`);
    expect(statSync(file).size).toBeLessThanOrEqual(80 * 1024);
    expect(await dimensions(file)).toEqual({ width: 1280, height: 800 });
  });

  it('keeps the Atlas Sidebar picture at 960 × 600 px within 60 KB', async () => {
    const file = join(FOLDER, 'sidebar.webp');
    expect(statSync(file).size).toBeLessThanOrEqual(60 * 1024);
    expect(await dimensions(file)).toEqual({ width: 960, height: 600 });
  });

  it('keeps the sword on the welcome slide within 60 KB', () => {
    expect(statSync(SWORD).size).toBeLessThanOrEqual(60 * 1024);
  });
});
