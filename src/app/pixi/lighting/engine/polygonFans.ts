import { Buffer, BufferUsage, Geometry, UniformGroup } from 'pixi.js';
import { HALO, LIGHT_LEVELS, softEdge } from '../../../lighting/lightingConstants';
import type { Point } from '../../../types/visionTypes';
import type { Polygon } from '../../../vision/visibility';
import type { EngineLight } from './types';

/** A polygon star-shaped around `origin`: a light's reach, a part of an area light's, a convex piece around its middle. */
export interface Fan {
  origin: Point;
  polygon: Polygon;
}

/** Every fan of `fans` in one geometry (world px in `aPosition`): a triangle fan from each origin covers its polygon exactly. */
export function fansGeometry(fans: readonly Fan[]): Geometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const { origin, polygon } of fans) {
    if (polygon.length < 3) continue;
    const first = positions.length / 2;
    positions.push(origin.x, origin.y);
    for (const p of polygon) positions.push(p.x, p.y);
    for (let i = 1; i <= polygon.length; i++) indices.push(first, first + i, first + (i % polygon.length) + 1);
  }
  // A geometry without a triangle draws nothing.
  if (indices.length === 0) {
    positions.push(0, 0, 0, 0, 0, 0);
    indices.push(0, 1, 2);
  }
  return new Geometry({
    attributes: { aPosition: { buffer: new Buffer({ data: new Float32Array(positions), usage: BufferUsage.VERTEX }), format: 'float32x2' } },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}

/** No cone: half an angle of a full turn, which the falloff reads as all around. */
export const ALL_AROUND = [1, 0, 2 * Math.PI, 0] as const;

/** A light's falloff as a program reads it (`LIGHT_FALLOFF_GLSL`), with the rect of the target it is drawn into in world px. */
export interface Falloff {
  uniforms: UniformGroup;
  light: Float32Array;
  color: Float32Array;
  cone: Float32Array;
}

export function createFalloff(texel: number, target: readonly number[]): Falloff {
  const light = new Float32Array(2);
  const color = new Float32Array(3);
  const cone = new Float32Array(ALL_AROUND);
  const uniforms = new UniformGroup({
    uTargetRect: { value: new Float32Array(target), type: 'vec4<f32>' },
    uLight: { value: light, type: 'vec2<f32>' },
    uBright: { value: 0, type: 'f32' },
    uDim: { value: 0, type: 'f32' },
    uIntensity: { value: 1, type: 'f32' },
    uLightColor: { value: color, type: 'vec3<f32>' },
    uBrightLevel: { value: LIGHT_LEVELS.bright, type: 'f32' },
    uDimLevel: { value: LIGHT_LEVELS.dim, type: 'f32' },
    uHaloGain: { value: HALO.gain, type: 'f32' },
    uHaloSize: { value: HALO.size, type: 'f32' },
    uTexel: { value: texel, type: 'f32' },
    uCone: { value: cone, type: 'vec4<f32>' },
    uEdge: { value: 1, type: 'f32' },
  });
  return { uniforms, light, color, cone };
}

/** Sets `falloff` to `light`'s steady falloff. */
export function setFalloff(falloff: Falloff, light: EngineLight): void {
  const u = falloff.uniforms.uniforms;
  falloff.light.set([light.x, light.y]);
  u.uBright = light.bright;
  u.uDim = light.dim;
  u.uIntensity = light.intensity;
  falloff.color.set(light.color);
  const { cone } = light;
  falloff.cone.set(cone ? [Math.cos(cone.facing), Math.sin(cone.facing), cone.angle / 2, cone.apex ?? 0] : ALL_AROUND);
  u.uEdge = light.edge ?? softEdge(light.dim);
  falloff.uniforms.update();
}

/** The average of a convex piece's corners, inside it. */
export function middleOf(piece: readonly Point[]): Point {
  return { x: piece.reduce((sum, p) => sum + p.x, 0) / piece.length, y: piece.reduce((sum, p) => sum + p.y, 0) / piece.length };
}
