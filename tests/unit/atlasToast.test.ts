// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showAtlasToast } from '../../src/app/react/components/AtlasToast';

describe('showAtlasToast', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll('.atlas-toast-container').forEach((el) => el.remove());
  });

  it('puts its container under Atlas\' style scope so the toast is styled and on screen', () => {
    vi.useFakeTimers();
    showAtlasToast('Saved');
    const container = document.querySelector('.atlas-toast-container');
    expect(container?.classList.contains('atlas-vtt-plugin')).toBe(true);
    // The message alone is the live region, and its text comes once the region is in the document.
    const text = container?.querySelector('.atlas-toast__text');
    expect(text?.getAttribute('aria-live')).toBe('polite');
    vi.advanceTimersToNextFrame();
    expect(container?.textContent).toBe('Saved');
  });

  it('removes the toast and its container even when no transition ends', () => {
    vi.useFakeTimers();
    showAtlasToast('Saved', 1000);
    vi.advanceTimersByTime(1000 + 400);
    expect(document.querySelector('.atlas-toast')).toBeNull();
    expect(document.querySelector('.atlas-toast-container')).toBeNull();
  });
});
