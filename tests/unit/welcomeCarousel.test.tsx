// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WelcomeCarousel } from '../../src/app/onboarding/welcome/WelcomeCarousel';
import { CROSSFADE_MS, SLIDE_MS } from '../../src/app/onboarding/welcome/welcomeSlides';

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

it('advances every 7 seconds through all eight slides and wraps', () => {
  render(<WelcomeCarousel />);
  expect(shown()).toBe('Welcome to Atlas');
  wait(SLIDE_MS - 1);
  expect(shown()).toBe('Welcome to Atlas');
  wait(1);
  expect(shown()).toBe('Any map, ready in seconds');
  slides(6);
  expect(shown()).toBe('A VTT you truly own');
  slides(1);
  expect(shown()).toBe('Welcome to Atlas');
});

it('jumps to a chip\'s slide', () => {
  render(<WelcomeCarousel />);
  wait(SLIDE_MS / 2);
  fireEvent.click(within(chips()).getByRole('button', { name: 'Dice' }));
  expect(shown()).toBe('Dice you can hear land');
  expect(within(chips()).getByRole('button', { name: 'Dice' }).getAttribute('aria-current')).toBe('true');
});

it('stops for good once a slide is picked or focus enters', () => {
  const picked = render(<WelcomeCarousel />);
  fireEvent.click(within(chips()).getByRole('button', { name: 'Dice' }));
  slides(3);
  expect(shown()).toBe('Dice you can hear land');
  picked.unmount();
  render(<WelcomeCarousel />);
  wait(1000);
  fireEvent.focus(within(chips()).getByRole('button', { name: 'Maps' }));
  slides(3);
  expect(shown()).toBe('Welcome to Atlas');
});

it('shows a slide it comes back to afresh, and lets the one it left go once the crossfade ends', () => {
  const { container } = render(<WelcomeCarousel />);
  const picture = (id: string): Element => container.querySelector(`.atlas-welcome-slide--${id} .atlas-welcome-slide__picture`)!;
  const first = picture('welcome');
  wait(SLIDE_MS);
  expect(container.querySelector('.atlas-welcome-slide--welcome')!.getAttribute('data-state')).toBe('leaving');
  wait(CROSSFADE_MS);
  expect(container.querySelector('.atlas-welcome-slide--welcome')!.getAttribute('data-state')).toBe('off');
  fireEvent.click(within(chips()).getByRole('button', { name: 'Welcome' }));
  expect(picture('welcome')).not.toBe(first);
});

it('fills the story bar from the time the slide had left after a hold', () => {
  const { container } = render(<WelcomeCarousel />);
  const fill = (): HTMLElement => container.querySelector<HTMLElement>('.atlas-welcome-carousel__story[data-state="on"] i')!;
  wait(3000);
  setHidden(true);
  wait(10_000);
  setHidden(false);
  expect(fill().style.animationDelay).toBe('-3000ms');
  wait(SLIDE_MS - 3000);
  expect(shown()).toBe('Any map, ready in seconds');
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
    .toEqual(['Welcome', 'Maps', 'Generator', 'Tokens', 'Dice', 'Sound', 'Players', 'Yours']);
});

it('tags online play as a closed beta beside the players slide\'s heading, as a label and not a button', () => {
  render(<WelcomeCarousel />);
  fireEvent.click(within(chips()).getByRole('button', { name: 'Players' }));
  expect(shown()).toBe('Play at the table or online Closed beta');
  const tag = screen.getByText('Closed beta');
  expect(tag.closest('button')).toBeNull();
  expect(tag.className).toBe('atlas-welcome-text__tag');
  fireEvent.click(within(chips()).getByRole('button', { name: 'Sound' }));
  expect(shown()).toBe('A soundtrack for every scene');
});
