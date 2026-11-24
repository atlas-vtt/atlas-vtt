import { expect, it } from 'vitest';
import { GRID_TILES, RIGGED_ATTEMPTS, clickTile, dealRound, verdict, type CaptchaRound } from '../../src/app/appearance/deYassify/mimicCaptcha';

/** A seeded random, so every run deals the same squares. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Clicks every mimic until none is left, as a GM who reads the squares right would. */
function clearMimics(round: CaptchaRound, random: () => number): CaptchaRound {
  let current = round;
  for (let guard = 0; guard < 200 && current.tiles.some((tile) => tile.kind === 'mimic'); guard += 1) {
    current = clickTile(current, current.tiles.find((tile) => tile.kind === 'mimic')!.id, random);
  }
  return current;
}

it('deals nine squares with two to five mimics', () => {
  for (let seed = 1; seed < 50; seed += 1) {
    const round = dealRound(seeded(seed));
    expect(round.tiles).toHaveLength(GRID_TILES);
    const mimics = round.tiles.filter((tile) => tile.kind === 'mimic').length;
    expect(mimics).toBeGreaterThanOrEqual(2);
    expect(mimics).toBeLessThanOrEqual(5);
    expect(new Set(round.tiles.map((tile) => tile.id)).size).toBe(GRID_TILES);
  }
});

it('fails the first submissions however right they are, then passes a cleared grid', () => {
  const random = seeded(7);
  for (let attempt = 0; attempt < RIGGED_ATTEMPTS; attempt += 1) {
    expect(verdict(clearMimics(dealRound(random), random), attempt)).toBe('rigged');
  }
  expect(verdict(clearMimics(dealRound(random), random), RIGGED_ATTEMPTS)).toBe('pass');
});

it('never passes with a mimic left or a chest taken for one', () => {
  const random = seeded(11);
  const round = dealRound(random);
  expect(verdict(round, RIGGED_ATTEMPTS)).toBe('mimic-left');
  const chest = round.tiles.find((tile) => tile.kind === 'chest')!;
  const tookChest = clearMimics(clickTile(round, chest.id, random), random);
  expect(tookChest.clickedChest).toBe(true);
  expect(verdict(tookChest, RIGGED_ATTEMPTS)).toBe('chest-clicked');
});

it('replaces a clicked square in place with a new one', () => {
  const random = seeded(3);
  const round = dealRound(random);
  const clicked = round.tiles[4]!;
  const next = clickTile(round, clicked.id, random);
  expect(next.tiles).toHaveLength(GRID_TILES);
  expect(next.tiles[4]!.id).not.toBe(clicked.id);
  expect(next.tiles.filter((_, at) => at !== 4)).toEqual(round.tiles.filter((_, at) => at !== 4));
});
