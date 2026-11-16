import { Container, Mesh, UniformGroup, type Buffer, type Geometry, type Renderer, type RenderTexture, type Shader, type TextureSource } from 'pixi.js';
import { wallRadius } from '../../../lighting/lightingConstants';
import { segOf, splitBlocking, type Seg } from '../../../lighting/segments';
import type { WallSegment } from '../../../types/wallTypes';
import type { MapBounds } from '../../../vision/visibility';
import { segmentGeometry } from './CapsuleField';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import { blockingOnLeft } from './oneWayBand';

/** Texels over which the light beside a wall rises from none to all. */
export const BAND_RAMP = 1.5;

/**
 * How much light each texel of the polygon picture's light and zone maps may hold beside the
 * walls (`rg8unorm`, on their texel grid): none where its centre lies within `wallRadius` (at least
 * a texel's diagonal) of a wall's centre line, the band, then rising to all over `BAND_RAMP`
 * texels. What those maps leave out in the band no bilinear read carries across a wall: a read
 * takes in the texels within a texel's diagonal of it, and every one of them on the wall's far side
 * lies in the band. Red is the light's band of the walls that stop light both ways; a one-way wall
 * stops only the lights on its blocking side, so each light works its band out for the one-way
 * walls that end it (`oneWayEnding`, `ONE_WAY_BAND_GLSL`), and a light on the open side passes it
 * as the rule counts it. The zones' band (green) lies on both sides of every wall. The ramp makes
 * light end along a wall in a slope parallel to it, not in the texel grid's steps. Nothing traces
 * through it; it is drawn again only when the walls change.
 */
export class WallBand {
  readonly texture: RenderTexture;
  /** How far past a wall's centre line its band reaches, in world px. */
  readonly reach: number;
  private readonly quad: Quad = createQuad();
  private readonly twoWay: BandMesh;
  private readonly oneWay: BandMesh;
  private readonly readUniforms: UniformGroup;
  private readonly scene = new Container();
  private blockingOneWay: readonly WallSegment[] = [];
  /**
   * The light's band every one-way wall has on its blocking side (red), for a light that lists
   * more of them than `MAX_ONE_WAY`: made with the first such wall, kept while this band lives.
   */
  private fallback: RenderTexture | null = null;
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rg8unorm', 'nearest');
    const covered = [0, 0, this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
    const radius = wallRadius(texel);
    const ramp = BAND_RAMP * texel;
    this.reach = radius + ramp;
    const mesh = (oneSided: boolean): BandMesh => {
      const uniforms = new UniformGroup({
        uBuildRect: { value: new Float32Array(covered), type: 'vec4<f32>' },
        uMax: { value: radius + ramp, type: 'f32' },
        uRadius: { value: radius, type: 'f32' },
        uRamp: { value: ramp, type: 'f32' },
        uOneSided: { value: oneSided ? 1 : 0, type: 'f32' },
        uLightBand: { value: oneSided ? 0 : 1, type: 'f32' },
      });
      const shader = createShader(ENGINE_SHADERS.wallBand, { bandBuild: uniforms });
      const initial = quadGeometry(this.quad);
      const built = new Mesh({ geometry: initial, shader });
      // The least of every wall's: `min` blending applies only to a mesh below the render root.
      built.blendMode = 'min';
      built.visible = false;
      this.scene.addChild(built);
      return { mesh: built, shader, initial, uniforms, built: null };
    };
    this.twoWay = mesh(false);
    this.oneWay = mesh(true);
    this.readUniforms = new UniformGroup({
      uBandTexel: { value: texel, type: 'f32' },
      uBandRadius: { value: radius, type: 'f32' },
      uBandRamp: { value: ramp, type: 'f32' },
    });
  }

  /** Draws the band around the walls of `walls` that stop light. */
  build(walls: readonly WallSegment[]): void {
    const blocking = splitBlocking(walls, 'light');
    // Limited walls (off: `LIMITED_WALLS`) count as walls that stop light both ways.
    this.fill(this.twoWay, [...blocking.twoWay, ...blocking.limited.map(segOf)]);
    this.blockingOneWay = blocking.oneWay;
    this.fill(this.oneWay, blocking.oneWay.map(blockingOnLeft));
    setLightBand(this.oneWay, false);
    renderInto(this.renderer, this.scene, this.texture, [1, 1, 0, 1]);
    if (blocking.oneWay.length === 0) return;
    this.fallback ??= createTarget(this.texture.source.pixelWidth, this.texture.source.pixelHeight, 'r8unorm', 'nearest');
    const twoWayShown = this.twoWay.mesh.visible;
    this.twoWay.mesh.visible = false;
    setLightBand(this.oneWay, true);
    renderInto(this.renderer, this.scene, this.fallback, [1, 1, 0, 1]);
    this.twoWay.mesh.visible = twoWayShown;
  }

  /** The one-way walls that stop light, which each light sorts by the side it stands on (`oneWayEnding`): a new list with every build. */
  get oneWayWalls(): readonly WallSegment[] {
    return this.blockingOneWay;
  }

  /** What a light that every one-way wall ends lists (`OneWayList.set`): none where there is none, else the band of all of them. */
  everyOneWay(): Seg[] | null {
    return this.blockingOneWay.length === 0 ? [] : null;
  }

  /** What a program that reads the band (`BAND_GLSL`) binds. */
  resources(): Record<string, UniformGroup | TextureSource> {
    return { uBand: this.texture.source, bandUniforms: this.readUniforms };
  }

  /** What a program that also reads a light's one-way walls (`ONE_WAY_BAND_GLSL`) binds of the band: rebound with every draw, since the fallback comes with the first one-way wall. */
  oneWayResources(): Record<string, UniformGroup | TextureSource> {
    return { ...this.resources(), uOneWayBand: this.oneWayFallback() };
  }

  /** The band of every one-way wall (`ONE_WAY_BAND_GLSL`'s `uOneWayBand`), a placeholder while there is none. */
  oneWayFallback(): TextureSource {
    return (this.fallback ?? this.placeholder).source;
  }

  destroy(): void {
    for (const band of [this.twoWay, this.oneWay]) {
      this.scene.removeChild(band.mesh);
      releaseBuilt(band);
      band.initial.destroy();
      band.shader.destroy();
      band.mesh.destroy();
    }
    this.scene.destroy();
    destroyQuad(this.quad);
    this.texture.destroy(true);
    this.fallback?.destroy(true);
    this.placeholder.destroy(true);
  }

  private fill(band: BandMesh, segments: readonly Seg[]): void {
    band.mesh.visible = segments.length > 0;
    if (segments.length === 0) return;
    const built = segmentGeometry(this.quad, segments);
    band.mesh.geometry = built.geometry;
    releaseBuilt(band);
    band.built = built;
  }
}

/** A band's mesh: its own shader, the quad it starts with and the instanced geometry it was last built with. */
interface BandMesh {
  mesh: Mesh<Geometry, Shader>;
  shader: Shader;
  initial: Geometry;
  uniforms: UniformGroup;
  built: { geometry: Geometry; segments: Buffer } | null;
}

/** Whether the one-way walls' mesh draws the light's band (into the fallback) or the zones' alone (into the band). */
function setLightBand(band: BandMesh, on: boolean): void {
  band.uniforms.uniforms.uLightBand = on ? 1 : 0;
  band.uniforms.update();
}

/** The quad buffers are shared with every geometry, so only the segment buffer goes with its geometry. */
function releaseBuilt(band: BandMesh): void {
  band.built?.geometry.destroy();
  band.built?.segments.destroy();
  band.built = null;
}
