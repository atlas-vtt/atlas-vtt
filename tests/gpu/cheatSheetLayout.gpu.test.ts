import '../setup/obsidianDom';
import React, { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AnimatePresence } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { DASHBOARD_THEME } from './dashboardTheme';
import { HotkeyHelp } from '../../src/app/keyboard/HotkeyHelp';

vi.mock('../../src/app/keyboard/useMapHotkeys', () => ({ useAtlasSettings: () => undefined }));

/** The sheet as UIRoot mounts it: inside AnimatePresence, so closing plays its exit before it leaves. */
function Sheet(): React.ReactElement {
  const [open, setOpen] = useState(true);
  return React.createElement(AnimatePresence, null, open && React.createElement(HotkeyHelp, { key: 'sheet', onClose: () => setOpen(false) }));
}

const rect = (element: Element): DOMRect => element.getBoundingClientRect();

/** The cheat sheet over the map, with the plugin's real stylesheet. */
describe('the cheat sheet', () => {
  const style = document.createElement('style');
  style.textContent = DASHBOARD_THEME + css;

  beforeEach(() => {
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    document.body.className = '';
    style.remove();
  });

  it.each([
    ['theme-dark', 1400, 900],
    ['theme-light', 1400, 900],
    ['theme-dark', 700, 800],
  ])('in %s at %i × %i keeps every key whole and inside the window', async (theme, width, height) => {
    await page.viewport(width, height);
    document.body.className = theme;
    render(React.createElement(Sheet));
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (import.meta.env.VITE_CHEAT_LOOKS) await page.screenshot({ path: `__screenshots__/cheat-sheet/${theme}-${width}.png` });

    const sheet = rect(screen.getByRole('dialog', { name: 'Cheat sheet' }));
    expect(sheet.left).toBeGreaterThanOrEqual(0);
    expect(sheet.right).toBeLessThanOrEqual(width);
    expect(sheet.bottom).toBeLessThanOrEqual(height);
    for (const row of document.querySelectorAll('.atlas-cheat-sheet__row')) {
      const keys = rect(row.querySelector('dd')!);
      expect(keys.right).toBeLessThanOrEqual(rect(row).right + 0.5);
      expect(rect(row.querySelector('dt')!).right).toBeLessThanOrEqual(keys.left);
    }
    for (const cap of document.querySelectorAll('.atlas-cheat-sheet__cap')) expect(cap.scrollWidth).toBeLessThanOrEqual(cap.clientWidth);
  });

  it('filters as the GM types and closes with its exit', async () => {
    await page.viewport(1400, 900);
    render(React.createElement(Sheet));
    const search = screen.getByRole('textbox', { name: 'Search shortcuts' });
    expect(document.activeElement).toBe(search);

    fireEvent.change(search, { target: { value: 'redo' } });
    expect([...document.querySelectorAll('.atlas-cheat-sheet__row dt')].map((name) => name.textContent)).toEqual(['Redo', 'Redo (alternate)']);
    fireEvent.change(search, { target: { value: 'no such key' } });
    expect(document.querySelector('.atlas-cheat-sheet__empty')?.textContent).toContain('no such key');

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close cheat sheet' })); });
    await waitFor(() => expect(document.querySelector('.atlas-hotkey-help')).toBeNull());
  });
});
