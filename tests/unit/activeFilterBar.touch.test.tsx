// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ActiveFilterBar } from '../../src/app/packages/components/asset-manager/components/search/ActiveFilterBar';
import type { FilterChipGroup } from '../../src/app/packages/components/asset-manager/search/activeFilterChips';
import { watchInput } from '../../src/app/packages/components/primitives/lastInput';

afterEach(cleanup);

const group: FilterChipGroup = {
  key: 'type',
  category: 'Type',
  removeAll: vi.fn(),
  items: [
    { key: 'beast', label: 'Beast', excluded: false, remove: vi.fn() },
    { key: 'undead', label: 'Undead', excluded: true, remove: vi.fn() },
  ],
};

/** A press as a finger makes it: jsdom has no PointerEvent, so the pointer's kind is set on the event. */
function touchPress(target: Element): void {
  const event = new Event('pointerdown', { bubbles: true });
  Object.assign(event, { pointerType: 'touch' });
  act(() => { target.dispatchEvent(event); });
}

/** The chip itself: the one button that says whether its list is open. */
const chip = (): HTMLElement => document.querySelector<HTMLElement>('button[aria-expanded]')!;
const list = (): HTMLElement | null => screen.queryByRole('group', { name: 'Type' });

it('opens a chip of several values at a finger\'s tap, and keeps it open for the next', () => {
  const stop = watchInput(document);
  render(<ActiveFilterBar groups={[group]} onReset={vi.fn()} />);
  expect(list()).toBeNull();
  // A tap: the press, the focus it brings, then the click. The focus opens nothing, so the click does.
  touchPress(chip());
  fireEvent.focus(chip());
  fireEvent.click(chip());
  expect(list()).not.toBeNull();
  expect(chip().getAttribute('aria-expanded')).toBe('true');
  // A tap on a value inside is the list's own.
  touchPress(screen.getByRole('button', { name: /Beast/ }));
  expect(list()).not.toBeNull();
  stop();
});

it('folds it at a finger\'s press anywhere else', () => {
  const stop = watchInput(document);
  render(<ActiveFilterBar groups={[group]} onReset={vi.fn()} />);
  touchPress(chip());
  fireEvent.click(chip());
  expect(list()).not.toBeNull();
  touchPress(document.body);
  expect(list()).toBeNull();
  stop();
});

it('still opens for a key\'s focus', () => {
  const stop = watchInput(document);
  render(<ActiveFilterBar groups={[group]} onReset={vi.fn()} />);
  fireEvent.keyDown(document.body, { key: 'Tab' });
  fireEvent.focus(chip());
  expect(list()).not.toBeNull();
  stop();
});
