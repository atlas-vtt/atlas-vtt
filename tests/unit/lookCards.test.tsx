// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LookService } from '../../src/app/appearance/lookService';
import { LookCards } from '../../src/app/appearance/LookCards';

afterEach(cleanup);

/** A fresh app and its look service, on the GM's theme `theme`. */
function looksOn(theme: string): LookService {
  const storage = new Map<string, unknown>();
  const css = { theme, themes: { Minimal: {} } as Record<string, unknown> };
  const app = {
    vault: { adapter: { exists: async () => true, write: async () => {} } },
    plugins: { plugins: {}, enabledPlugins: new Set(['atlas-vtt']) },
    customCss: Object.assign(css, { setTheme: (name: string) => { css.theme = name; } }),
    loadLocalStorage: (key: string) => storage.get(key) ?? null,
    saveLocalStorage: (key: string, value: unknown) => { if (value) storage.set(key, value); else storage.delete(key); },
  } as unknown as App;
  return LookService.forApp(app, new SettingsService(app));
}

const card = (name: string): HTMLElement => screen.getByRole('radio', { name });

it('marks the chosen look', () => {
  const looks = looksOn('');
  looks.set('mediaeval');
  render(<LookCards looks={looks} size="page" />);
  expect(screen.getByRole('radiogroup')).toBeTruthy();
  expect(card('Mediaeval').getAttribute('aria-checked')).toBe('true');
  expect(card('Your theme').getAttribute('aria-checked')).toBe('false');
  expect(card('Sci-fi').getAttribute('aria-checked')).toBe('false');
});

it('picks a look on a click', () => {
  const looks = looksOn('');
  const set = vi.spyOn(looks, 'set');
  render(<LookCards looks={looks} size="compact" />);
  act(() => { fireEvent.click(card('Sci-fi')); });
  expect(set).toHaveBeenCalledWith('scifi');
  expect(card('Sci-fi').getAttribute('aria-checked')).toBe('true');
});

it('moves the choice with the arrow keys', () => {
  const looks = looksOn('');
  render(<LookCards looks={looks} size="page" />);
  act(() => { fireEvent.keyDown(card('Your theme'), { key: 'ArrowRight' }); });
  expect(looks.get()).toBe('mediaeval');
  expect(document.activeElement).toBe(card('Mediaeval'));
  act(() => { fireEvent.keyDown(card('Mediaeval'), { key: 'ArrowLeft' }); });
  act(() => { fireEvent.keyDown(card('Your theme'), { key: 'ArrowLeft' }); });
  expect(looks.get()).toBe('scifi');
  expect(card('Sci-fi').tabIndex).toBe(0);
  expect(card('Mediaeval').tabIndex).toBe(-1);
});

it('names the GM\'s own theme on its card', () => {
  const looks = looksOn('Minimal');
  vi.spyOn(looks, 'previousThemeName').mockReturnValue('Minimal');
  looks.set('scifi');
  render(<LookCards looks={looks} size="page" />);
  expect(screen.getByText('Minimal')).toBeTruthy();
  expect(screen.getByText('Ink and ivy')).toBeTruthy();
  expect(screen.getByText('Chalk and contours')).toBeTruthy();
});

it('names Obsidian\'s default theme where the GM has no theme of their own', () => {
  render(<LookCards looks={looksOn('')} size="page" />);
  expect(screen.getByText('Obsidian’s default')).toBeTruthy();
});

it('names the theme in use while the GM keeps their own', () => {
  render(<LookCards looks={looksOn('Minimal')} size="page" />);
  expect(screen.getByText('Minimal')).toBeTruthy();
});
