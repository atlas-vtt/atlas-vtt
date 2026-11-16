// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LibraryHead } from '../../../src/app/react/components/dm-screen/sound/library/LibraryHead';
import type { LibraryActions } from '../../../src/app/react/components/dm-screen/sound/library/useLibraryActions';
import { ContextMenuProvider } from '../../../src/app/react/root/ContextMenuContext';
import type { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';

const library = { rootOf: () => ({ status: 'linked' }) } as unknown as SoundLibrary;
const actions = {} as LibraryActions;

function head(play: (() => void) | null): HTMLElement {
  const { container } = render(
    <ContextMenuProvider>
      <LibraryHead library={library} actions={actions} kind="music" rows={[]} scope="results" query="raid" onQuery={vi.fn()} shuffle={false} first={play ? { name: 'Raiders at Dawn', play } : null} />
    </ContextMenuProvider>,
  );
  return container;
}

afterEach(cleanup);

describe('the library search', () => {
  it('plays the first result on Enter, and shows the key while there is one', () => {
    const play = vi.fn();
    const container = head(play);
    const input = container.querySelector('input')!;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(play).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.atlas-sound-lib__enter')?.textContent).toBe('↵');
    expect(input.getAttribute('aria-keyshortcuts')).toContain('Enter');
  });

  it('shows the search key and lets Enter be where nothing was found', () => {
    const container = head(null);
    expect(container.querySelector('.atlas-sound-lib__enter')).toBeNull();
    expect(container.querySelector('.atlas-sound-cap')?.textContent).toBe('/');
    expect(container.querySelector('input')?.hasAttribute('aria-keyshortcuts')).toBe(false);
  });
});
