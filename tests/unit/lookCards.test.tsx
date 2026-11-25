// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { LookService } from '../../src/app/appearance/lookService';
import { LookCards } from '../../src/app/appearance/LookCards';

afterEach(cleanup);

/** Obsidian's `css-change` listeners of the latest app `looksOn` made. */
let cssListeners = new Set<() => void>();
let cssOf: { theme: string } = { theme: '' };

/** A fresh app and its look service, on the GM's theme `theme`. */
function looksOn(theme: string): LookService {
  const storage = new Map<string, unknown>();
  const css = { theme, themes: { Minimal: {}, Things: {} } as Record<string, unknown> };
  const listeners = cssListeners = new Set<() => void>();
  cssOf = css;
  const app = {
    vault: { adapter: { exists: async () => true, write: async () => {} } },
    workspace: {
      on: (_name: string, callback: () => void) => { listeners.add(callback); return callback; },
      offref: (ref: () => void) => { listeners.delete(ref); },
    },
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
  render(<LookCards looks={looks} />);
  expect(screen.getByRole('radiogroup')).toBeTruthy();
  expect(card('Medieval').getAttribute('aria-checked')).toBe('true');
  expect(card('Your theme').getAttribute('aria-checked')).toBe('false');
  expect(card('Sci-fi').getAttribute('aria-checked')).toBe('false');
});

it('picks a look on a click', () => {
  const looks = looksOn('');
  const set = vi.spyOn(looks, 'set');
  render(<LookCards looks={looks} />);
  act(() => { fireEvent.click(card('Sci-fi')); });
  expect(set).toHaveBeenCalledWith('scifi');
  expect(card('Sci-fi').getAttribute('aria-checked')).toBe('true');
});

it('picks a look only on its picture: its name and note are plain text', () => {
  const looks = looksOn('');
  const set = vi.spyOn(looks, 'set');
  render(<LookCards looks={looks} />);
  act(() => { fireEvent.click(screen.getByText('Sci-fi')); });
  act(() => { fireEvent.click(screen.getByText('May the dice be with you')); });
  expect(set).not.toHaveBeenCalled();
  expect(card('Sci-fi').getAttribute('aria-checked')).toBe('false');
  expect(card('Sci-fi').contains(screen.getByText('Sci-fi'))).toBe(false);
  expect(card('Sci-fi').querySelector('img')).toBeTruthy();
  act(() => { fireEvent.click(card('Sci-fi')); });
  expect(set).toHaveBeenCalledWith('scifi');
});

it('names each picture by its look and describes it by its note', () => {
  render(<LookCards looks={looksOn('')} />);
  const picture = card('Medieval');
  expect(document.getElementById(picture.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('Medieval');
  expect(document.getElementById(picture.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Like a classic fantasy rulebook');
  expect(screen.getByRole('radio', { name: 'Your theme', description: 'Obsidian’s default' })).toBeTruthy();
});

it('moves the choice with the arrow keys', () => {
  const looks = looksOn('');
  render(<LookCards looks={looks} />);
  act(() => { fireEvent.keyDown(card('Your theme'), { key: 'ArrowRight' }); });
  expect(looks.get()).toBe('mediaeval');
  expect(document.activeElement).toBe(card('Medieval'));
  act(() => { fireEvent.keyDown(card('Medieval'), { key: 'ArrowLeft' }); });
  act(() => { fireEvent.keyDown(card('Your theme'), { key: 'ArrowLeft' }); });
  expect(looks.get()).toBe('scifi');
  expect(card('Sci-fi').tabIndex).toBe(0);
  expect(card('Medieval').tabIndex).toBe(-1);
  act(() => { fireEvent.keyDown(card('Sci-fi'), { key: 'Home' }); });
  expect(looks.get()).toBe('own');
  expect(document.activeElement).toBe(card('Your theme'));
});

it('names the GM\'s own theme on its card', () => {
  const looks = looksOn('Minimal');
  vi.spyOn(looks, 'previousThemeName').mockReturnValue('Minimal');
  looks.set('scifi');
  render(<LookCards looks={looks} />);
  expect(screen.getByText('Minimal')).toBeTruthy();
  expect(screen.getByText('Like a classic fantasy rulebook')).toBeTruthy();
  expect(screen.getByText('May the dice be with you')).toBeTruthy();
});

it('names Obsidian\'s default theme where the GM has no theme of their own', () => {
  render(<LookCards looks={looksOn('')} />);
  expect(screen.getByText('Obsidian’s default')).toBeTruthy();
});

it('names the theme in use while the GM keeps their own', () => {
  render(<LookCards looks={looksOn('Minimal')} />);
  expect(screen.getByText('Minimal')).toBeTruthy();
});

it('renames the GM\'s own theme when they switch it in Obsidian while the cards show', () => {
  const { unmount } = render(<LookCards looks={looksOn('Minimal')} />);
  act(() => {
    cssOf.theme = 'Things';
    for (const listener of Array.from(cssListeners)) listener();
  });
  expect(screen.getByText('Things')).toBeTruthy();
  unmount();
  expect(cssListeners.size).toBe(0);
});
