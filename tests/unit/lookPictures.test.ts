import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';
import { LOOK_PICTURES } from '../../src/app/appearance/lookPictures';

// The build inlines the pictures into main.js: this is their budget.
const FOLDER = join(__dirname, '../../src/app/assets/looks');
const MAX_FILE_BYTES = 30 * 1024;

const files = readdirSync(FOLDER).filter((name) => name.endsWith('.webp'));

describe('the look cards\' pictures', () => {
  it('has a picture for each look and no file no card shows', () => {
    expect(Object.keys(LOOK_PICTURES).sort()).toEqual(['mediaeval', 'own', 'scifi']);
    expect(files.map((name) => name.replace(/\.webp$/, '')).sort()).toEqual(['mediaeval', 'own', 'scifi']);
  });

  it.each(files)('keeps %s within 30 KB', (name) => {
    expect(statSync(join(FOLDER, name)).size).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it.each(files)('stores %s at 480 × 300 px', async (name) => {
    expect(await imageDimensions(new Blob([readFileSync(join(FOLDER, name))]))).toEqual({ width: 480, height: 300 });
  });
});
