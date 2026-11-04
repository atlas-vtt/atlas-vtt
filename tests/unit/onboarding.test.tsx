// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SettingsService } from '../../src/app/services/SettingsService';
import { Tutorial } from '../../src/app/onboarding/Tutorial';
import { HotkeyHelp } from '../../src/app/keyboard/HotkeyHelp';

afterEach(cleanup);
const settings = () => new SettingsService({ vault: { adapter: { exists: async () => true, write: async () => {} } } } as any);
const steps = [{ title: 'Your assets', body: 'Keep everything together.' }, { title: 'Create a collection', body: 'One collection per campaign.' }];
it('walks forward and back, then starts collection creation and remembers completion', () => {
  const service = settings(); const create = vi.fn();
  render(<Tutorial settings={service} id="assets" steps={steps} action={{ label: 'Create collection', onClick: create }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Create a collection')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Your assets')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create collection' }));
  expect(create).toHaveBeenCalledOnce();
  expect(service.shouldShowTutorial('assets')).toBe(false);
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('skips just the current tutorial and captures Escape before underlying dialogs', () => {
  const service = settings(); const underneath = vi.fn();
  document.addEventListener('keydown', underneath);
  render(<Tutorial settings={service} id="palette" steps={steps} />);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(service.shouldShowTutorial('palette')).toBe(false);
  expect(service.shouldShowTutorial('assets')).toBe(true);
  expect(underneath).not.toHaveBeenCalled();
  document.removeEventListener('keydown', underneath);
});
it('shows live user bindings in help and hides disabled tools', () => {
  const service = settings(); service.setHotkey('assets', 'q');
  render(<HotkeyHelp settings={service} onClose={() => {}} />);
  expect(screen.getByText('Q')).toBeTruthy();
  expect(screen.getByText('Asset manager')).toBeTruthy();
  expect(screen.queryByText('Walls and lighting')).toBeNull();
});
