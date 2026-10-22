import { Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { chordOffsets } from '../../../lighting/chordOffsets';
import { TILE_BAND_TEXELS, TILE_RAYS } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import { CapsuleField } from './CapsuleField';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, glOf, quadGeometry, renderInto, type Quad } from './gpu';

export interface TileTracerOptions {
  /** Rays across the flame where a texel sees part of it, 1 to `TILE_RAYS` (`LightingQuality.tileRays`). */
  rays?: number;
  /** Most texels one draw covers (`TILE_BAND_TEXELS`); tests compare against a single draw. */
  bandTexels?: number;
}

/**
 * One light's tile being built: traced into a raw target, then smoothed into `tile`, one band of
 * rows after another (`TileTracer.step`). Once stepped, a job is finished or dropped before
 * another is stepped; the caller owns `oneWay` and, once done, `tile`.
 */
export interface TileJob {
  readonly at: readonly [number, number];
  readonly flame: number;
  readonly rect: Rect;
  readonly oneWay: CapsuleField | null;
  readonly tile: RenderTexture;
  /** One of the tracer's raw targets, taken at the first step. */
  raw: RenderTexture | null;
  phase: 'trace' | 'smooth' | 'done';
  /** The next row of the current pass to draw. */
  row: number;
}

/**
 * Traces one light's visibility tile (`r8unorm`, one texel per field texel) through the wall
 * field, then smooths it within the free space around each texel (`tileSmoothShader.ts`).
 * Both passes draw in bands of whole rows, so no single draw runs long on a slow device, and a
 * tile can be built over several frames (`begin`, `step`).
 */
export class TileTracer {
  private readonly uniforms = new UniformGroup({
    uTileRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uLight: { value: new Float32Array(2), type: 'vec2<f32>' },
    uFlame: { value: 1, type: 'f32' },
    uRays: { value: TILE_RAYS, type: 'f32' },
    uOffsets: { value: new Float32Array(TILE_RAYS), type: 'f32', size: TILE_RAYS },
    uTexel: { value: 1, type: 'f32' },
    uHasOneWay: { value: 0, type: 'f32' },
    uExtent: { value: new Float32Array(2), type: 'vec2<f32>' },
    uBand: { value: new Float32Array([0, 1]), type: 'vec2<f32>' },
    uTexels: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  private readonly bandTexels: number;
  private readonly shader: Shader;
  private readonly smoothShader: Shader;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly smoothMesh: Mesh<Geometry, Shader>;
  /** Bound as the smoothing input between traces, so the program never keeps a raw target. */
  private readonly placeholder: RenderTexture = createPlaceholder();
  /** Bound when a light has no one-way walls, so the program always has both fields. */
  private readonly noOneWay: CapsuleField;
  private noOneWayBuilt = false;
  /**
   * The raw traces' targets, used in turn so a trace never waits for the previous tile's
   * smoothing to finish reading; freed by `release`, grown to the largest tile each held.
   */
  private readonly raws: (RenderTexture | null)[] = [null, null];
  private turn = 0;

  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField, options: TileTracerOptions = {}) {
    const rays = Math.min(TILE_RAYS, Math.max(1, Math.round(options.rays ?? TILE_RAYS)));
    this.uniforms.uniforms.uRays = rays;
    this.uniforms.uniforms.uOffsets.set(chordOffsets(rays));
    this.bandTexels = options.bandTexels ?? TILE_BAND_TEXELS;
    this.noOneWay = new CapsuleField(renderer, [0, 0, 1, 1], 1, 0, 'uOneWay');
    const resources = { tileUniforms: this.uniforms, ...field.resources(), ...this.noOneWay.resources() };
    this.shader = createShader(ENGINE_SHADERS.tile, resources);
    this.smoothShader = createShader(ENGINE_SHADERS.tileSmooth, { ...resources, uRaw: this.placeholder.source });
    this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
    this.smoothMesh = new Mesh({ geometry: this.geometry, shader: this.smoothShader });
  }

  /** The whole tile at once. `rect` must be snapped to the field's texel grid; `oneWay` holds this light's one-way walls. */
  trace(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null): RenderTexture {
    const job = this.begin(at, flame, rect, oneWay);
    this.step(job, Infinity);
    return job.tile;
  }

  /** A tile to build with `step`; draws nothing yet. */
  begin(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null): TileJob {
    const { texel } = this.field;
    const tile = createTarget(rect[2] / texel, rect[3] / texel, 'r8unorm', 'nearest');
    return { at, flame, rect, oneWay, tile, raw: null, phase: 'trace', row: 0 };
  }

  /**
   * Draws bands of `job` until `texels` are spent (at least one band, so every step gets on) or
   * the tile is done; returns the texels drawn. Jobs must not be stepped in turn with each other.
   */
  step(job: TileJob, texels: number): number {
    if (job.phase === 'done') return 0;
    // Built here, not in the constructor, which draws nothing (see `LightingWorld`).
    if (!this.noOneWayBuilt) {
      this.noOneWay.build([]);
      this.noOneWayBuilt = true;
    }
    const { texel } = this.field;
    const { pixelWidth: width, pixelHeight: height } = job.tile.source;
    if (!job.raw) {
      this.turn = 1 - this.turn;
      job.raw = this.rawFor(width, height);
    }
    const raw = job.raw;
    const u = this.uniforms.uniforms;
    u.uTileRect.set([job.rect[0], job.rect[1], width * texel, height * texel]);
    u.uLight.set(job.at);
    u.uFlame = job.flame;
    u.uTexel = texel;
    u.uHasOneWay = job.oneWay ? 1 : 0;
    u.uTexels.set([width, height]);
    this.bindOneWay(job.oneWay ?? this.noOneWay);
    this.smoothShader.resources.uRaw = raw.source;
    const rows = Math.max(1, Math.floor(this.bandTexels / width));
    let spent = 0;
    while (job.phase !== 'done' && (spent === 0 || spent < texels)) {
      const smoothing: boolean = job.phase === 'smooth';
      const target = smoothing ? job.tile : raw;
      const last = Math.min(job.row + rows, height);
      this.setExtent(target, width, height);
      u.uBand.set([job.row / height, last / height]);
      // The raw bands write every texel the smoothing reads, so the raw target needs no clear.
      renderInto(this.renderer, smoothing ? this.smoothMesh : this.mesh, target, smoothing && job.row === 0 ? [0, 0, 0, 0] : undefined);
      spent += (last - job.row) * width;
      job.row = last;
      if (last === height) {
        job.phase = smoothing ? 'done' : 'smooth';
        job.row = 0;
      }
      // Each band goes to the driver on its own, so Windows times each draw on its own.
      if (job.phase !== 'done' && spent < texels) glOf(this.renderer)?.flush();
    }
    u.uBand.set([0, 1]);
    // The raw target is replaced or released and the caller destroys `oneWay`: a destroyed
    // texture must not stay bound.
    this.smoothShader.resources.uRaw = this.placeholder.source;
    if (job.oneWay) this.bindOneWay(this.noOneWay);
    return spent;
  }

  destroy(): void {
    this.mesh.destroy();
    this.smoothMesh.destroy();
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.shader.destroy();
    this.smoothShader.destroy();
    this.placeholder.destroy(true);
    this.noOneWay.destroy();
    this.release();
  }

  /** Frees the raw targets; the next trace allocates them again. Call it only while no job is under way (stepped and not done). */
  release(): void {
    for (let i = 0; i < this.raws.length; i++) {
      this.raws[i]?.destroy(true);
      this.raws[i] = null;
    }
  }

  private setExtent(target: RenderTexture, width: number, height: number): void {
    this.uniforms.uniforms.uExtent.set([width / target.source.pixelWidth, height / target.source.pixelHeight]);
  }

  private bindOneWay(field: CapsuleField): void {
    Object.assign(this.shader.resources, field.resources());
    Object.assign(this.smoothShader.resources, field.resources());
  }

  /** This turn's raw target, at least `width` × `height`: grown to the largest tile it held. */
  private rawFor(width: number, height: number): RenderTexture {
    const raw = this.raws[this.turn];
    const current = raw?.source;
    if (raw && current && current.pixelWidth >= width && current.pixelHeight >= height) return raw;
    const grown = createTarget(Math.max(width, current?.pixelWidth ?? 0), Math.max(height, current?.pixelHeight ?? 0), 'r8unorm', 'nearest');
    raw?.destroy(true);
    this.raws[this.turn] = grown;
    return grown;
  }
}
