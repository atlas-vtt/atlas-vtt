// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PreviewGrid } from '../../src/app/packages/components/asset-manager/token-creator/PreviewGrid';
import type { TokenPreview } from '../../src/app/packages/components/asset-manager/token-creator/types';
import { stubLayout } from '../mocks/jsdomLayout';

vi.mock('../../src/app/packages/components/asset-manager/token-creator/TokenPreviewCard', () => ({
  TokenPreviewCard: ({ preview, enterIndex }: { preview: TokenPreview; enterIndex: number | null }) => <div role="listitem" data-enter={String(enterIndex)}>{preview.name}</div>,
}));

stubLayout({ width: 800, height: 600 });
afterEach(cleanup);

const previews: TokenPreview[] = Array.from({ length: 6000 }, (_, index) => ({
  id: `token-${index}`, name: `Token ${index}`, file: null, previewUrl: '', imageScale: 1, imagePosition: { x: 0, y: 0 }, isSelected: true, isOptimizing: true,
}));

function Harness({ items = previews }: { items?: TokenPreview[] }): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setScrollElement}>
      <PreviewGrid previews={items} mode="token" scrollElement={scrollElement} onChange={vi.fn()} onToggleSelected={vi.fn()} onRemove={vi.fn()} />
    </div>
  );
}

it('mounts only the cards in view of a large import', async () => {
  render(<Harness />);
  await screen.findByText('Token 0');
  const mounted = screen.getAllByRole('listitem');
  expect(mounted.length).toBeLessThan(50);
  expect(mounted.length % Math.floor(800 / 196)).toBe(0);
  expect(screen.queryByText('Token 5999')).toBeNull();
});

it('staggers the cards of added previews in and shows cards that were listed before as they are', async () => {
  const view = render(<Harness items={previews.slice(0, 2)} />);
  await screen.findByText('Token 0');
  expect(screen.getAllByRole('listitem').map(card => card.dataset.enter)).toEqual(['0', '1']);
  view.rerender(<Harness items={previews.slice(0, 3)} />);
  await screen.findByText('Token 2');
  expect(screen.getAllByRole('listitem').map(card => card.dataset.enter)).toEqual(['0', '1', '0']);
  view.rerender(<Harness items={previews.slice(1, 3)} />);
  view.rerender(<Harness items={previews.slice(0, 3)} />);
  expect(screen.getByText('Token 0').dataset.enter).toBe('0');
});
