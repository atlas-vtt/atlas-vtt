import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  STATBLOCK_FEED_MAX_WIDTH,
  STATBLOCK_FEED_MIN_WIDTH,
  STATBLOCK_PREVIEW_MAX_WIDTH,
  STATBLOCK_PREVIEW_WIDE_FROM,
  STATBLOCK_PREVIEW_WIDE_MAX_WIDTH,
} from '../../../../src/app/statblocks/render/statblockSurfaceWidths';
import { MAX_FEED_WIDTH, MIN_FEED_WIDTH } from '../../../../src/app/react/components/dm-screen/feedLayout';

const ROOT = join(__dirname, '../../../..');

function scssPixels(name: string): number {
  const tokens = readFileSync(join(ROOT, 'styles/_tokens.scss'), 'utf8');
  const match = new RegExp(`^\\$${name}:\\s*(\\d+)px;`, 'm').exec(tokens);
  if (!match?.[1]) throw new Error(`No $${name} in _tokens.scss`);
  return Number(match[1]);
}

describe('statblock surface widths', () => {
  it('keeps the widths of today', () => {
    expect([STATBLOCK_PREVIEW_MAX_WIDTH, STATBLOCK_PREVIEW_WIDE_MAX_WIDTH, STATBLOCK_PREVIEW_WIDE_FROM]).toEqual([480, 540, 1600]);
    expect([STATBLOCK_FEED_MIN_WIDTH, STATBLOCK_FEED_MAX_WIDTH]).toEqual([340, 540]);
  });

  it('are the widths the stylesheet tokens say', () => {
    expect(scssPixels('statblock-preview-max-width')).toBe(STATBLOCK_PREVIEW_MAX_WIDTH);
    expect(scssPixels('statblock-preview-wide-max-width')).toBe(STATBLOCK_PREVIEW_WIDE_MAX_WIDTH);
    expect(scssPixels('statblock-preview-wide-from')).toBe(STATBLOCK_PREVIEW_WIDE_FROM);
    expect(scssPixels('statblock-feed-min-width')).toBe(STATBLOCK_FEED_MIN_WIDTH);
    expect(scssPixels('statblock-feed-max-width')).toBe(STATBLOCK_FEED_MAX_WIDTH);
  });

  it('are what the hover preview and the DM screen use', () => {
    const surface = readFileSync(join(ROOT, 'src/app/react/components/statblock/_statblock-preview-surface.scss'), 'utf8');
    expect(surface).toContain('$statblock-preview-max-width');
    expect(surface).toContain('$statblock-preview-wide-max-width');
    expect(surface).toContain('(min-width: $statblock-preview-wide-from)');
    expect([MIN_FEED_WIDTH, MAX_FEED_WIDTH]).toEqual([STATBLOCK_FEED_MIN_WIDTH, STATBLOCK_FEED_MAX_WIDTH]);
  });
});
