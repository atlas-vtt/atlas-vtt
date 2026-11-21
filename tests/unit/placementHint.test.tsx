// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { PlacementHint } from '../../src/app/react/components/PlacementHint';
import { PlacementHand } from '../../src/app/pixi/tokenPlacement/placementHand';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';

const pointer = vi.hoisted(() => ({ coarse: false }));
vi.mock('../../src/app/platform/useCoarsePointer', () => ({ useCoarsePointer: () => pointer.coarse }));

afterEach(() => {
  cleanup();
  pointer.coarse = false;
});

function renderHint(): { hand: PlacementHand; hint: () => string | null } {
  const hand = new PlacementHand();
  const ui = { app: {}, view: null, pixiApp: null, renderer: { placementHand: hand } as unknown as PixiRendererOrchestrator } as AtlasUIContextValue;
  const { container } = render(<AtlasUIContext.Provider value={ui}><PlacementHint /></AtlasUIContext.Provider>);
  return { hand, hint: () => container.querySelector('.atlas-placement-hint')?.textContent ?? null };
}

it('says how to place and cancel only while a token is in hand', () => {
  const { hand, hint } = renderHint();
  expect(hint()).toBeNull();

  act(() => hand.set(1));
  expect(hint()).toBe('Click to place · Esc to cancel');

  act(() => hand.set(0));
  expect(hint()).toBeNull();
});

it('names Shift while more than one token is in hand, and drops it once one is left', () => {
  const { hand, hint } = renderHint();
  act(() => hand.set(3));
  expect(hint()).toBe('Click to place all · Shift-click to place one at a time · Esc to cancel');

  act(() => hand.set(1));
  expect(hint()).toBe('Click to place · Esc to cancel');
});

it('is read out from a live region that stays mounted', () => {
  const { hand } = renderHint();
  const region = document.querySelector('[aria-live="polite"]');
  act(() => hand.set(2));
  expect(document.querySelector('[aria-live="polite"]')).toBe(region);
  expect(region?.textContent).not.toBe('');
});

it('tells listeners only of real changes, and stops when asked', () => {
  const hand = new PlacementHand();
  let calls = 0;
  const stop = hand.subscribe(() => { calls++; });
  hand.set(2);
  hand.set(2);
  hand.set(0);
  stop();
  hand.set(4);
  expect(calls).toBe(2);
  expect(hand.size).toBe(4);
});

it('is a strip of buttons under a finger: the count, one by one, the queue\'s steps and Done', () => {
  pointer.coarse = true;
  const { hand, hint } = renderHint();
  const calls: string[] = [];
  hand.bind({ keepQueue: (kept) => calls.push(`queue ${kept}`), cycle: (steps) => calls.push(`cycle ${steps}`), cancel: () => calls.push('cancel') });
  expect(screen.queryByRole('toolbar')).toBeNull();

  act(() => hand.set(3));
  // No line that names a click, Shift or Escape.
  expect(hint()).toBeNull();
  expect(screen.getByRole('toolbar', { name: 'Placing tokens' }).textContent).toContain('3 tokens');
  const button = (name: string): HTMLElement => screen.getByRole('button', { name });
  // The queue's steps wait for the queue.
  expect(button('Next token').getAttribute('aria-disabled')).toBe('true');
  fireEvent.click(button('One by one'));
  expect(button('One by one').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(button('Next token'));
  fireEvent.click(button('Previous token'));
  fireEvent.click(button('Done'));
  expect(calls).toEqual(['queue false', 'queue true', 'cycle 1', 'cycle -1', 'cancel']);
});

it('keeps its buttons in place with one token in hand, the queue\'s disabled', () => {
  pointer.coarse = true;
  const { hand } = renderHint();
  act(() => hand.set(1));
  expect(screen.getByRole('toolbar').textContent).toContain('1 token');
  for (const name of ['One by one', 'Previous token', 'Next token']) {
    expect(screen.getByRole('button', { name }).getAttribute('aria-disabled')).toBe('true');
  }
  expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
});
