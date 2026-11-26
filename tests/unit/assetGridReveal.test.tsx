// @vitest-environment jsdom
import React, { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useGridKeyboard } from '../../src/app/packages/components/asset-manager/hooks/useGridKeyboard';
import type { GridReveal } from '../../src/app/packages/components/asset-manager/hooks/useRevealMoved';
import type { AnyAsset, TokenAsset } from '../../src/app/packages/components/asset-manager/types';

afterEach(cleanup);

const token = (id: string): TokenAsset => ({ id, name: id, type: 'tokens', imageUrl: `app://art/${id}.webp`, modifiedAt: 0 });
const LIBRARY = ['Rogue', 'Wolf', 'Ulfric'].map(token);

function Grid({ assets, reveal }: { assets: readonly AnyAsset[]; reveal: GridReveal | null }): React.JSX.Element {
  const container = useRef<HTMLDivElement>(null);
  const keys = useGridKeyboard({ assets, columns: 3, pageRows: 1, container, onSelect: () => {}, reveal, scrollToRow: () => {} });
  return (
    <div ref={container} role="listbox" aria-label="Tokens" onKeyDown={keys.onKeyDown} onFocus={keys.onFocus}>
      {assets.map((asset) => (
        <div key={asset.id} role="option" aria-selected="false" data-asset-id={asset.id} tabIndex={asset.id === keys.tabbableId ? 0 : -1}>{asset.name}</div>
      ))}
    </div>
  );
}

/** The asset manager's shape: a search field over results, the grid only while something matches, a hint under it. */
function Manager({ reveal, library }: { reveal: GridReveal | null; library: readonly AnyAsset[] }): React.JSX.Element {
  const [query, setQuery] = useState('');
  const shown = library.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div>
      <input aria-label="Search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
      {shown.length > 0 && <Grid assets={shown} reveal={reveal} />}
      {query !== '' && <p>12 more in Demo</p>}
    </div>
  );
}

/** Types as a keyboard does: into whatever holds focus, so a key that lands on a card is lost. */
function type(text: string): void {
  for (const char of text) {
    const target = document.activeElement;
    if (target instanceof HTMLInputElement) fireEvent.change(target, { target: { value: target.value + char } });
    else fireEvent.keyDown(target ?? document.body, { key: char });
  }
}

describe('a move notice\'s reveal never takes focus from the search', () => {
  it('focuses the moved card once, not again when the grid mounts anew under typing', () => {
    const reveal = { id: 'Rogue' };
    render(<Manager reveal={reveal} library={LIBRARY} />);
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Rogue' }));

    const search = screen.getByRole<HTMLInputElement>('textbox', { name: 'Search' });
    search.focus();
    type('z');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.change(search, { target: { value: '' } });
    type('rog');
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('rog');
  });

  it('leaves focus in the search where the moved card first comes into the results while typing', () => {
    const reveal = { id: 'Ulfric' };
    const { rerender } = render(<Manager reveal={null} library={LIBRARY.slice(0, 2)} />);
    const search = screen.getByRole<HTMLInputElement>('textbox', { name: 'Search' });
    search.focus();
    rerender(<Manager reveal={reveal} library={LIBRARY.slice(0, 2)} />);
    type('u');
    rerender(<Manager reveal={reveal} library={LIBRARY} />);
    type('lfric');
    expect(document.activeElement).toBe(search);
    expect(search.value).toBe('ulfric');
  });
});
