import { describe, expect, it } from 'vitest';
import { isElementShown } from '../../../src/app/platform/elementShown';

interface FakeElement {
  isConnected: boolean;
  checkVisibility?: () => boolean;
  getClientRects: () => { length: number };
}

/** An element as far as the question goes; `boxes` is what a web view without `checkVisibility` is asked for. */
function element(fake: Partial<FakeElement> & { boxes?: number }): Element {
  const { boxes = 1, ...rest } = fake;
  const made: FakeElement = { isConnected: true, getClientRects: () => ({ length: boxes }), ...rest };
  return made as unknown as Element;
}

describe('whether an element is on screen', () => {
  it('asks the web view where it can answer', () => {
    expect(isElementShown(element({ checkVisibility: () => true, boxes: 0 }))).toBe(true);
    expect(isElementShown(element({ checkVisibility: () => false, boxes: 1 }))).toBe(false);
  });

  it('goes by the element\'s boxes where the web view has no checkVisibility (iPadOS before 17.4)', () => {
    expect(isElementShown(element({ boxes: 1 }))).toBe(true);
    expect(isElementShown(element({ boxes: 0 }))).toBe(false);
  });

  it('is never shown while it is out of the document, or missing', () => {
    expect(isElementShown(element({ isConnected: false, checkVisibility: () => true }))).toBe(false);
    expect(isElementShown(element({ isConnected: false }))).toBe(false);
    expect(isElementShown(null)).toBe(false);
    expect(isElementShown(undefined)).toBe(false);
  });
});
