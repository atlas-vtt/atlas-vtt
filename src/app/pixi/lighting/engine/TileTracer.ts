import { Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { chordOffsets } from '../../../lighting/chordOffsets';
import { LIGHT_LEVELS, MOVING_TILE_RAYS, TILE_BAND_TEXELS, TILE_RAYS } from '../../../lighting/lightingConstants';
import { AREA_CORNER_VECTORS } from './areaTileShader';
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
 * another is stepped, unless it is a moving light's (`moving`), which is built whole at once on a
 * raw target of its own, between the bands of another; the caller owns `oneWay` and, once done, `tile`.
 */
export interface TileJob {
  readonly at: readonly [number, number];
  readonly flame: number;
  readonly rect: Rect;
  readonly oneWay: CapsuleField | null;
  readonly tile: RenderTexture;
  /** A moving light's tile (`EngineLight.moving`): traced with `MOVING_TILE_RAYS`, built at once. */
  readonly moving: boolean;
  /** How far from `at` the light reaches (world px): texels beyond stay dark without a trace. */
  readonly reach: number;
  /** An area light's tile: its outline is drawn into a distance field first, then traced towards. */
  readonly area?: AreaJob;
  /** One of the tracer's raw targets, taken at the first step. */
  raw: RenderTexture | null;
  phase: 'distance' | 'trace' | 'blurX' | 'blurY' | 'smooth' | 'done';
  /** The next row of the current pass to draw. */
  row: number;
}

/** What an area light's tile is traced from: its outline and how its light falls off from it, in world pixels. */
export interface AreaJob {
  readonly corners: Float32Array;
  readonly count: number;
  readonly bright: number;
  readonly dim: number;
  /** Where its light ends (`LIGHT_REACH` of its dim range). */
  readonly reach: number;
  /** Sigma, in world pixels, of the blur that rounds the creases of its distance field for the light map (`areaBlurFragment`). */
  readonly blur: number;
  /** The signed distance to the outline on the tile's texel grid (`r16float`); the caller owns it once the job is done. */
  readonly distance: RenderTexture;
}

/** An area light as `beginArea` takes it. */
export interface AreaLightShape {
  corners: readonly { x: number; y: number }[];
  bright: number;
  dim: number;
  reach: number;
  blur: number;
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
    uReach: { value: NO_REACH, type: 'f32' },
    uRays: { value: TILE_RAYS, type: 'f32' },
    uOffsets: { value: new Float32Array(TILE_RAYS), type: 'f32', size: TILE_RAYS },
    uTexel: { value: 1, type: 'f32' },
    uHasOneWay: { value: 0, type: 'f32' },
    uExtent: { value: new Float32Array(2), type: 'vec2<f32>' },
    uBand: { value: new Float32Array([0, 1]), type: 'vec2<f32>' },
    uTexels: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  /** An area light's outline and falloff (`areaTileShader.ts`). */
  private readonly areaUniforms = new UniformGroup({
    uCorners: { value: new Float32Array(AREA_CORNER_VECTORS * 4), type: 'vec4<f32>', size: AREA_CORNER_VECTORS },
    uCount: { value: 0, type: 'i32' },
    uAreaBright: { value: 0, type: 'f32' },
    uAreaDim: { value: 0, type: 'f32' },
    uAreaReach: { value: 1, type: 'f32' },
    uBrightLevel: { value: LIGHT_LEVELS.bright, type: 'f32' },
    uDimLevel: { value: LIGHT_LEVELS.dim, type: 'f32' },
  });
  private readonly blurUniforms = new UniformGroup({
    uStep: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uSigma: { value: 1, type: 'f32' },
  });
  private readonly bandTexels: number;
  private readonly shader: Shader;
  private readonly blurShader: Shader;
  private readonly smoothShader: Shader;
  private readonly distanceShader: Shader;
  private readonly areaShader: Shader;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly smoothMesh: Mesh<Geometry, Shader>;
  private readonly distanceMesh: Mesh<Geometry, Shader>;
  private readonly areaMesh: Mesh<Geometry, Shader>;
  private readonly blurMesh: Mesh<Geometry, Shader>;
  /** The first direction of an area light's blur, freed by `release` like the raw targets. */
  private blurScratch: RenderTexture | null = null;
  /** Bound as the smoothing input between traces, so the program never keeps a raw target. */
  private readonly placeholder: RenderTexture = createPlaceholder();
  /** Bound when a light has no one-way walls, so the program always has both fields. */
  private readonly noOneWay: CapsuleField;
  private noOneWayBuilt = false;
  /**
   * The raw traces' targets, the first two used in turn so a trace never waits for the previous
   * tile's smoothing to finish reading, the third a moving light's; freed by `release`, grown to
   * the largest tile each held.
   */
  private readonly raws: (RenderTexture | null)[] = [null, null, null];
  private turn = 0;
  /** The light's own rays (`LightingQuality.tileRays`) and a moving light's, each with its offsets across the flame. */
  private readonly rays: { full: [number, Float32Array]; moving: [number, Float32Array] };

  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField, options: TileTracerOptions = {}) {
    const rays = Math.min(TILE_RAYS, Math.max(1, Math.round(options.rays ?? TILE_RAYS)));
    const moving = Math.min(rays, MOVING_TILE_RAYS);
    this.rays = { full: [rays, offsetsOf(rays)], moving: [moving, offsetsOf(moving)] };
    this.bandTexels = options.bandTexels ?? TILE_BAND_TEXELS;
    this.noOneWay = new CapsuleField(renderer, [0, 0, 1, 1], 1, 0, 'uOneWay');
    const resources = { tileUniforms: this.uniforms, ...field.resources(), ...this.noOneWay.resources() };
    this.shader = createShader(ENGINE_SHADERS.tile, resources);
    this.smoothShader = createShader(ENGINE_SHADERS.tileSmooth, { ...resources, uRaw: this.placeholder.source });
    this.distanceShader = createShader(ENGINE_SHADERS.areaDistance, { tileUniforms: this.uniforms, areaUniforms: this.areaUniforms });
    this.areaShader = createShader(ENGINE_SHADERS.areaTile, { ...resources, areaUniforms: this.areaUniforms, uDistance: this.placeholder.source });
    this.blurShader = createShader(ENGINE_SHADERS.areaBlur, { tileUniforms: this.uniforms, blurUniforms: this.blurUniforms, uSource: this.placeholder.source });
    this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader });
    this.blurMesh = new Mesh({ geometry: this.geometry, shader: this.blurShader });
    this.smoothMesh = new Mesh({ geometry: this.geometry, shader: this.smoothShader });
    this.distanceMesh = new Mesh({ geometry: this.geometry, shader: this.distanceShader });
    this.areaMesh = new Mesh({ geometry: this.geometry, shader: this.areaShader });
  }

  /** The whole tile at once. `rect` must be snapped to the field's texel grid; `oneWay` holds this light's one-way walls. */
  trace(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null): RenderTexture {
    const job = this.begin(at, flame, rect, oneWay);
    this.step(job, Infinity);
    return job.tile;
  }

  /** A tile to build with `step` of a light reaching `reach`, a moving light's (`moving`) to build whole; draws nothing yet. */
  begin(at: readonly [number, number], flame: number, rect: Rect, oneWay: CapsuleField | null, { moving = false, reach = Infinity }: { moving?: boolean; reach?: number } = {}): TileJob {
    const { texel } = this.field;
    const tile = createTarget(rect[2] / texel, rect[3] / texel, 'r8unorm', 'nearest');
    return { at, flame, rect, oneWay, tile, moving, reach, raw: null, phase: 'trace', row: 0 };
  }

  /**
   * An area light's tile to build with `step`, around `at` (its middle); draws nothing yet. Its
   * `area.distance` is the field of its outline, which the light map reads too.
   */
  beginArea(at: readonly [number, number], shape: AreaLightShape, rect: Rect, oneWay: CapsuleField | null): TileJob {
    const { texel } = this.field;
    const tile = createTarget(rect[2] / texel, rect[3] / texel, 'r8unorm', 'nearest');
    const distance = createTarget(rect[2] / texel, rect[3] / texel, 'r16float', 'nearest');
    const corners = new Float32Array(AREA_CORNER_VECTORS * 4);
    const count = Math.min(shape.corners.length, AREA_CORNER_VECTORS * 2);
    for (let i = 0; i < count; i++) {
      corners[2 * i] = shape.corners[i]!.x;
      corners[2 * i + 1] = shape.corners[i]!.y;
    }
    const area: AreaJob = { corners, count, bright: shape.bright, dim: shape.dim, reach: shape.reach, blur: shape.blur, distance };
    return { at, flame: 0, rect, oneWay, tile, area, moving: false, reach: Infinity, raw: null, phase: 'distance', row: 0 };
  }

  /**
   * Draws bands of `job` until `texels` are spent (at least one band, so every step gets on) or
   * the tile is done; returns the texels drawn. Jobs must not be stepped in turn with each other,
   * but a moving light's may be stepped whole between the steps of another.
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
    // A moving light's raw target is its own, as it may be built between the bands of another tile.
    if (!job.raw) {
      if (!job.moving) this.turn = 1 - this.turn;
      job.raw = this.rawFor(job.moving ? 2 : this.turn, width, height);
    }
    const raw = job.raw;
    const u = this.uniforms.uniforms;
    const [rays, offsets] = job.moving ? this.rays.moving : this.rays.full;
    u.uRays = rays;
    u.uOffsets.set(offsets);
    u.uTileRect.set([job.rect[0], job.rect[1], width * texel, height * texel]);
    u.uLight.set(job.at);
    u.uFlame = job.flame;
    // A texel more than the reach, so the last texels a light reaches are traced whole.
    u.uReach = Number.isFinite(job.reach) ? job.reach + 2 * texel : NO_REACH;
    u.uTexel = texel;
    u.uHasOneWay = job.oneWay ? 1 : 0;
    u.uTexels.set([width, height]);
    this.bindOneWay(job.oneWay ?? this.noOneWay);
    this.smoothShader.resources.uRaw = raw.source;
    if (job.area) this.setArea(job.area);
    const rows = Math.max(1, Math.floor(this.bandTexels / width));
    let spent = 0;
    while (job.phase !== 'done' && (spent === 0 || spent < texels)) {
      const { target, mesh, next } = this.pass(job, raw, width, height);
      const last = Math.min(job.row + rows, height);
      this.setExtent(target, width, height);
      u.uBand.set([job.row / height, last / height]);
      // The raw bands write every texel the smoothing reads, and the distance bands every texel the trace reads, so neither target needs a clear.
      renderInto(this.renderer, mesh, target, job.phase === 'smooth' && job.row === 0 ? [0, 0, 0, 0] : undefined);
      spent += (last - job.row) * width;
      job.row = last;
      if (last === height) {
        job.phase = next;
        job.row = 0;
      }
      // Each band goes to the driver on its own, so Windows times each draw on its own.
      if (job.phase !== 'done' && spent < texels) glOf(this.renderer)?.flush();
    }
    u.uBand.set([0, 1]);
    // The raw target is replaced or released and the caller destroys `oneWay`: a destroyed
    // texture must not stay bound.
    this.smoothShader.resources.uRaw = this.placeholder.source;
    this.areaShader.resources.uDistance = this.placeholder.source;
    this.blurShader.resources.uSource = this.placeholder.source;
    if (job.oneWay) this.bindOneWay(this.noOneWay);
    return spent;
  }

  /**
   * What the job's current phase draws, into which target, and the phase after it. An area
   * light's distance field is drawn first and traced through, then blurred for the light map,
   * across into the scratch target and back down into itself.
   */
  private pass(job: TileJob, raw: RenderTexture, width: number, height: number): { target: RenderTexture; mesh: Mesh<Geometry, Shader>; next: TileJob['phase'] } {
    const { area } = job;
    switch (job.phase) {
      case 'distance': return { target: area!.distance, mesh: this.distanceMesh, next: 'trace' };
      case 'trace': return { target: raw, mesh: area ? this.areaMesh : this.mesh, next: area ? 'blurX' : 'smooth' };
      case 'blurX': {
        const scratch = this.scratchFor(width, height);
        this.setBlur(area!, area!.distance, [1, 0]);
        return { target: scratch, mesh: this.blurMesh, next: 'blurY' };
      }
      case 'blurY':
        this.setBlur(area!, this.blurScratch!, [0, 1]);
        return { target: area!.distance, mesh: this.blurMesh, next: 'smooth' };
      default: return { target: job.tile, mesh: this.smoothMesh, next: 'done' };
    }
  }

  private setBlur(area: AreaJob, source: RenderTexture, step: [number, number]): void {
    this.blurUniforms.uniforms.uStep.set(step);
    this.blurUniforms.uniforms.uSigma = Math.max(area.blur / this.field.texel, 0.5);
    this.blurShader.resources.uSource = source.source;
  }

  /** The blur's scratch target, at least `width` × `height`. */
  private scratchFor(width: number, height: number): RenderTexture {
    const current = this.blurScratch?.source;
    if (this.blurScratch && current && current.pixelWidth >= width && current.pixelHeight >= height) return this.blurScratch;
    const grown = createTarget(Math.max(width, current?.pixelWidth ?? 0), Math.max(height, current?.pixelHeight ?? 0), 'r16float', 'nearest');
    this.blurScratch?.destroy(true);
    this.blurScratch = grown;
    return grown;
  }

  private setArea(area: AreaJob): void {
    const u = this.areaUniforms.uniforms;
    u.uCorners.set(area.corners);
    u.uCount = area.count;
    u.uAreaBright = area.bright;
    u.uAreaDim = area.dim;
    u.uAreaReach = area.reach;
    this.areaShader.resources.uDistance = area.distance.source;
  }

  destroy(): void {
    this.mesh.destroy();
    this.smoothMesh.destroy();
    this.distanceMesh.destroy();
    this.areaMesh.destroy();
    this.blurMesh.destroy();
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.shader.destroy();
    this.smoothShader.destroy();
    this.distanceShader.destroy();
    this.areaShader.destroy();
    this.blurShader.destroy();
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
    this.blurScratch?.destroy(true);
    this.blurScratch = null;
  }

  private setExtent(target: RenderTexture, width: number, height: number): void {
    this.uniforms.uniforms.uExtent.set([width / target.source.pixelWidth, height / target.source.pixelHeight]);
  }

  private bindOneWay(field: CapsuleField): void {
    Object.assign(this.shader.resources, field.resources());
    Object.assign(this.smoothShader.resources, field.resources());
    Object.assign(this.areaShader.resources, field.resources());
  }

  /** Raw target `slot`, at least `width` × `height`: grown to the largest tile it held. */
  private rawFor(slot: number, width: number, height: number): RenderTexture {
    const raw = this.raws[slot];
    const current = raw?.source;
    if (raw && current && current.pixelWidth >= width && current.pixelHeight >= height) return raw;
    const grown = createTarget(Math.max(width, current?.pixelWidth ?? 0), Math.max(height, current?.pixelHeight ?? 0), 'r8unorm', 'nearest');
    raw?.destroy(true);
    this.raws[slot] = grown;
    return grown;
  }
}

/** A reach no light has: every texel of the tile is traced. */
const NO_REACH = 1e30;

/** The offsets of `rays` rays across a flame, as the trace's uniform holds them. */
function offsetsOf(rays: number): Float32Array {
  const offsets = new Float32Array(TILE_RAYS);
  offsets.set(chordOffsets(rays));
  return offsets;
}
