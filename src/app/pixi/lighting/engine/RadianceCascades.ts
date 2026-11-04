import { Mesh, TextureSource, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader, type Texture } from 'pixi.js';
import { BOUNCE } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import type { MapBounds } from '../../../vision/visibility';
import { bounceReach, intervalStart } from './bounceArea';
import type { CapsuleField } from './CapsuleField';
import { ENGINE_SHADERS, type EngineShaderSource } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { LightMap } from './LightMap';

type Pass = Mesh<Geometry, Shader>;

/** Texels of a target: left, top, right, bottom. */
type TexelBox = readonly [number, number, number, number];

/** A build under way: the world rect its cascades redraw (null: all of it), the cascade drawn next (-1 the resolve) and the row it goes on from. */
interface Job {
  reach: Rect | null;
  next: number;
  row: number;
}

/** The texels of `target`, `perProbe` to each `spacing` world px, that hold `area` (all of them for null), on whole probes. */
function texelBox(area: Rect | null, spacing: number, perProbe: number, target: RenderTexture): TexelBox {
  const { pixelWidth, pixelHeight } = target.source;
  if (!area) return [0, 0, pixelWidth, pixelHeight];
  const [x, y, w, h] = area;
  const at = (v: number, round: (v: number) => number, max: number): number => Math.min(max, Math.max(0, round(v / spacing) * perProbe));
  return [at(x, Math.floor, pixelWidth), at(y, Math.floor, pixelHeight), at(x + w, Math.ceil, pixelWidth), at(y + h, Math.ceil, pixelHeight)];
}

function grow([x, y, w, h]: Rect, by: number): Rect {
  return [x - by, y - by, w + 2 * by, h + 2 * by];
}

/**
 * The mip level of `map` at which one texel spans an emission texel: the level implicit
 * filtering would pick, named so that the read needs no screen-space gradient (Direct3D
 * restricts those inside branches and loops). An image without mipmaps ignores it.
 */
function emissionLod(map: Texture, bounds: MapBounds, emitTexel: number): number {
  const { pixelWidth, pixelHeight } = map.source;
  return Math.max(0, Math.log2(Math.max(pixelWidth / bounds.width, pixelHeight / bounds.height) * emitTexel));
}

/**
 * World-space Radiance Cascades over the wall field, from the light map (see `cascadeShaders`):
 * `fluence` holds the light arriving at each cascade-0 probe, `probe` px apart. Probes, emission
 * texels and intervals are `BOUNCE`'s times `scale` (`bounceScale`); the falloff and gains stay in
 * world px, so the light a probe gathers barely depends on the scale.
 */
export class RadianceCascades {
  readonly fluence: RenderTexture;
  /** World px between cascade-0 probes: the spacing of `fluence`. */
  readonly probe: number;
  private readonly emitTexel: number;
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  private readonly emit: RenderTexture;
  private readonly cascades: RenderTexture[];
  private readonly counts: Array<readonly [number, number]>;
  /** Bound in place of textures other objects own, so none is kept after a build. */
  private readonly placeholder: RenderTexture = createPlaceholder();
  private readonly emissionUniforms: UniformGroup;
  private readonly cascadeUniforms: UniformGroup;
  private readonly upCount = new Float32Array(2);
  private readonly lightWorld = new Float32Array(2);
  private readonly emission: Pass;
  private readonly cascade: Pass;
  private readonly resolve: Pass;
  /** The part of its target every pass draws (`cascadeVertex`), in uv. */
  private readonly region = new UniformGroup({ uRegion: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' } });
  private job: Job | null = null;

  constructor(private readonly renderer: Renderer, private readonly bounds: MapBounds, field: CapsuleField, readonly scale = 1) {
    this.probe = BOUNCE.probe * scale;
    this.emitTexel = BOUNCE.emitTexel * scale;
    this.emit = createTarget(bounds.width / this.emitTexel, bounds.height / this.emitTexel, 'rgba16float');
    this.counts = Array.from({ length: BOUNCE.cascades }, (_, i) => {
      const spacing = this.probe * 2 ** i;
      return [Math.ceil(bounds.width / spacing), Math.ceil(bounds.height / spacing)] as const;
    });
    this.cascades = this.counts.map(([cx, cy], i) => createTarget(cx * 2 ** (i + 1), cy * 2 ** (i + 1), 'rgba16float', 'nearest'));
    this.fluence = createTarget(this.counts[0]![0], this.counts[0]![1], 'rgba16float', 'nearest');
    const emitWorld = [this.emit.source.pixelWidth * this.emitTexel, this.emit.source.pixelHeight * this.emitTexel];
    this.emissionUniforms = new UniformGroup({
      uEmitWorld: { value: new Float32Array(emitWorld), type: 'vec2<f32>' },
      uLightWorld: { value: this.lightWorld, type: 'vec2<f32>' },
      uMapSize: { value: new Float32Array([bounds.width, bounds.height]), type: 'vec2<f32>' },
      uHasAlbedo: { value: 0, type: 'f32' },
      uAlbedoLod: { value: 0, type: 'f32' },
    });
    this.cascadeUniforms = new UniformGroup({
      uEmitWorld: { value: new Float32Array(emitWorld), type: 'vec2<f32>' },
      uHasUpper: { value: 0, type: 'f32' },
      uSpacing: { value: 0, type: 'f32' },
      uS: { value: 0, type: 'f32' },
      uStart: { value: 0, type: 'f32' },
      uLen: { value: 0, type: 'f32' },
      uUpCount: { value: this.upCount, type: 'vec2<f32>' },
      uUpSpacing: { value: 0, type: 'f32' },
      uUpS: { value: 0, type: 'f32' },
      uUpStart: { value: 0, type: 'f32' },
      // Emission is read only this far from walls: its bilinear texels then all lie on this side.
      uSafe: { value: 1.5 * this.emitTexel, type: 'f32' },
      uSigma: { value: 1 / BOUNCE.spread, type: 'f32' },
      uFloorGain: { value: BOUNCE.floorGain, type: 'f32' },
      uWallGain: { value: BOUNCE.wallGain, type: 'f32' },
    });
    const placeholder = this.placeholder.source;
    this.emission = this.pass(ENGINE_SHADERS.bounceEmission, { regionUniforms: this.region, emissionUniforms: this.emissionUniforms, uLightMap: placeholder, uAlbedo: placeholder });
    this.cascade = this.pass(ENGINE_SHADERS.bounceCascade, { regionUniforms: this.region, cascadeUniforms: this.cascadeUniforms, uEmit: this.emit.source, uUpper: this.fluence.source, ...this.idleFieldResources(field) });
    this.resolve = this.pass(ENGINE_SHADERS.bounceResolve, { regionUniforms: this.region, uC0: this.cascades[0]!.source });
  }

  /**
   * Bounces the light map off the floor (tinted by `albedo`, the map image, or mid grey without
   * one) and the walls of `field`, which may hold walls the direct light passes (one-way ones).
   * A map image destroyed before a throttled build (the map changed meanwhile) counts as none.
   */
  build(lightMap: LightMap, albedo: Texture | null, field: CapsuleField): void {
    this.begin(lightMap, albedo);
    this.step(field);
  }

  /**
   * Starts a build: the light map's emission now, then the cascades top down and the resolve,
   * as far as each `step` may go. `changed` is the world rect where the light map differs from
   * the one the last build read (null: everywhere, or no build yet); only the part of every target
   * that change can reach (`bounceReach`) is drawn, the rest holds what it held. `fluence` keeps
   * the last build until the resolve, so a build spread over frames (a light being dragged)
   * shows the old bounce meanwhile, never a half-built one.
   */
  begin(lightMap: LightMap, albedo: Texture | null, changed: Rect | null = null): void {
    const map = albedo && !albedo.destroyed && !albedo.source.destroyed ? albedo : null;
    const emission = this.emission.shader!;
    this.lightWorld.set(lightMap.world);
    this.emissionUniforms.uniforms.uHasAlbedo = map ? 1 : 0;
    this.emissionUniforms.uniforms.uAlbedoLod = map ? emissionLod(map, this.bounds, this.emitTexel) : 0;
    emission.resources.uLightMap = lightMap.texture.source;
    if (map) emission.resources.uAlbedo = map.source;
    this.draw(this.emission, this.emit, texelBox(changed && grow(changed, this.emitTexel), this.emitTexel, 1, this.emit));
    emission.resources.uLightMap = this.placeholder.source;
    emission.resources.uAlbedo = this.placeholder.source;
    this.job = { reach: changed && grow(changed, bounceReach(this.scale)), next: BOUNCE.cascades - 1, row: 0 };
  }

  /** A build under way (`begin`) that `step` has not finished. */
  get building(): boolean {
    return this.job !== null;
  }

  /**
   * Goes on with the build under way, through the walls of `field` as they are now, drawing about
   * `texels` texels (whole rows of probes, at least one; by default all that is left); true once
   * `fluence` holds it (or no build was under way).
   */
  step(field: CapsuleField, texels = Infinity): boolean {
    let left = texels;
    for (let job = this.job; job && left > 0; job = this.job) {
      const i = job.next;
      const target = i < 0 ? this.fluence : this.cascades[i]!;
      const perProbe = i < 0 ? 1 : 2 ** (i + 1);
      const [x0, y0, x1, y1] = texelBox(job.reach, this.probe * 2 ** Math.max(i, 0), perProbe, target);
      const width = Math.max(1, x1 - x0);
      const from = Math.max(job.row, y0);
      const to = Math.min(y1, from + Math.max(perProbe, Math.floor(left / width / perProbe) * perProbe));
      if (i < 0) this.draw(this.resolve, this.fluence, [x0, from, x1, to]);
      else this.drawCascade(i, field, [x0, from, x1, to]);
      left -= Math.max(0, to - from) * width;
      if (to < y1) job.row = to;
      else if (i >= 0) this.job = { ...job, next: i - 1, row: 0 };
      else this.job = null;
    }
    return !this.job;
  }

  private drawCascade(i: number, field: CapsuleField, box: TexelBox): void {
    const cascade = this.cascade.shader!;
    Object.assign(cascade.resources, field.resources());
    const c = this.cascadeUniforms.uniforms;
    const top = i === BOUNCE.cascades - 1;
    c.uHasUpper = top ? 0 : 1;
    c.uSpacing = this.probe * 2 ** i;
    c.uS = 2 ** (i + 1);
    c.uStart = intervalStart(i, this.scale);
    c.uLen = BOUNCE.interval * this.scale * 4 ** i;
    this.upCount.set(top ? [1, 1] : this.counts[i + 1]!);
    c.uUpSpacing = this.probe * 2 ** (i + 1);
    c.uUpS = 2 ** (i + 2);
    c.uUpStart = intervalStart(i + 1, this.scale);
    cascade.resources.uUpper = (top ? this.fluence : this.cascades[i + 1]!).source;
    this.draw(this.cascade, this.cascades[i]!, box);
    // The field is not kept between draws: walls may rebuild it before the next.
    Object.assign(cascade.resources, this.idleFieldResources(field));
  }

  /** Draws `pass` over `box` of `target`, leaving the rest as it is. */
  private draw(pass: Pass, target: RenderTexture, [x0, y0, x1, y1]: TexelBox): void {
    if (x1 <= x0 || y1 <= y0) return;
    const { pixelWidth, pixelHeight } = target.source;
    this.region.uniforms.uRegion.set([x0 / pixelWidth, y0 / pixelHeight, x1 / pixelWidth, y1 / pixelHeight]);
    renderInto(this.renderer, pass, target);
  }

  destroy(): void {
    for (const pass of [this.emission, this.cascade, this.resolve]) {
      pass.shader?.destroy();
      pass.destroy();
    }
    this.geometry.destroy();
    destroyQuad(this.quad);
    for (const texture of [this.placeholder, this.emit, this.fluence, ...this.cascades]) texture.destroy(true);
  }

  /** The field's resources with its texture swapped for the placeholder, which it keeps between builds. */
  private idleFieldResources(field: CapsuleField): ReturnType<CapsuleField['resources']> {
    return Object.fromEntries(Object.entries(field.resources()).map(([name, resource]) => [name, resource instanceof TextureSource ? this.placeholder.source : resource]));
  }

  private pass(source: EngineShaderSource, resources: Record<string, UniformGroup | TextureSource>): Pass {
    return new Mesh({ geometry: this.geometry, shader: createShader(source, resources) });
  }
}
