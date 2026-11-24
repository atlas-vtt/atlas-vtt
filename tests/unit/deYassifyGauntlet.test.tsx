// @vitest-environment jsdom
import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { confirmDeYassify } from '../../src/app/appearance/deYassify/confirmDeYassify';
import { DE_YASSIFY_STALL_MS } from '../../src/app/appearance/deYassify/DeYassifyGauntlet';

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

/** Clicks every square showing a mimic until none is left, as a GM who reads the blurry squares right would. */
async function clearMimics(): Promise<void> {
  for (let guard = 0; guard < 200; guard += 1) {
    const mimic = [...document.querySelectorAll<HTMLImageElement>('.atlas-mimic-captcha__square img')].find((img) => img.src.includes('mimic'));
    if (!mimic) return;
    await act(async () => { fireEvent.click(mimic.closest('button')!); });
  }
}

it('keeps Yassify on at the first No, which is the accent button', async () => {
  const result = confirmDeYassify(seeded(1));
  await act(async () => {});
  expect(screen.getByText('Are you sure you want to de-Yassify Atlas?')).toBeTruthy();
  expect(button('No').className).toContain('btn--default');
  expect(button('Yes').className).toContain('btn--ghost');
  await press('No');
  await expect(result).resolves.toBe(false);
  expect(document.querySelector('.atlas-text-dialog')).toBeNull();
});

it('keeps Yassify on when the dialog is closed with Escape', async () => {
  const result = confirmDeYassify(seeded(2));
  await act(async () => {});
  await act(async () => { fireEvent.keyDown(document.querySelector('.atlas-text-dialog')!, { key: 'Escape' }); });
  await expect(result).resolves.toBe(false);
});

it('turns Yassify off only after the wait, the extra-sure ask and a captcha that fails twice whatever is picked', async () => {
  vi.useFakeTimers();
  const result = confirmDeYassify(seeded(3));
  await act(async () => {});
  await press('Yes');
  expect(screen.getByText('De-yassifying…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  await act(async () => { vi.advanceTimersByTime(DE_YASSIFY_STALL_MS); });
  expect(screen.getByText('Are you extra sure you want to de-Yassify Atlas?')).toBeTruthy();
  expect(button('Yes').className).toContain('atlas-de-yassify__yes--tiny');
  expect(button('No').className).toContain('atlas-de-yassify__no--huge');
  await press('Yes');
  expect(screen.getByText('Select all squares with a mimic')).toBeTruthy();

  // Right twice, and still wrong.
  await clearMimics();
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('Nope, you did it wrong. You have to do it again.');
  await clearMimics();
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('Please also check the new images.');
  // A mimic left over is caught.
  await press('Verify');
  expect(screen.getByRole('alert').textContent).toBe('A mimic got away. Do it again.');
  await clearMimics();
  await press('Verify');
  await expect(result).resolves.toBe(true);
});
