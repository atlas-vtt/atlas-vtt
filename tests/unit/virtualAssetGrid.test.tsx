// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MotionGlobalConfig } from 'framer-motion';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';

import { VirtualAssetGrid } from '../../src/app/packages/components/asset-manager/components/VirtualAssetGrid';
import type { AnyAsset } from '../../src/app/packages/components/asset-manager/types';
import { stubLayout } from '../mocks/jsdomLayout';

const TOTAL = 100;
const assets: AnyAsset[] = Array.from({ length: TOTAL }, (_, index) => ({
  id: `token-${index}`, name: `Token ${index}`, type: 'tokens', imageUrl: '', thumbnailUrl: '', modifiedAt: index,
}));

function Harness({ items = assets }: { items?: AnyAsset[] }): React.JSX.Element {
  const [scrollElement, setScrollElement] = useState<HTMLDivElement | null>(null);
  return (
    <div ref={setScrollElement} data-testid="scroll">
      <VirtualAssetGrid
        assets={items}
        scrollElement={scrollElement}
        renderCard={(asset) => <div key={asset.id} role="listitem">{asset.name}</div>}
        onBackgroundClick={() => {}}
      />
    </div>
  );
}

const VIEWPORT = { width: 800, height: 600 };
stubLayout(VIEWPORT);

beforeAll(() => {
  // jsdom does not run animation frames; settle every animation at once.
  MotionGlobalConfig.skipAnimations = true;
});

afterAll(() => {
  MotionGlobalConfig.skipAnimations = false;
});

afterEach(cleanup);

it('mounts only the rows around the viewport and places each card in its column', async () => {
  render(<Harness />);

  await screen.findByText('Token 0');
  const rendered = screen.getAllByRole('listitem');
  const columns = Math.floor(VIEWPORT.width / 132);

  expect(rendered.length % columns).toBe(0);
  expect(rendered.length).toBeLessThan(TOTAL);
  expect(screen.queryByText(`Token ${TOTAL - 1}`)).toBeNull();
  // Cards share one container, so a card keeps its element when the order changes.
  const cells = rendered.map((card) => card.parentElement!);
  expect(new Set(cells.map((cell) => cell.parentElement)).size).toBe(1);
  const cardWidth = VIEWPORT.width / columns;
  expect(cells[1]!.style.transform).toContain(`translate3d(${cardWidth}px, 0px, 0)`);
  // Rows follow the measured card height once a card is on screen.
  await waitFor(() => expect(cells[columns]!.style.transform).toContain(`translate3d(0px, ${VIEWPORT.height}px, 0)`));
});

it('keeps a card\'s element when the order changes and moves it to its new cell', async () => {
  const columns = Math.floor(VIEWPORT.width / 132);
  const firstRow = assets.slice(0, columns);
  const { rerender } = render(<Harness items={firstRow} />);
  const first = (await screen.findByText('Token 0')).parentElement!;

  rerender(<Harness items={[...firstRow].reverse()} />);

  expect(screen.getByText('Token 0').parentElement).toBe(first);
  const lastColumn = (VIEWPORT.width / columns) * (columns - 1);
  await waitFor(() => expect(first.style.transform).toContain(`translate3d(${lastColumn}px, 0px, 0)`));
});
