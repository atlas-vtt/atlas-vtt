// @vitest-environment jsdom
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TokenPreviewCard } from '../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard';
import type { CreatorMode, TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';

class IdleResizeObserver {
  observe(): void { /* the badge does not depend on the well's size */ }
  unobserve(): void { /* see observe */ }
  disconnect(): void { /* see observe */ }
}

beforeEach(() => vi.stubGlobal('ResizeObserver', IdleResizeObserver));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const converted: TokenPreview = {
  id: 'region', name: 'Region', showRing: false, file: null, previewUrl: 'region.webp',
  imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: false,
  compressionRatio: 83,
};
const scaledDown = { from: { width: 16000, height: 12000 }, to: { width: 8192, height: 6144 } };

function badgeOf(preview: TokenPreview, mode: CreatorMode): string | null | undefined {
  const { container } = render(<TokenPreviewCard preview={preview} mode={mode} onChange={() => undefined} onToggleSelected={() => undefined} onRemove={() => undefined} />);
  return container.querySelector('.atlas-token-card__badge')?.textContent;
}

it('shows the size a map was scaled down to instead of the saved file size', () => {
  expect(badgeOf({ ...converted, scaledDown }, 'map')).toBe('8192 × 6144 px');
});

it('shows the saved file size on a map that kept its pixels', () => {
  expect(badgeOf(converted, 'map')).toBe('−83%');
});

it('shows the saved file size on tokens, which always shrink to token size', () => {
  expect(badgeOf({ ...converted, scaledDown }, 'token')).toBe('−83%');
});
