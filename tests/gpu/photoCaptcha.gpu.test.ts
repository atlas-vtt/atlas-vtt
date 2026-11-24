import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { expect, it, vi } from 'vitest';
import { MimicCaptcha } from '../../src/app/appearance/deYassify/MimicCaptcha';
import { dealPhotoRound, squaresUnder, type PhotoRound } from '../../src/app/appearance/deYassify/photoCaptcha';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

it('draws the photo with its mimic into the squares, waits for it, and passes the mimic\'s squares after two rigged tries', async () => {
  const dealt: PhotoRound[] = [];
  const random = seeded(21);
  const deal = (_random: () => number, nextId: number): PhotoRound => {
    const round = dealPhotoRound(random, nextId);
    dealt.push(round);
    return round;
  };
  const onSolved = vi.fn();
  const host = document.body.createDiv();
  flushSync(() => createRoot(host).render(createElement(MimicCaptcha, { onSolved, random, deal })));

  const squares = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.atlas-mimic-captcha__piece')];
  const verify = (): void => [...host.querySelectorAll('button')].find((button) => button.textContent === 'Verify')!.click();
  const complaint = (): string => host.querySelector('[role="alert"]')!.textContent ?? '';
  const solveCurrent = async (): Promise<void> => {
    await vi.waitFor(() => expect(squares().every((square) => !square.disabled)).toBe(true));
    const round = dealt[dealt.length - 1]!;
    // The squares show the drawn picture, not the bare photo.
    expect(squares()[0]!.querySelector('span')!.style.backgroundImage).toContain('data:image/png');
    expect(squares()).toHaveLength(round.side * round.side);
    for (const square of squaresUnder(round.mimic, round.side)) squares()[square]!.click();
    await vi.waitFor(() => expect(host.querySelectorAll('[aria-pressed="true"]').length).toBe(squaresUnder(round.mimic, round.side).length));
  };

  await solveCurrent();
  verify();
  await vi.waitFor(() => expect(complaint()).toBe('Nope, you did it wrong. You have to do it again.'));
  await solveCurrent();
  verify();
  await vi.waitFor(() => expect(complaint()).toBe('Please also check the new images.'));
  await solveCurrent();
  verify();
  await vi.waitFor(() => expect(onSolved).toHaveBeenCalled());
});
