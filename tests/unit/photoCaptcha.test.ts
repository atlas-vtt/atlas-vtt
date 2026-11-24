import { expect, it } from 'vitest';
import { dealPhotoRound, photoVerdict, squaresUnder, togglePick, type Sticker } from '../../src/app/appearance/deYassify/photoCaptcha';
import { dealAnyRound } from '../../src/app/appearance/deYassify/mimicCaptcha';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const sticker = (x: number, y: number, width: number, turn = 0): Sticker => ({ picture: '', aspect: 0.75, x, y, width, turn });

it('counts every square any part of the mimic covers, a sliver too', () => {
  // Small and in the middle of the middle square.
  expect(squaresUnder(sticker(0.5, 0.5, 0.1), 3)).toEqual([4]);
  // Just across the line into the right-hand column: that square counts too.
  expect(squaresUnder(sticker(0.62, 0.5, 0.1), 3)).toEqual([4, 5]);
  // Turned, it reaches further: the box around it grows.
  expect(squaresUnder(sticker(0.5, 0.5, 0.3, 45), 3).length).toBeGreaterThan(squaresUnder(sticker(0.5, 0.5, 0.3), 3).length);
  // On a 4 × 4 grid, the squares are numbered row by row.
  expect(squaresUnder(sticker(0.1, 0.9, 0.05), 4)).toEqual([12]);
});

it('fails twice whatever is picked, then passes exactly the mimic\'s squares and nothing else', () => {
  const round = dealPhotoRound(seeded(4));
  const wanted = squaresUnder(round.mimic, round.side);
  const right = wanted.reduce(togglePick, round);
  expect(photoVerdict(right, 0, 2)).toBe('rigged');
  expect(photoVerdict(right, 1, 2)).toBe('rigged');
  expect(photoVerdict(right, 2, 2)).toBe('pass');
  const extra = togglePick(right, [...Array(round.side * round.side).keys()].find((square) => !wanted.includes(square))!);
  expect(photoVerdict(extra, 2, 2)).toBe('wrong-squares');
  expect(photoVerdict(togglePick(right, wanted[0]!), 2, 2)).toBe('wrong-squares');
});

it('deals both kinds of round', () => {
  const random = seeded(8);
  const kinds = new Set(Array.from({ length: 30 }, (_, at) => dealAnyRound(random, at * 20).kind));
  expect(kinds).toEqual(new Set(['chests', 'photo']));
});
