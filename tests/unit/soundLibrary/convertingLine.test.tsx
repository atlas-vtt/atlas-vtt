// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConvertingLine } from '../../../src/app/react/components/dm-screen/sound/library/ConvertingLine';
import type { BackgroundProgress } from '../../../src/app/soundDirector/copyQueue';
import type { SoundDirector } from '../../../src/app/soundDirector/SoundDirector';

function fakeDirector(start: BackgroundProgress | null): { director: SoundDirector; set: (next: BackgroundProgress | null) => void; pause: ReturnType<typeof vi.fn> } {
  let progress = start;
  let revision = 0;
  const listeners = new Set<() => void>();
  const pause = vi.fn();
  const director = {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    snapshot: () => ({ shelfRevision: revision }),
    shelf: { background: () => (progress ? { ...progress } : null), pauseBackground: pause },
  } as unknown as SoundDirector;
  const set = (next: BackgroundProgress | null): void => {
    progress = next;
    revision++;
    for (const listener of listeners) listener();
  };
  return { director, set, pause };
}

afterEach(cleanup);

describe('the converting line', () => {
  it('counts what the background converts, pauses it and resumes it, and leaves once it stands empty', () => {
    const { director, set, pause } = fakeDirector({ done: 3, total: 2000, paused: false });
    const { container } = render(<ConvertingLine director={director} />);
    expect(container.textContent).toContain('Converting 3 of 2,000');
    const button = container.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Pause converting');
    fireEvent.click(button);
    expect(pause).toHaveBeenLastCalledWith(true);

    act(() => set({ done: 4, total: 2000, paused: true }));
    expect(container.textContent).toContain('Converting 4 of 2,000');
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('Resume converting');
    fireEvent.click(container.querySelector('button')!);
    expect(pause).toHaveBeenLastCalledWith(false);

    act(() => set(null));
    expect(container.querySelector('.atlas-sound-lib__converting')).toBeNull();
  });

  it('shows nothing while nothing converts', () => {
    const { director } = fakeDirector(null);
    const { container } = render(<ConvertingLine director={director} />);
    expect(container.innerHTML).toBe('');
  });
});
