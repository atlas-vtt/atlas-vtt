// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WelcomeCarousel } from '../../src/app/onboarding/welcome/WelcomeCarousel';
import { SLIDE_MS } from '../../src/app/onboarding/welcome/welcomeSlides';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setHidden(false);
});

/** The heading of the slide that shows: the others are hidden from assistive technology. */
const shown = (): string => screen.getByRole('heading').textContent ?? '';
const wait = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };
/** Whole slides one at a time: each next slide's timer starts once React has shown it. */
const slides = (count: number): void => { for (let slide = 0; slide < count; slide += 1) wait(SLIDE_MS); };
const chips = (): HTMLElement => screen.getByRole('group', { name: 'Slides' });

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

it('advances every 7 seconds and wraps', () => {
  render(<WelcomeCarousel />);
  expect(shown()).toBe('Welcome to Atlas');
  wait(SLIDE_MS - 1);
  expect(shown()).toBe('Welcome to Atlas');
  wait(1);
  expect(shown()).toBe('Any map, ready in seconds');
  slides(4);
  expect(shown()).toBe('Play from anywhere');
  slides(1);
  expect(shown()).toBe('Welcome to Atlas');
});

it('jumps to a chip\'s slide', () => {
  render(<WelcomeCarousel />);
  wait(SLIDE_MS / 2);
  fireEvent.click(within(chips()).getByRole('button', { name: 'Dice' }));
  expect(shown()).toBe('Dice you can hear land');
  expect(within(chips()).getByRole('button', { name: 'Dice' }).getAttribute('aria-current')).toBe('true');
  // The chosen slide gets its whole time.
  wait(SLIDE_MS - 1);
  expect(shown()).toBe('Dice you can hear land');
  wait(1);
  expect(shown()).toBe('Every monster at hand');
});

it('holds while the pointer is over it', () => {
  render(<WelcomeCarousel />);
  const carousel = screen.getByRole('region', { name: 'What Atlas does' });
  wait(SLIDE_MS - 2000);
  fireEvent.pointerEnter(carousel);
  slides(3);
  expect(shown()).toBe('Welcome to Atlas');
  fireEvent.pointerLeave(carousel);
  // It goes on with the time the slide had left.
  wait(1999);
  expect(shown()).toBe('Welcome to Atlas');
  wait(1);
  expect(shown()).toBe('Any map, ready in seconds');
});

it('holds while the document is hidden', () => {
  render(<WelcomeCarousel />);
  wait(1000);
  setHidden(true);
  slides(3);
  expect(shown()).toBe('Welcome to Atlas');
  setHidden(false);
  wait(SLIDE_MS - 1000);
  expect(shown()).toBe('Any map, ready in seconds');
});

it('names every slide on its chip', () => {
  render(<WelcomeCarousel />);
  expect(within(chips()).getAllByRole('button').map((chip) => chip.textContent))
    .toEqual(['Welcome', 'Maps', 'Dice', 'Statblocks', 'Players', 'Online']);
});
