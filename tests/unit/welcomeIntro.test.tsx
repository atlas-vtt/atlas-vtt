// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WelcomeCarousel } from '../../src/app/onboarding/welcome/WelcomeCarousel';
import { SLIDE_MS } from '../../src/app/onboarding/welcome/welcomeSlides';
import { introTimeline, titleParts, WelcomeIntro } from '../../src/app/onboarding/welcome/welcomeIntro';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const wait = (ms: number): void => { act(() => { vi.advanceTimersByTime(ms); }); };

it('splits a heading into whole words of letters, numbered across the heading', () => {
  expect(titleParts('Welcome to Atlas')).toEqual([
    { word: ['W', 'e', 'l', 'c', 'o', 'm', 'e'], first: 0 },
    { space: ' ' },
    { word: ['t', 'o'], first: 7 },
    { space: ' ' },
    { word: ['A', 't', 'l', 'a', 's'], first: 9 },
  ]);
  const combined = titleParts('Ате́ла');
  expect(combined).toHaveLength(1);
  expect(combined[0]).toEqual({ word: ['А', 'т', 'е́', 'л', 'а'], first: 0 });
});

it('spreads a long heading\'s letters over no more time than a short one may take', () => {
  const short = introTimeline(16);
  const long = introTimeline(60);
  expect(short.letterStagger).toBe(38);
  expect(long.letterStagger * 59).toBeLessThanOrEqual(700);
  expect(long.endMs).toBeLessThanOrEqual(short.endMs + 200);
  expect(short.bodyAt).toBeGreaterThan(short.lettersAt);
  expect(short.endMs).toBeGreaterThan(short.footAt);
});

function Opening({ playing }: { playing: boolean }): React.JSX.Element {
  return (
    <WelcomeIntro.Provider value={{ playing, endMs: 3000 }}>
      <WelcomeCarousel />
    </WelcomeIntro.Provider>
  );
}

it('gives the first slide its whole time only once the opening is over, and reads its heading whole', () => {
  const { rerender, container } = render(<Opening playing />);
  expect(screen.getByRole('heading', { name: 'Welcome to Atlas' })).toBeTruthy();
  expect(container.querySelectorAll('.atlas-welcome-letters__letter')).toHaveLength(14);
  const fill = container.querySelector<HTMLElement>('.atlas-welcome-carousel__story[data-state="on"] i')!;
  expect(fill.style.animationDelay).toBe('3000ms');

  wait(SLIDE_MS);
  expect(screen.getByRole('heading', { name: 'Welcome to Atlas' })).toBeTruthy();
  rerender(<Opening playing={false} />);
  wait(SLIDE_MS - 1);
  expect(screen.getByRole('heading', { name: 'Welcome to Atlas' })).toBeTruthy();
  wait(1);
  expect(screen.getByRole('heading', { name: 'Any map, ready in seconds' })).toBeTruthy();
});

it('shows the first slide as every other slide when it comes round again', () => {
  const { rerender, container } = render(<Opening playing />);
  rerender(<Opening playing={false} />);
  for (let slide = 0; slide < 8; slide += 1) wait(SLIDE_MS);
  expect(screen.getByRole('heading', { name: 'Welcome to Atlas' })).toBeTruthy();
  expect(container.querySelector('.atlas-welcome-slide--welcome')!.hasAttribute('data-opening')).toBe(false);
  expect(container.querySelectorAll('.atlas-welcome-letters__letter')).toHaveLength(0);
});
