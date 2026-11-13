/// <reference types="vite/client" />
import { Texture, WebGLRenderer } from 'pixi.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MEASURE_EFFECTS, MEASURE_EFFECT_STARTS, type MeasureEffect } from '../../src/app/measure/measureEffects';
import { EFFECT_STILL_SECONDS } from '../../src/app/pixi/measure/effects/effectMotion';
import { MeasureEffectMesh } from '../../src/app/pixi/measure/effects/MeasureEffectMesh';
import { contactSheet, drawnMap, drawnParchment, drawnTokens, effectShape, meanStep, renderEffects, savePng, SHAPE_NAMES, type MapKind } from './measureEffectsHarness';

/**
 * The pictures the looks are judged by, written only when asked (`VITE_EFFECT_CAPTURE=1`, into
 * `out/measure-effects/`; `VITE_EFFECT_LOOK=fire,mist` for some of them): every look on every
 * shape over a dark and a bright map in its usual colour and an unusual one, frames a thirtieth of
 * a second and seconds apart, small and large areas at 70 and 150 pixels a cell, the still picture
 * and the three qualities. Without the capture it only holds that every look draws and moves.
 * `VITE_EFFECT_REVIEW=<folder>` writes the pictures a look is reworked by instead, into that folder
 * under `out/measure-effects/` (which must exist): a circle, a cone and a line over dark stone and
 * over pencilled parchment, far (60 pixels a cell) and near (160), at four moments.
 */

const capture = import.meta.env.VITE_EFFECT_CAPTURE === '1';
const review = import.meta.env.VITE_EFFECT_REVIEW as string | undefined;
const only = (import.meta.env.VITE_EFFECT_LOOK as string | undefined)?.split(',');
const looks = MEASURE_EFFECTS.filter((effect) => !only || only.includes(effect));

/** A colour each look is rarely seen in: green fire, red frost. */
const UNUSUAL: Readonly<Record<MeasureEffect, string>> = {
  fire: '#08b94e', frost: '#e93147', lightning: '#e0ac00', mist: '#08b94e', radiance: '#7852ee', shadow: '#e93147',
};
const MAP_KINDS: readonly MapKind[] = ['dark', 'bright'];
const CELL = 100;
const TILE = { width: 460, height: 400 };
const START = 20;

describe('the looks of area effects', () => {
  let renderer: WebGLRenderer;
  const maps = new Map<string, Texture>();
  const mapOf = (kind: MapKind, width: number, height: number, cell: number): Texture => {
    const key = `${kind}-${width}-${height}-${cell}`;
    let map = maps.get(key);
    if (!map) maps.set(key, (map = Texture.from(drawnMap(kind, width, height, cell))));
    return map;
  };
  beforeAll(async () => {
    renderer = new WebGLRenderer();
    await renderer.init({ width: 64, height: 64, antialias: false });
  });
  afterAll(() => {
    for (const map of maps.values()) map.destroy(true);
    renderer.destroy();
  });

  for (const effect of looks) {
    it(`${effect} draws and moves on every shape`, async () => {
      const centre = { x: TILE.width / 2, y: TILE.height / 2 };
      const tokens = Texture.from(drawnTokens(TILE.width, TILE.height, CELL, [{ x: centre.x - 50, y: centre.y + 50 }, { x: centre.x + 150, y: centre.y - 50 }]));
      const tiles: Uint8ClampedArray[] = [];
      for (const name of SHAPE_NAMES) {
        const shape = effectShape(name, CELL, centre);
        for (const color of [MEASURE_EFFECT_STARTS[effect].color, UNUSUAL[effect]]) {
          for (const kind of MAP_KINDS) {
            const map = mapOf(kind, TILE.width, TILE.height, CELL);
            const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color, detail: 2, cell: CELL, seed: name });
            mesh.setTime(START);
            const bare = renderEffects(renderer, { ...TILE, map, meshes: [] });
            const first = renderEffects(renderer, { ...TILE, map, meshes: [mesh] });
            expect(meanStep(bare, first), `${effect} on ${name} over ${kind}`).toBeGreaterThan(0);
            mesh.setTime(START + 2);
            expect(meanStep(first, renderEffects(renderer, { ...TILE, map, meshes: [mesh] })), `${effect} moves on ${name}`).toBeGreaterThan(0);
            mesh.setTime(START);
            if (capture) tiles.push(renderEffects(renderer, { ...TILE, map, meshes: [mesh], tokens }));
            mesh.destroy();
          }
        }
      }
      if (capture) await savePng(contactSheet(tiles, TILE.width, TILE.height, 4), `${effect}-shapes`);
      tokens.destroy(true);
    });

    it.runIf(capture)(`${effect} over time`, async () => {
      const size = { width: 340, height: 340 };
      const shape = effectShape('circle', CELL, { x: 170, y: 170 }, 3);
      const moments = { consecutive: [0, 1, 2, 3, 4, 5].map((frame) => START + frame / 30), apart: [0, 0.5, 1, 2, 5, 12].map((seconds) => START + seconds) };
      const steps: string[] = [];
      for (const [name, times] of Object.entries(moments)) {
        const tiles: Uint8ClampedArray[] = [];
        for (const kind of MAP_KINDS) {
          const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail: 2, cell: CELL, seed: 'time' });
          let last: Uint8ClampedArray | null = null;
          for (const seconds of times) {
            mesh.setTime(seconds);
            const picture = renderEffects(renderer, { ...size, map: mapOf(kind, size.width, size.height, CELL), meshes: [mesh] });
            if (last) steps.push(`${name} ${kind} ${meanStep(last, picture).toFixed(2)}`);
            last = picture;
            tiles.push(picture);
          }
          mesh.destroy();
        }
        await savePng(contactSheet(tiles, size.width, size.height, times.length), `${effect}-${name}`);
      }
      console.log(`[effects] ${effect}: mean step of the pixels that change\n${steps.join('\n')}`);
    });

    it.runIf(capture)(`${effect} at small and large sizes`, async () => {
      const tiles: Uint8ClampedArray[] = [];
      const size = { width: 600, height: 600 };
      for (const kind of MAP_KINDS) {
        for (const [cell, across] of [[70, 2], [70, 8], [150, 2], [150, 3.8]] as const) {
          const shape = effectShape('circle', cell, { x: 300, y: 300 }, across);
          const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail: 2, cell, seed: 'scale' });
          mesh.setTime(START);
          tiles.push(renderEffects(renderer, { ...size, map: mapOf(kind, size.width, size.height, cell), meshes: [mesh] }));
          mesh.destroy();
        }
      }
      await savePng(contactSheet(tiles, size.width, size.height, 4), `${effect}-scale`);
    });
  }

  for (const effect of review ? looks : []) {
    it(`${effect} for review, far and near, on stone and parchment`, async () => {
      const world = { width: 460, height: 400 };
      const centre = { x: world.width / 2, y: world.height / 2 };
      const moments = [0, 0.4, 2, 9].map((seconds) => START + seconds);
      const grounds = { dark: Texture.from(drawnMap('dark', world.width, world.height, CELL)), parchment: Texture.from(drawnParchment(world.width, world.height, CELL)) };
      const tokens = Texture.from(drawnTokens(world.width, world.height, CELL, [{ x: centre.x - 50, y: centre.y + 50 }, { x: centre.x + 150, y: centre.y - 50 }]));
      for (const [ground, map] of Object.entries(grounds)) {
        const far: Uint8ClampedArray[] = [];
        for (const name of ['circle', 'cone', 'line'] as const) {
          const shape = effectShape(name, CELL, centre);
          const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail: 2, cell: CELL, seed: name });
          const near: Uint8ClampedArray[] = [];
          moments.forEach((seconds, index) => {
            mesh.setTime(seconds);
            far.push(renderEffects(renderer, { width: world.width * 0.6, height: world.height * 0.6, map, meshes: [mesh], zoom: 0.6 }));
            near.push(renderEffects(renderer, { width: world.width * 1.6, height: world.height * 1.6, map, meshes: [mesh], zoom: 1.6, tokens: index === 3 ? tokens : null }));
          });
          mesh.destroy();
          await savePng(contactSheet(near, world.width * 1.6, world.height * 1.6, 2), `${review}/${effect}-${ground}-near-${name}`);
        }
        await savePng(contactSheet(far, world.width * 0.6, world.height * 0.6, moments.length), `${review}/${effect}-${ground}-far`);
        map.destroy(true);
      }
      tokens.destroy(true);
    });
  }

  it.runIf(capture)('still pictures and the three qualities', async () => {
    const size = { width: 340, height: 340 };
    const shape = effectShape('circle', CELL, { x: 170, y: 170 }, 3);
    const still: Uint8ClampedArray[] = [];
    const quality: Uint8ClampedArray[] = [];
    for (const kind of MAP_KINDS) {
      for (const effect of MEASURE_EFFECTS) {
        const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail: 2, cell: CELL, seed: 'still' });
        mesh.setStill(true);
        still.push(renderEffects(renderer, { ...size, map: mapOf(kind, size.width, size.height, CELL), meshes: [mesh] }));
        mesh.destroy();
      }
    }
    for (const detail of [2, 1, 0] as const) {
      for (const effect of MEASURE_EFFECTS) {
        const mesh = new MeasureEffectMesh({ rings: shape.rings, origin: shape.origin, effect, color: MEASURE_EFFECT_STARTS[effect].color, detail, cell: CELL, seed: 'still' });
        mesh.setTime(EFFECT_STILL_SECONDS);
        quality.push(renderEffects(renderer, { ...size, map: mapOf('dark', size.width, size.height, CELL), meshes: [mesh] }));
        mesh.destroy();
      }
    }
    await savePng(contactSheet(still, size.width, size.height, MEASURE_EFFECTS.length), 'still');
    await savePng(contactSheet(quality, size.width, size.height, MEASURE_EFFECTS.length), 'quality');
  });
});
