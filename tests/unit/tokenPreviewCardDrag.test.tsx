// @vitest-environment jsdom
import React, { useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TokenPreviewCard } from '../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard';
import type { TokenPreview, TokenPreviewPatch } from '../../src/app/packages/components/asset-manager/token-creator/types';

/** Reports every observed element's width like the browser: 0 once it left the document. */
class FakeResizeObserver {
  static all: FakeResizeObserver[] = [];
  private readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) { FakeResizeObserver.all.push(this); }
  observe(target: Element): void { this.targets.add(target); this.notify(); }
  unobserve(target: Element): void { this.targets.delete(target); }
  disconnect(): void { this.targets.clear(); }
  notify(): void {
    const entries = [...this.targets].map((target) => ({ target, contentRect: { width: target.isConnected ? 200 : 0 } }));
    if (entries.length) this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  FakeResizeObserver.all = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const initial: TokenPreview = {
  id: 'acolyte', name: 'Acolyte', showRing: false, file: null, previewUrl: 'acolyte.webp',
  imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
};

function Card(): React.JSX.Element {
  const [preview, setPreview] = useState(initial);
  const onChange = (_id: string, patch: TokenPreviewPatch): void => setPreview((current) => ({ ...current, ...patch }));
  return <TokenPreviewCard preview={preview} mode="token" onChange={onChange} onToggleSelected={() => undefined} onRemove={() => undefined} />;
}

it('moves the image after the ring is turned on for a token that had none', () => {
  const view = render(<Card />);
  const ringToggle = view.getByLabelText('Toggle token ring for Acolyte');
  act(() => ringToggle.click());
  // The detached unframed well now measures 0, as a browser reports it
  act(() => FakeResizeObserver.all.forEach((observer) => observer.notify()));

  const image = view.container.querySelector<HTMLElement>('.atlas-token-card__image')!;
  act(() => {
    image.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    image.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0.25 }));
    image.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });

  expect(image.style.backgroundPosition).toBe('calc(50% + 0px) calc(50% + 50px)');
});
