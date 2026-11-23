// @vitest-environment jsdom
import React from 'react';
import type { App } from 'obsidian';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AccentColourRow } from '../../src/app/appearance/AccentColourRow';

afterEach(cleanup);

/** An app whose vault keeps its settings as Obsidian's does and announces each change. */
function appWithAccent(accent = ''): App {
  const config = new Map<string, unknown>([['accentColor', accent]]);
  const listeners = new Set<(key: string) => void>();
  const vault = {
    getConfig: (key: string) => config.get(key) ?? null,
    setConfig: vi.fn((key: string, value: unknown) => { config.set(key, value); listeners.forEach((listener) => listener(key)); }),
    on: (_name: string, callback: (key: string) => void) => { listeners.add(callback); return callback; },
    offref: (ref: (key: string) => void) => { listeners.delete(ref); },
  };
  const workspace = { on: () => ({}), offref: () => {} };
  return { vault, workspace, customCss: { theme: '' } } as unknown as App;
}

const swatch = (name: string): HTMLElement => screen.getByRole('radio', { name });

it('marks the look\'s own while no accent is set', () => {
  render(<AccentColourRow app={appWithAccent()} />);
  expect(screen.getByRole('radiogroup', { name: 'Accent colour' })).toBeTruthy();
  expect(screen.getAllByRole('radio')).toHaveLength(10);
  expect(swatch('The look’s own').getAttribute('aria-checked')).toBe('true');
  expect(swatch('Teal').getAttribute('aria-checked')).toBe('false');
  expect(swatch('Custom').getAttribute('aria-checked')).toBe('false');
});

it('picks a preset on a click', () => {
  const app = appWithAccent();
  render(<AccentColourRow app={app} />);
  act(() => { fireEvent.click(swatch('Teal')); });
  expect(app.vault.setConfig).toHaveBeenCalledWith('accentColor', '#2a9d8f');
  expect(swatch('Teal').getAttribute('aria-checked')).toBe('true');
  expect(swatch('The look’s own').getAttribute('aria-checked')).toBe('false');
  act(() => { fireEvent.click(swatch('The look’s own')); });
  expect(app.vault.setConfig).toHaveBeenLastCalledWith('accentColor', '');
});

it('marks Custom for a colour no preset has', () => {
  const app = appWithAccent('#123456');
  render(<AccentColourRow app={app} />);
  expect(swatch('Custom').getAttribute('aria-checked')).toBe('true');
  expect(swatch('The look’s own').getAttribute('aria-checked')).toBe('false');
  const picker = document.querySelector<HTMLInputElement>('input[type="color"]')!;
  expect(picker.value).toBe('#123456');
  act(() => { fireEvent.input(picker, { target: { value: '#abcdef' } }); });
  expect(app.vault.setConfig).toHaveBeenLastCalledWith('accentColor', '#abcdef');
  expect(swatch('Custom').getAttribute('aria-checked')).toBe('true');
});

it('follows a change made in Obsidian\'s settings', () => {
  const app = appWithAccent();
  render(<AccentColourRow app={app} />);
  act(() => { app.vault.setConfig('accentColor', '#C9A227'); });
  expect(swatch('Gold').getAttribute('aria-checked')).toBe('true');
});

it('moves with the arrow keys', () => {
  const app = appWithAccent();
  render(<AccentColourRow app={app} />);
  expect(swatch('The look’s own').tabIndex).toBe(0);
  act(() => { fireEvent.keyDown(swatch('The look’s own'), { key: 'ArrowRight' }); });
  expect(app.vault.setConfig).toHaveBeenLastCalledWith('accentColor', '#c0392b');
  expect(document.activeElement).toBe(swatch('Crimson'));
  expect(swatch('Crimson').tabIndex).toBe(0);
  expect(swatch('The look’s own').tabIndex).toBe(-1);
  act(() => { fireEvent.keyDown(swatch('Crimson'), { key: 'ArrowLeft' }); });
  expect(app.vault.setConfig).toHaveBeenLastCalledWith('accentColor', '');
  act(() => { fireEvent.keyDown(swatch('The look’s own'), { key: 'End' }); });
  expect(document.activeElement).toBe(swatch('Custom'));
  expect(app.vault.setConfig).toHaveBeenLastCalledWith('accentColor', '');
});
