import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { expect, it, vi } from 'vitest';
import { MimicCaptcha } from '../../src/app/appearance/deYassify/MimicCaptcha';
import { dealRound } from '../../src/app/appearance/deYassify/mimicCaptcha';

it('draws every street square as its own picture once the photos are loaded, and lets them be clicked then', async () => {
  let state = 31;
  const random = (): number => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  const host = document.body.createDiv();
  flushSync(() => createRoot(host).render(createElement(MimicCaptcha, {
    onSolved: () => {},
    random,
    deal: (r: () => number, id: number, trickling: boolean) => dealRound(r, id, trickling, 'streets'),
  })));
  const squares = (): HTMLButtonElement[] => [...host.querySelectorAll<HTMLButtonElement>('.atlas-mimic-captcha__square')];
  await vi.waitFor(() => expect(squares().every((square) => !square.disabled)).toBe(true));
  const sources = squares().map((square) => square.querySelector('img')!.getAttribute('src')!);
  expect(sources.every((src) => src.startsWith('data:image/png'))).toBe(true);
  expect(new Set(sources).size).toBe(9);
  squares()[0]!.click();
  await vi.waitFor(() => expect(squares()[0]!.disabled).toBe(true));
});
