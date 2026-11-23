import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';

// The build inlines the picture into main.js: this is its budget.
const SIDEBAR = join(__dirname, '../../src/app/assets/welcome/sidebar.webp');
const MAX_FILE_BYTES = 60 * 1024;

describe('the welcome wizard\'s Atlas Sidebar picture', () => {
  it('keeps within 60 KB', () => {
    expect(statSync(SIDEBAR).size).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it('is stored at 960 × 600 px', async () => {
    expect(await imageDimensions(new Blob([readFileSync(SIDEBAR)]))).toEqual({ width: 960, height: 600 });
  });
});
