// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AtlasUIContext, type AtlasUIContextValue } from '../../src/app/react/root/AtlasUIContext';
import { PlacementHint } from '../../src/app/react/components/PlacementHint';
import { PlacementHand } from '../../src/app/pixi/tokenPlacement/placementHand';
import type { PixiRendererOrchestrator } from '../../src/app/PixiRendererOrchestrator';

afterEach(cleanup);

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
