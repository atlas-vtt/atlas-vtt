import { expect, it } from 'vitest';
import { dealScene } from '../../src/app/appearance/deYassify/streetScenes';
import { clickTile, dealAnyRound, dealRound } from '../../src/app/appearance/deYassify/mimicCaptcha';

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

it('glues a mimic into a mimic\'s square, and a plain chest or nothing into a chest\'s', () => {
  const random = seeded(2);
  for (let at = 0; at < 40; at += 1) {
    expect(dealScene(true, random).sticker?.picture).toContain('sticker-mimic');
    const chest = dealScene(false, random).sticker;
    if (chest) expect(chest.picture).toContain('sticker-chest');
  }
});

it('shows a part of a photo that lies within it, slightly blocky at most', () => {
  const random = seeded(6);
  const pixels = new Set<number>();
  for (let at = 0; at < 60; at += 1) {
    const scene = dealScene(at % 2 === 0, random);
    expect(scene.cropX + scene.cropSide).toBeLessThanOrEqual(1);
    expect(scene.cropY + scene.cropSide).toBeLessThanOrEqual(1);
    pixels.add(scene.pixels);
  }
  expect(Math.min(...pixels)).toBeGreaterThanOrEqual(80);
  expect(Math.max(...pixels)).toBeGreaterThanOrEqual(160);
});

it('deals street rounds whose every square is its own upright scene, and keeps the style for new squares', () => {
  const random = seeded(12);
  const round = dealRound(random, 0, false, 'streets');
  expect(round.tiles.every((tile) => tile.scene && tile.turn === 0)).toBe(true);
  expect(round.tiles.filter((tile) => tile.kind === 'mimic').every((tile) => tile.scene!.sticker?.picture.includes('sticker-mimic'))).toBe(true);
  const next = clickTile(round, round.tiles[0]!.id, random);
  expect(next.style).toBe('streets');
  expect(next.tiles[0]!.scene).toBeDefined();
});

it('deals both styles of round', () => {
  const random = seeded(8);
  expect(new Set(Array.from({ length: 30 }, (_, at) => dealAnyRound(random, at * 20).style))).toEqual(new Set(['chests', 'streets']));
});
