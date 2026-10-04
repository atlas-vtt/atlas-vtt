// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';
import { TOOLBAR_SCREENSHOTS } from '../../src/app/packages/components/toolbar/toolbarScreenshots';
import { TOOLBAR_CONTROLS } from '../../src/app/toolbar/toolbarCatalog';

// The build inlines every screenshot into main.js, and CI has no bundle budget: this is it.
const FOLDER = join(__dirname, '../../src/app/assets/toolbar');
const MAX_FILE_BYTES = 40 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024;

const files = readdirSync(FOLDER).filter((name) => name.endsWith('.webp'));

describe('the toolbar editor\'s screenshots', () => {
  it('has a screenshot for every control but ambient sound, and no file the card never shows', () => {
    const withScreenshot = TOOLBAR_CONTROLS.map((control) => control.id).filter((id) => TOOLBAR_SCREENSHOTS[id] !== null);
    expect(withScreenshot).toEqual(TOOLBAR_CONTROLS.map((control) => control.id).filter((id) => id !== 'audio'));
    expect(files.map((name) => name.replace(/\.webp$/, '')).sort()).toEqual([...withScreenshot].sort());
  });

  it.each(files)('keeps %s within 40 KB', (name) => {
    expect(statSync(join(FOLDER, name)).size).toBeLessThanOrEqual(MAX_FILE_BYTES);
  });

  it('keeps all of them together within 400 KB', () => {
    const total = files.reduce((sum, name) => sum + statSync(join(FOLDER, name)).size, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });

  it.each(files)('stores %s at 560 × 350 px, twice the card\'s size', async (name) => {
    expect(await imageDimensions(new Blob([readFileSync(join(FOLDER, name))]))).toEqual({ width: 560, height: 350 });
  });
});
