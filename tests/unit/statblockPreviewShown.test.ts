// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { holdPreviewShown, PREVIEW_SHOWN_CLASS } from '../../src/app/react/components/statblock/previewShown';

describe('the body\'s mark of a statblock preview being shown', () => {
  it('stays while any preview is shown, and goes with the last', () => {
    const hover = holdPreviewShown(document);
    const window = holdPreviewShown(document);
    hover();
    // A release acts once: the window's preview still holds the mark.
    hover();
    expect(document.body.classList.contains(PREVIEW_SHOWN_CLASS)).toBe(true);
    window();
    expect(document.body.classList.contains(PREVIEW_SHOWN_CLASS)).toBe(false);
  });

  it('is kept per document: a popout\'s preview marks the popout alone', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const release = holdPreviewShown(popout);
    expect(popout.body.classList.contains(PREVIEW_SHOWN_CLASS)).toBe(true);
    expect(document.body.classList.contains(PREVIEW_SHOWN_CLASS)).toBe(false);
    release();
    expect(popout.body.classList.contains(PREVIEW_SHOWN_CLASS)).toBe(false);
  });
});
