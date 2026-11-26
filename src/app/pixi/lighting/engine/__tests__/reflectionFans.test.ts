import { describe, expect, it } from 'vitest';
import type { Geometry } from 'pixi.js';
import type { ReflectionPart } from '../../../../vision/reflectedLight';
import { reflectionFans } from '../ReflectionTiles';

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The arrays reflectionFans fills, as the former implementation filled them: one small array per corner. */
function formerArrays(parts: readonly ReflectionPart[]): { positions: Float32Array; info: Float32Array; indices: Uint32Array } {
  const corners = parts.reduce((sum, part) => sum + part.polygon.length + 1, 0);
  const positions = new Float32Array(corners * 2);
  const info = new Float32Array(corners * 4);
  const indices: number[] = [];
  let base = 0;
  for (const { origin, reach, strength, polygon } of parts) {
    const points = [origin, ...polygon];
    points.forEach((p, i) => {
      positions.set([p.x, p.y], (base + i) * 2);
      info.set([origin.x, origin.y, reach, strength], (base + i) * 4);
    });
    for (let i = 1; i <= polygon.length; i++) indices.push(base, base + i, base + (i % polygon.length) + 1);
    base += points.length;
  }
  return { positions, info, indices: new Uint32Array(indices) };
}

const dataOf = (geometry: Geometry, name: string): Float32Array => geometry.getAttribute(name).buffer.data as Float32Array;

describe('reflectionFans', () => {
  it('fills the same vertices, part data and triangles as one array per corner did', () => {
    const random = rng(5);
    for (let trial = 0; trial < 200; trial++) {
      const parts: ReflectionPart[] = Array.from({ length: Math.floor(random() * 33) }, () => {
        const origin = { x: random() * 4000, y: random() * 4000 };
        return { origin, reach: random() * 400, strength: random(), polygon: Array.from({ length: Math.floor(random() * 90) }, () => ({ x: origin.x + (random() - 0.5) * 800, y: origin.y + (random() - 0.5) * 800 })) };
      });
      const geometry = reflectionFans(parts);
      const former = formerArrays(parts);
      expect(dataOf(geometry, 'aPosition')).toEqual(former.positions);
      expect(dataOf(geometry, 'aPart')).toEqual(former.info);
      expect(geometry.indexBuffer.data).toEqual(former.indices);
      geometry.destroy(true);
    }
  });
});
