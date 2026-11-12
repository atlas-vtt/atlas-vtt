// @vitest-environment jsdom
import React from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe(): void {}

  unobserve(): void {}

  disconnect(): void {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

import { StatblockHoverPreview } from '../../src/app/react/components/StatblockHoverPreview';

describe('StatblockHoverPreview live positioning', () => {
  it('re-centers when measured preview height changes after mount', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    const anchorRect = new DOMRect(1200, 100, 96, 400);

    const { container } = render(
      <StatblockHoverPreview
        notePath="bestiary/bandit-captain.md"
        isVisible={true}
        isClosing={false}
        position={null}
        anchorRect={anchorRect}
        preferredSide="left"
      />,
    );

    const preview = container.ownerDocument.body.querySelector('.statblock-hover-preview') as HTMLElement | null;
    expect(preview).not.toBeNull();
    expect(preview?.style.top).toBe('100px');

    expect(resizeObserverCallback).not.toBeNull();
    if (!resizeObserverCallback || !preview) return;

    act(() => {
      resizeObserverCallback(
        [
          {
            target: preview,
            contentRect: new DOMRectReadOnly(0, 0, 482, 900),
          } as ResizeObserverEntry,
        ],
        {} as ResizeObserver,
      );
    });

    expect(preview.style.top).toBe('16px');
  });

  it('limits its height by the window alone, wherever its card stands (#720)', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    // A card at the window's lower edge.
    const anchorRect = new DOMRect(1200, 920, 96, 72);

    const { container } = render(
      <StatblockHoverPreview
        notePath="bestiary/bandit-captain.md"
        isVisible={true}
        isClosing={false}
        position={null}
        anchorRect={anchorRect}
        preferredSide="left"
      />,
    );

    const preview = container.ownerDocument.body.querySelector('.statblock-hover-preview') as HTMLElement | null;
    expect(preview).not.toBeNull();
    if (!resizeObserverCallback || !preview) return;
    const resizedTo = (height: number): void => {
      act(() => {
        resizeObserverCallback?.(
          [{ target: preview, contentRect: new DOMRectReadOnly(0, 0, 482, height) } as ResizeObserverEntry],
          {} as ResizeObserver,
        );
      });
    };

    // The skeleton: against the lower edge, and free to grow to the window's height less its two gaps.
    resizedTo(325);
    expect(preview.style.top).toBe('659px');
    expect(preview.style.maxHeight).toBe('968px');

    // The statblock that takes its place moves the preview up; the limit stays.
    resizedTo(552);
    expect(preview.style.top).toBe('432px');
    expect(preview.style.maxHeight).toBe('968px');

    // As tall as the limit: it fills the window between the gaps.
    resizedTo(968);
    expect(preview.style.top).toBe('16px');
    expect(preview.style.maxHeight).toBe('968px');
  });

  it('flips to the right of the anchor when the left side has no room', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });

    // Anchor hugs the left edge: 80px is not enough for the 450px fallback width.
    const anchorRect = new DOMRect(80, 100, 96, 400);

    const { container } = render(
      <StatblockHoverPreview
        notePath="bestiary/bandit-captain.md"
        isVisible={true}
        isClosing={false}
        position={null}
        anchorRect={anchorRect}
        preferredSide="left"
      />,
    );

    const preview = container.ownerDocument.body.querySelector(
      '.statblock-hover-preview',
    ) as HTMLElement | null;

    // anchor.right (176) + ANCHOR_GAP (12)
    expect(preview?.style.left).toBe('188px');
    expect(preview?.style.right).toBe('');
  });
});
