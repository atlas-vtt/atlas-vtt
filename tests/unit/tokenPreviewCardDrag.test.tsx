import React, { useState } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TokenPreviewCard } from '../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard';
import type { CreatorMode, TokenPreview, TokenPreviewPatch } from '../../src/app/packages/components/asset-manager/token-creator/types';

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

function Card({ mode = 'token' }: { mode?: CreatorMode }): React.JSX.Element {
  const [preview, setPreview] = useState(initial);
  const onChange = (_id: string, patch: TokenPreviewPatch): void => setPreview((current) => ({ ...current, ...patch }));
  return <TokenPreviewCard preview={preview} mode={mode} onChange={onChange} onToggleSelected={() => undefined} onRemove={() => undefined} />;
}

it('offers zoom, scroll, positioning and reset with the ring off', () => {
  vi.stubGlobal('Image', class {
    naturalWidth = 100;
    naturalHeight = 200;
    onload: (() => void) | null = null;
    set src(_url: string) { this.onload?.(); }
  });
  const view = render(<Card />);
  const image = view.container.querySelector<HTMLElement>('.atlas-token-card__image')!;
  const art = view.container.querySelector<HTMLElement>('.atlas-token-card__art')!;
  expect(view.getByRole('slider')).toBeTruthy();
  expect(view.container.querySelector('.atlas-token-card__ring')).toBeNull();
  expect(view.container.querySelector('.atlas-token-card__mask')).toBeNull();
  expect(image.style.backgroundSize).toBe('50%');
  act(() => view.getByRole('button', { name: 'Zoom in' }).click());
  expect(view.getByRole('slider').getAttribute('aria-valuenow')).toBe('1.1');
  act(() => art.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true })));
  expect(Number(view.getByRole('slider').getAttribute('aria-valuenow'))).toBeGreaterThan(1.1);
  act(() => view.getByRole('button', { name: 'Zoom out' }).click());
  act(() => {
    image.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0 }));
    image.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 0, clientY: 0.25 }));
    image.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  expect(image.style.backgroundPosition).toBe('calc(50% + 0px) calc(50% + 50px)');
  act(() => art.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  expect(view.getByRole('slider').getAttribute('aria-valuenow')).toBe('1');
  expect(image.style.backgroundPosition).toBe('calc(50% + 0px) calc(50% + 0px)');
});

it('keeps maps at whole-image fit without crop controls', () => {
  const view = render(<Card mode="map" />);
  expect(view.queryByRole('slider')).toBeNull();
  expect(view.container.querySelector<HTMLElement>('.atlas-token-card__image')!.style.backgroundSize).toBe('contain');
});

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
