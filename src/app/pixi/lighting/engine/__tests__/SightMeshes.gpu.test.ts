import { Container, Graphics, RenderTexture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SightMeshes } from '../SightMeshes';
import { SightCache, computeSight, type SightSource } from '../../../../vision/sight';
import type { SeenSpot } from '../../../../vision/perception';
import { computeVisibility } from '../../../../vision/visibility';
import type { WallSegment } from '../../../../types/wallTypes';
import type { VisionCone } from '../../../../vision/visionCone';
import { createTestRenderer, readRgba } from './gpuTestUtils';
import { darkvision, senseSource } from '../../../../vision/__tests__/senseSources';

/** Every range counts as the whole map's (`SightMeshes.draw`'s `unlimited`): the channels drawn whole, without the fade towards a range's edge. */
const NO_FADE = 0;

const spot = (x: number, y: number): SeenSpot => ({ x, y, radius: 12, polygon: computeVisibility({ x, y }, 12, []) });

describe('SightMeshes', () => {
  it('draws sight crisp at the wall, soft past its corner, nothing behind it', async () => {
    const renderer = await createTestRenderer(256);
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 128, y: 40 }, p2: { x: 128, y: 120 } };
    const sight = computeSight([{ tokenId: 't', origin: { x: 60, y: 80 }, range: 400, senses: [] }], [wall]);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    try {
      meshes.draw(sight, 20, NO_FADE);
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const px = readRgba(renderer, target);
      const red = (x: number, y: number): number => px[(y * 256 + x) * 4]!;
      expect(red(90, 80)).toBe(255);
      expect(red(200, 80)).toBe(0);
      // The wedge fans out from the wall's upper corner (128, 40) along the shadow edge (68, -40) and opens
      // 14.2 degrees towards the lit side: at x = 160 it runs from the edge at y = 21.2 to y = 8.4.
      expect(red(160, 24)).toBe(0);
      expect(red(160, 20)).toBeGreaterThan(0);
      expect(red(160, 20)).toBeLessThan(red(160, 15));
      expect(red(160, 15)).toBeGreaterThan(100);
      expect(red(160, 15)).toBeLessThan(160);
      expect(red(160, 15)).toBeLessThan(red(160, 10));
      expect(red(160, 10)).toBeLessThan(255);
      expect(red(160, 6)).toBe(255);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('draws a cone with hard edges from the token, never where the full polygon draws nothing', async () => {
    const renderer = await createTestRenderer(256);
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 200, y: 100 }, p2: { x: 200, y: 200 } };
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    const render = (cone?: VisionCone): Uint8ClampedArray => {
      meshes.draw(computeSight([{ tokenId: 't', origin: { x: 128, y: 128 }, range: 400, senses: [], ...(cone && { cone }) }], [wall]), 20, NO_FADE);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      return readRgba(renderer, target);
    };
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      const full = render();
      // Facing down with a half turn: the cone's edges run along y = 128, the fan's own first vertex angle.
      const down = render({ facing: Math.PI / 2, angle: Math.PI });
      const red = (px: Uint8ClampedArray, x: number, y: number): number => px[(y * 256 + x) * 4]!;
      expect(red(down, 128, 200)).toBe(255);
      expect(red(down, 40, 131)).toBe(255);
      expect(red(down, 180, 131)).toBe(255);
      expect(red(down, 128, 60)).toBe(0);
      expect(red(down, 40, 124)).toBe(0);
      const right = render({ facing: 0, angle: Math.PI / 2 });
      expect(red(right, 180, 128)).toBe(255);
      expect(red(right, 180, 172)).toBe(255);
      expect(red(right, 180, 184)).toBe(0);
      expect(red(right, 60, 128)).toBe(0);
      expect(red(right, 240, 150)).toBe(0);
      for (const cone of [{ facing: 0.4, angle: 2.2 }, { facing: -2.5, angle: 4 }, { facing: Math.PI, angle: 1 }]) {
        const px = render(cone);
        let outside = 0;
        for (let i = 0; i < px.length; i += 4) if (full[i] === 0 && px[i]! > 0) outside++;
        expect(outside).toBe(0);
      }
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('puts darkvision in green, combines tokens with max, and draws nothing when everything is seen', async () => {
    const renderer = await createTestRenderer(256);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    const render = (): Uint8ClampedArray => {
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      return readRgba(renderer, target);
    };
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      const sources = [
        { tokenId: 'a', origin: { x: 60, y: 128 }, range: 60, senses: [] },
        { tokenId: 'b', origin: { x: 100, y: 128 }, range: 60, senses: [darkvision(30)] },
      ];
      meshes.draw(computeSight(sources, []), 20, NO_FADE);
      const px = render();
      const at = (x: number, y: number, channel: number): number => px[(y * 256 + x) * 4 + channel]!;
      expect(at(100, 128, 0)).toBe(255);
      expect(at(100, 128, 1)).toBe(255);
      expect(at(40, 128, 0)).toBe(255);
      expect(at(40, 128, 1)).toBe(0);
      expect(at(155, 128, 0)).toBe(255);
      expect(at(180, 128, 0)).toBe(0);
      expect(meshes.view.children).toHaveLength(3);

      meshes.draw(computeSight([], []), 20, NO_FADE);
      expect(meshes.view.children).toHaveLength(0);
      const cleared = render();
      expect(cleared[(128 * 256 + 100) * 4]).toBe(0);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('writes each sense into its channels, alpha included, and a seen token\'s footprint into red and blue', async () => {
    const renderer = await createTestRenderer(256);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      // Sight to 100 px, low-light vision as far, blindsight to 40 px.
      const source = { tokenId: 'a', origin: { x: 100, y: 128 }, range: 100, senses: [senseSource('low-light-vision', 4000), senseSource('blindsight', 40)] };
      meshes.draw(computeSight([source], []), 20, NO_FADE);
      meshes.drawSpots([spot(230, 30)]);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const px = readRgba(renderer, target);
      const at = (x: number, y: number): number[] => Array.from(px.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
      expect(at(120, 128)).toEqual([255, 0, 255, 255]);
      expect(at(170, 128)).toEqual([255, 0, 0, 255]);
      expect(at(210, 128)).toEqual([0, 0, 0, 0]);
      expect(at(230, 30)).toEqual([255, 0, 255, 0]);
      expect(at(230, 50)).toEqual([0, 0, 0, 0]);
      // Sight and low-light vision reach as far and share one mesh; blindsight has its own; then the spot.
      expect(meshes.view.children).toHaveLength(3);
      // The spots are drawn anew without the sight, and the sight without the spots.
      const sightMeshes = meshes.view.children.slice(0, 2);
      meshes.drawSpots([spot(30, 230)]);
      expect(meshes.view.children[0]).toBe(sightMeshes[0]);
      expect(meshes.view.children[1]).toBe(sightMeshes[1]);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const moved = readRgba(renderer, target);
      expect(Array.from(moved.slice((30 * 256 + 230) * 4, (30 * 256 + 230) * 4 + 4))).toEqual([0, 0, 0, 0]);
      expect(Array.from(moved.slice((230 * 256 + 30) * 4, (230 * 256 + 30) * 4 + 4))).toEqual([255, 0, 255, 0]);
      meshes.draw(computeSight([source], []), 20, NO_FADE);
      expect(meshes.view.children).toHaveLength(3);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('keeps the meshes of tokens that did not move, and draws only a changed token anew', async () => {
    const renderer = await createTestRenderer(256);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    const cache = new SightCache();
    // The cache knows its walls by their list: the same one keeps the regions of a token that did not move.
    const NO_WALLS: WallSegment[] = [];
    const still = { tokenId: 'still', origin: { x: 60, y: 128 }, range: 50, senses: [darkvision(30)] };
    const mover = (x: number, senses = [senseSource('low-light-vision', 4000)]): SightSource => ({ tokenId: 'mover', origin: { x, y: 128 }, range: 40, senses });
    const draw = (source: SightSource): Uint8ClampedArray => {
      meshes.draw(computeSight([still, source], NO_WALLS, cache), 20, NO_FADE);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      return readRgba(renderer, target);
    };
    const at = (px: Uint8ClampedArray, x: number, y: number): number[] => Array.from(px.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4));
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      const first = draw(mover(180));
      // Three areas: the still token's sight and its darkvision, the mover's sight with low-light vision.
      expect(meshes.view.children).toHaveLength(3);
      expect(at(first, 180, 128)).toEqual([255, 0, 0, 255]);
      const kept = meshes.view.children.slice(0, 2);

      const moved = draw(mover(200));
      expect(meshes.view.children).toHaveLength(3);
      expect(meshes.view.children[0]).toBe(kept[0]);
      expect(meshes.view.children[1]).toBe(kept[1]);
      expect(at(moved, 230, 128)).toEqual([255, 0, 0, 255]);
      expect(at(moved, 150, 128)).toEqual([0, 0, 0, 0]);
      expect(at(moved, 60, 128)).toEqual([255, 255, 0, 0]);

      // The mover loses its low-light vision: its area is drawn anew, without alpha, and the still token's stay.
      const plain = draw(mover(200, []));
      expect(meshes.view.children).toHaveLength(3);
      expect(kept.every((mesh) => meshes.view.children.includes(mesh))).toBe(true);
      expect(at(plain, 230, 128)).toEqual([255, 0, 0, 0]);

      // Another footprint radius draws every area anew, into the same meshes, filled again.
      const before = [...meshes.view.children];
      meshes.draw(computeSight([still, mover(200, [])], NO_WALLS, cache), 35, NO_FADE);
      expect(meshes.view.children).toHaveLength(3);
      expect(meshes.view.children.every((mesh) => before.includes(mesh))).toBe(true);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const refilled = readRgba(renderer, target);
      expect(at(refilled, 230, 128)).toEqual([255, 0, 0, 0]);
      expect(at(refilled, 60, 128)).toEqual([255, 255, 0, 0]);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });

  it('fades a sense with a range towards its edge, to nothing on it, and one that reaches the whole map not at all', async () => {
    const renderer = await createTestRenderer(256);
    const meshes = new SightMeshes();
    const stage = new Container();
    const target = RenderTexture.create({ width: 256, height: 256 });
    try {
      stage.addChild(new Graphics().rect(0, 0, 256, 256).fill({ color: 0, alpha: 0 }), meshes.view);
      // Darkvision to 100 px from (28, 128); sight that reaches the whole 256 px map.
      const whole = Math.hypot(256, 256);
      meshes.draw(computeSight([{ tokenId: 't', origin: { x: 28, y: 128 }, range: whole, senses: [darkvision(100)] }], []), 20, whole);
      renderer.render({ container: stage, target, clear: true, clearColor: [0, 0, 0, 0] });
      const px = readRgba(renderer, target);
      const green = (d: number): number => px[(128 * 256 + 28 + d) * 4 + 1]!;
      const red = (d: number): number => px[(128 * 256 + 28 + d) * 4]!;
      // Whole up to the last `SENSE_FADE` (40 %) of its range, then falling, steadily, to nothing at its edge.
      expect(green(50)).toBe(255);
      expect(green(80)).toBeGreaterThan(30);
      expect(green(80)).toBeLessThan(255);
      expect(green(97)).toBeLessThan(5);
      for (let d = 60; d < 100; d++) expect(green(d + 1)).toBeLessThanOrEqual(green(d));
      // Sight that reaches the whole map does not fade.
      expect(red(220)).toBe(255);
    } finally {
      meshes.destroy();
      target.destroy(true);
      stage.destroy({ children: true });
      renderer.destroy();
    }
  });
});
