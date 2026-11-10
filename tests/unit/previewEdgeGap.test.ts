// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { PREVIEW_GAP_BLOCK, PREVIEW_GAP_INLINE, previewEdgeGaps } from '../../src/app/react/components/statblock/previewEdgeGap';

describe('previewEdgeGaps', () => {
  afterEach(() => {
    document.body.style.removeProperty(PREVIEW_GAP_BLOCK);
    document.body.style.removeProperty(PREVIEW_GAP_INLINE);
  });

  it('keeps the gap a preview has by itself when no theme asks for more', () => {
    expect(previewEdgeGaps(document, 20)).toEqual({ block: 20, inline: 20 });
  });

  it('takes the room a theme asks for, above and below apart from the sides', () => {
    document.body.style.setProperty(PREVIEW_GAP_BLOCK, '84px');
    document.body.style.setProperty(PREVIEW_GAP_INLINE, '24px');
    expect(previewEdgeGaps(document, 20)).toEqual({ block: 84, inline: 24 });
  });

  it('never goes below its own gap, nor so far that a small window has no room left', () => {
    document.body.style.setProperty(PREVIEW_GAP_BLOCK, '4px');
    document.body.style.setProperty(PREVIEW_GAP_INLINE, '900px');
    expect(previewEdgeGaps(document, 16)).toEqual({ block: 16, inline: 160 });
  });

  it('reads anything that is no length as no wish', () => {
    document.body.style.setProperty(PREVIEW_GAP_BLOCK, 'wide');
    expect(previewEdgeGaps(document, 20).block).toBe(20);
  });
});
