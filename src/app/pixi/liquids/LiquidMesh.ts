import { Buffer, BufferImageSource, BufferUsage, Color, Geometry, Mesh, Texture, triangulateWithHoles, type Shader } from 'pixi.js';
import type { LiquidKind, LiquidSurface } from '../../types/liquidTypes';
import { fnv1a32 } from '../../utils/hashing';
import { smoulder } from '../lighting/lightFlicker';
import { courseFrame } from './liquidCourse';
import { liquidField } from './liquidField';
import { liquidDrifts, loopTime } from './liquidMotion';
import { createLiquidShader, type LiquidDetail, type LiquidUniforms } from './liquidShader';

const KIND_CODE: Readonly<Record<LiquidKind, number>> = { water: 0, lava: 1, acid: 2 };

export interface WorldBox { minX: number; minY: number; maxX: number; maxY: number }

function setColor(target: Float32Array, hex: string): void {
  const color = new Color(hex);
  target[0] = color.red;
  target[1] = color.green;
  target[2] = color.blue;
}

/** The surface as triangles, exactly its outline less its holes (earcut, as PIXI fills a polygon). */
function triangles({ polygon, holes = [] }: LiquidSurface): { positions: Float32Array; indices: Uint32Array } {
  const points: number[] = [];
  const starts: number[] = [];
  for (const ring of [polygon, ...holes]) {
    if (ring !== polygon) starts.push(points.length / 2);
    for (const { x, y } of ring) points.push(x, y);
  }
  const vertices: number[] = [];
  const indices: number[] = [];
  triangulateWithHoles(points, starts, vertices, 2, 0, indices, 0);
  return { positions: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/**
 * One liquid surface on the map: a mesh of exactly its outline, shaded by `liquidShader` with its
 * distance field. Built from the surface as read and the grid's cell; another of either builds anew.
 */
export class LiquidMesh {
  readonly mesh: Mesh<Geometry, Shader>;
  readonly bounds: WorldBox;
  private readonly geometry: Geometry;
  private readonly field: Texture;
  private readonly course: Texture | null;
  private readonly uniforms: LiquidUniforms;
  private readonly lavaPhase: number;
  private readonly drifts = new Float32Array(8);

  constructor(readonly surface: LiquidSurface, readonly cell: number) {
    const { positions, indices } = triangles(surface);
    this.geometry = new Geometry({
      attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
      indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX }),
    });
    const field = liquidField(surface.polygon, cell, surface.holes, surface.openEdges);
    this.field = new Texture({
      source: new BufferImageSource({
        resource: field.texels, width: field.width, height: field.height, format: 'rgba8unorm',
        alphaMode: 'no-premultiply-alpha', scaleMode: 'linear', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false,
      }),
    });
    const { course, flow } = surface;
    const frame = course && flow ? courseFrame(course, cell, field) : null;
    this.course = frame
      ? new Texture({
        source: new BufferImageSource({
          resource: frame.values, width: frame.width, height: frame.height, format: 'rg32float',
          alphaMode: 'no-premultiply-alpha', scaleMode: 'nearest', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false,
        }),
      })
      : null;
    const { shader, uniforms } = createLiquidShader(this.field, this.course ?? this.field);
    this.uniforms = uniforms;
    uniforms.uFieldRect.set([field.origin.x, field.origin.y, field.width * field.texel, field.height * field.texel]);
    uniforms.uFieldCode.set([field.outside, field.near, field.far, 0]);
    uniforms.uCell = cell;
    uniforms.uKind = KIND_CODE[surface.liquid];
    uniforms.uEngraved = surface.art === 'engraved' ? 1 : 0;
    uniforms.uCrayon = surface.art === 'crayon' ? 1 : 0;
    uniforms.uFlowing = flow ? 1 : 0;
    uniforms.uCoursed = frame ? 1 : 0;
    // Its frame: across the flow, then along it; a still surface keeps the map's axes.
    uniforms.uFrame.set(flow ? [-flow.y, flow.x, flow.x, flow.y] : [1, 0, 0, 1]);
    const hash = fnv1a32(surface.id);
    // Placed lights reach LightFlicker with activeLights' namespaced key.
    this.lavaPhase = (fnv1a32(surface.lavaLight ? `light:${surface.lavaLight}` : surface.id) % 7000) / 1000;
    uniforms.uSeed.set([hash % 997, (hash >>> 10) % 991]);
    setColor(uniforms.uSurface, surface.colors.surface);
    setColor(uniforms.uDeep, surface.colors.deep);
    setColor(uniforms.uGlint, surface.colors.glint);

    this.mesh = new Mesh({ geometry: this.geometry, shader, label: `liquid-${surface.liquid}` });
    this.mesh.eventMode = 'none';
    this.bounds = boxOf(surface.polygon);
    this.setTime(0);
  }

  /** Shows the surface as it moves `seconds` into its motion. */
  setTime(seconds: number, lightTimeMs = seconds * 1000): void {
    liquidDrifts(this.surface.liquid, !!this.surface.flow, seconds, this.drifts);
    this.uniforms.uDriftA.set(this.drifts.subarray(0, 4));
    this.uniforms.uDriftB.set(this.drifts.subarray(4, 8));
    this.uniforms.uTime = loopTime(seconds);
    if (this.surface.liquid === 'lava') {
      // Saver holds the smoulder steady, as Saver lighting does.
      this.uniforms.uLavaGlow = this.uniforms.uDetail > 0 ? smoulder(lightTimeMs, this.lavaPhase).intensity : 1;
    }
  }

  /** How much of its material the surface draws; a uniform only, no geometry or texture work. */
  setDetail(detail: LiquidDetail): void {
    this.uniforms.uDetail = detail;
  }

  /** Frees the mesh, its geometry, field and shader; the GL program stays shared in PIXI's cache. */
  destroy(): void {
    const shader = this.mesh.shader;
    this.mesh.destroy();
    this.geometry.destroy(true);
    shader?.destroy();
    this.field.destroy(true);
    this.course?.destroy(true);
  }
}

function boxOf(polygon: LiquidSurface['polygon']): WorldBox {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of polygon) {
    box.minX = Math.min(box.minX, x);
    box.minY = Math.min(box.minY, y);
    box.maxX = Math.max(box.maxX, x);
    box.maxY = Math.max(box.maxY, y);
  }
  return box;
}
