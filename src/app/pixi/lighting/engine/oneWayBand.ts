import { BufferImageSource, UniformGroup, type TextureSource } from 'pixi.js';
import { segOf, type Rect, type Seg } from '../../../lighting/segments';
import type { Point } from '../../../types/visionTypes';
import type { WallSegment } from '../../../types/wallTypes';
import { blocksFrom } from '../../../vision/wallReach';
import { SEGMENT_BAND_GLSL } from './wallBandShader';

/** One-way walls a light lists at most: a light with more in its reach takes the band of every one-way wall (`WallBand.oneWayFallback`). */
export const MAX_ONE_WAY = 64;

/**
 * The band of the one-way walls that end one light (`OneWayList`), on the texel grid of the walls'
 * band (`BAND_GLSL`, read after it): `oneWayShade` is how much of the light a texel at world point
 * `w` may hold beside them, each wall's band (`SEGMENT_BAND_GLSL`) on its blocking side alone.
 * A one-way wall the light stands on the open side of is not listed, so its light passes it on
 * both sides, as the rule counts it. A light that lists more than `MAX_ONE_WAY` (count -1) reads
 * the band every one-way wall has on its blocking side (`uOneWayBand`): darker, never lighter.
 */
export const ONE_WAY_BAND_GLSL = `
uniform sampler2D uOneWay;
uniform sampler2D uOneWayBand;
uniform int uOneWayCount;
uniform float uBandRadius;
uniform float uBandRamp;
${SEGMENT_BAND_GLSL}
float oneWayShade(vec2 w) {
  if (uOneWayCount < 0) return bandTexel(uOneWayBand, w).r;
  float shade = 1.0;
  for (int i = 0; i < ${MAX_ONE_WAY}; i++) {
    if (i >= uOneWayCount) break;
    vec4 s = texelFetch(uOneWay, ivec2(i, 0), 0);
    if (!rightOf(w, s)) shade = min(shade, segmentBand(w, s, uBandRadius, uBandRamp));
  }
  return shade;
}`;

/** A one-way wall's centre line, ordered so that its blocking side (`isOnBlockingSide`) lies to the left of its first end to its second. */
export function blockingOnLeft(wall: WallSegment): Seg {
  const [x1, y1, x2, y2] = segOf(wall);
  return wall.direction === 'right' ? [x2, y2, x1, y1] : [x1, y1, x2, y2];
}

/**
 * Of the one-way walls `oneWay` (each stopping light from one side), those that end a light shining
 * from `origin` within `rect`, ordered by `blockingOnLeft`; null where they are more than `MAX_ONE_WAY`.
 */
export function oneWayEnding(oneWay: readonly WallSegment[], origin: Point, rect: Rect): Seg[] | null {
  const [x0, y0, width, height] = rect;
  const listed: Seg[] = [];
  for (const wall of oneWay) {
    if (Math.max(wall.p1.x, wall.p2.x) < x0 || Math.min(wall.p1.x, wall.p2.x) > x0 + width) continue;
    if (Math.max(wall.p1.y, wall.p2.y) < y0 || Math.min(wall.p1.y, wall.p2.y) > y0 + height) continue;
    if (!blocksFrom(wall, origin, 'light')) continue;
    if (listed.length === MAX_ONE_WAY) return null;
    listed.push(blockingOnLeft(wall));
  }
  return listed;
}

/** What one program drawing one light binds of its one-way walls (`ONE_WAY_BAND_GLSL`): the list and its count. */
export class OneWayList {
  private readonly data = new Float32Array(MAX_ONE_WAY * 4);
  // Premultiplying on upload is invalid for float data and leaves the texture empty.
  readonly source = new BufferImageSource({ resource: this.data, width: MAX_ONE_WAY, height: 1, format: 'rgba32float', scaleMode: 'nearest', alphaMode: 'no-premultiply-alpha' });
  readonly uniforms = new UniformGroup({ uOneWayCount: { value: 0, type: 'i32' } });

  /** Lists `segments`, or none and the band of every one-way wall where null (`oneWayEnding`). */
  set(segments: readonly Seg[] | null): void {
    if (segments?.length) {
      segments.forEach((seg, i) => this.data.set(seg, i * 4));
      this.source.update();
    }
    this.uniforms.uniforms.uOneWayCount = segments ? segments.length : -1;
    this.uniforms.update();
  }

  /** The resources of `ONE_WAY_BAND_GLSL` but the band's own (`WallBand.oneWayResources`). */
  resources(): Record<string, UniformGroup | TextureSource> {
    return { uOneWay: this.source, oneWayUniforms: this.uniforms };
  }

  destroy(): void {
    this.source.destroy();
  }
}
