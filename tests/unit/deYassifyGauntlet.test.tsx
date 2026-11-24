// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { confirmDeYassify } from '../../src/app/appearance/deYassify/confirmDeYassify';
import { DE_YASSIFY_STALL_MS } from '../../src/app/appearance/deYassify/DeYassifyGauntlet';
import { dealRound } from '../../src/app/appearance/deYassify/mimicCaptcha';

/** Chest rounds only: street squares draw on a canvas, which jsdom has not (tests/gpu/streetSquares.gpu.test.ts). */
const chestsOnly = (random: () => number, nextId: number, trickling: boolean) => dealRound(random, nextId, trickling);

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

/** A seeded random, so every run deals the same squares. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });
const press = async (name: string): Promise<void> => { await act(async () => { fireEvent.click(button(name)); }); };

/** Waits out every square on its way in: the longest arrival is under ten seconds. */
const waitForSquares = async (): Promise<void> => { await act(async () => { vi.advanceTimersByTime(10_000); }); };

/** Clicks every square showing a mimic until none is left, waiting for each new one, as a patient GM would. */
async function clearMimics(): Promise<void> {
  await waitForSquares();
  for (let guard = 0; guard < 200; guard += 1) {
    const mimic = [...document.querySelectorAll<HTMLImageElement>('.atlas-mimic-captcha__square img:not(.atlas-mimic-captcha__leaving)')].find((img) => img.src.includes('mimic'));
    if (!mimic) return;
    await act(async () => { fireEvent.click(mimic.closest('button')!); });
    await waitForSquares();
  }
}

it('keeps Yassify on at the first No, which is the accent button', async () => {
  const result = confirmDeYassify({ random: seeded(1), deal: chestsOnly });
  await act(async () => {});
  expect(screen.getByText('Are you sure you want to de-Yassify Atlas?')).toBeTruthy();
  expect(button('No').className).toContain('btn--default');
  expect(button('Yes').className).toContain('btn--ghost');
  await press('No');
  await expect(result).resolves.toBe(false);
  expect(document.querySelector('.atlas-text-dialog')).toBeNull();
});

it('keeps Yassify on when the dialog is closed with Escape', async () => {
  const result = confirmDeYassify({ random: seeded(2), deal: chestsOnly });
  await act(async () => {});
  await act(async () => { fireEvent.keyDown(document.querySelector('.atlas-text-dialog')!, { key: 'Escape' }); });
  await expect(result).resolves.toBe(false);
});

it('turns Yassify off only after a wait, the extra-sure ask, a security check that asks twice to go on, and a captcha that fails twice whatever is picked', async () => {
  vi.useFakeTimers();
  const result = confirmDeYassify({ random: seeded(3), deal: chestsOnly });
  await act(async () => {});
  await press('Yes');
  expect(screen.getByText('De-yassifying…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  await act(async () => { vi.advanceTimersByTime(DE_YASSIFY_STALL_MS); });
  expect(screen.getByText('Are you extra sure you want to de-Yassify Atlas?')).toBeTruthy();
  expect(button('Yes').className).toContain('atlas-de-yassify__yes--tiny');
  expect(button('No').className).toContain('atlas-de-yassify__no--huge');
  await press('Yes');
  expect(screen.getByText('Checking security…')).toBeTruthy();
  await act(async () => { vi.advanceTimersByTime(DE_YASSIFY_STALL_MS - 1); });
  expect(screen.queryByText('Hey, this is taking quite a while. Do you want to continue?')).toBeNull();
  await act(async () => { vi.advanceTimersByTime(1); });
  // The check asks twice whether to go on, its spinner still turning, No still the accent button.
  expect(screen.getByText('Hey, this is taking quite a while. Do you want to continue?')).toBeTruthy();
  expect(document.querySelector('.atlas-spinner')).not.toBeNull();
  expect(button('No').className).toContain('btn--default');
  await press('Yes');
  expect(screen.getByText('Are you sure you want to continue?')).toBeTruthy();
  expect(document.querySelector('.atlas-spinner')).not.toBeNull();
  expect(button('Yes').className).toContain('atlas-de-yassify__yes--tiny');
  await press('Yes');
  expect(screen.getByText('Select all squares with a mimic')).toBeTruthy();

  // Right twice, and still wrong.
  await clearMimics();
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('Nope, you did it wrong. You have to do it again.');
  await clearMimics();
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('Please also check the new images.');
  // The new grid trickles in: Verify waits for it, at no cost.
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('Please wait for the new images.');
  // A mimic left over is caught.
  await waitForSquares();
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('A mimic got away. Do it again.');
  await clearMimics();
  await press('Verify');
  await expect(result).resolves.toBe(true);
});

it('keeps Yassify on when the GM stops at the slow security check', async () => {
  vi.useFakeTimers();
  const result = confirmDeYassify({ random: seeded(4), deal: chestsOnly });
  await act(async () => {});
  await press('Yes');
  await act(async () => { vi.advanceTimersByTime(DE_YASSIFY_STALL_MS); });
  await press('Yes');
  await act(async () => { vi.advanceTimersByTime(DE_YASSIFY_STALL_MS); });
  await press('No');
  await expect(result).resolves.toBe(false);
});
