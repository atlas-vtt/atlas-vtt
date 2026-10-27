import { Buffer, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Renderer, type RenderTexture, type Shader, type TextureSource } from 'pixi.js';
import { FIELD_MAX, fieldMargin } from '../../../lighting/lightingConstants';
import type { Rect, Seg } from '../../../lighting/segments';
import { ENGINE_SHADERS } from './engineShaders';
import { createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';

/**
 * Distance to the nearest wall centre line over a world rectangle (`r16float`), exact at
 * texel centres: each wall is an instanced quad reaching `FIELD_MAX` around it, `min`-blended.
 * Shaders read it through `fieldGlsl(name)` with this field's `resources()`.
 */
export class CapsuleField {
  private target: RenderTexture;
  readonly uniforms: UniformGroup;
  private readonly quad: Quad = createQuad();
  private readonly buildUniforms = new UniformGroup({
    uBuildRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uMax: { value: FIELD_MAX, type: 'f32' },
  });
  private readonly shader: Shader;
  private readonly mesh: Mesh<Geometry, Shader>;
  // `min` blending applies only to a mesh below the render root, so the mesh is drawn from here.
  private readonly scene = new Container();
  private readonly empty = new Container();
  private readonly initialGeometry: Geometry;
  private built: { geometry: Geometry; segments: Buffer } | null = null;
  private readonly aliases = new Map<string, UniformGroup>();

  constructor(private readonly renderer: Renderer, rect: Rect, readonly texel: number, wallRadius: number, readonly name = 'uField') {
    this.target = createTarget(rect[2] / texel, rect[3] / texel, 'r16float');
    this.uniforms = new UniformGroup({
      [`${name}Rect`]: { value: new Float32Array(4), type: 'vec4<f32>' },
      [`${name}Params`]: { value: new Float32Array([fieldMargin(texel), wallRadius]), type: 'vec2<f32>' },
    });
    this.place(rect);
    this.shader = createShader(ENGINE_SHADERS.capsuleField, { fieldBuild: this.buildUniforms });
    this.initialGeometry = quadGeometry(this.quad);
    this.mesh = new Mesh({ geometry: this.initialGeometry, shader: this.shader });
    this.mesh.blendMode = 'min';
    this.scene.addChild(this.mesh);
  }

  get texture(): RenderTexture {
    return this.target;
  }

  /**
   * The field over `rect` from now on, which `build` then draws: the texture is kept where it is
   * large enough (it then covers more than `rect`), so a field moved along with a light allocates
   * nothing. Bind its `resources()` anew after a move.
   */
  cover(rect: Rect): void {
    const { texel } = this;
    const [width, height] = [Math.ceil(rect[2] / texel), Math.ceil(rect[3] / texel)];
    const source = this.target.source;
    if (source.pixelWidth < width || source.pixelHeight < height) {
      this.target.destroy(true);
      this.target = createTarget(Math.max(width, source.pixelWidth), Math.max(height, source.pixelHeight), 'r16float');
    }
    this.place(rect);
  }

  private place(rect: Rect): void {
    const covered = [rect[0], rect[1], this.target.source.pixelWidth * this.texel, this.target.source.pixelHeight * this.texel];
    this.buildUniforms.uniforms.uBuildRect.set(covered);
    (this.uniforms.uniforms as Record<string, Float32Array>)[`${this.name}Rect`]!.set(covered);
    this.uniforms.update();
    for (const [name, alias] of this.aliases) {
      (alias.uniforms as Record<string, Float32Array>)[`${name}Rect`]!.set(covered);
      alias.update();
    }
  }

  build(segments: readonly Seg[]): void {
    const clear: [number, number, number, number] = [FIELD_MAX, 0, 0, 1];
    if (segments.length === 0) {
      renderInto(this.renderer, this.empty, this.texture, clear);
      return;
    }
    const buffer = new Buffer({ data: new Float32Array(segments.flat()), usage: BufferUsage.VERTEX });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.quad.vertices, format: 'float32x2' },
        aSegment: { buffer, format: 'float32x4', instance: true },
      },
      indexBuffer: this.quad.indices,
      instanceCount: segments.length,
    });
    this.mesh.geometry = geometry;
    renderInto(this.renderer, this.scene, this.texture, clear);
    this.releaseBuilt();
    this.built = { geometry, segments: buffer };
  }

  /** The quad buffers are shared with every geometry, so only the segment buffer goes with its geometry. */
  private releaseBuilt(): void {
    this.built?.geometry.destroy();
    this.built?.segments.destroy();
    this.built = null;
  }

  resources(): Record<string, UniformGroup | TextureSource> {
    return { [this.name]: this.texture.source, [`${this.name}Uniforms`]: this.uniforms };
  }

  /** This field for a shader that reads it under another name (`fieldGlsl(name)`): a program that reads two fields binds each under its own. */
  resourcesAs(name: string): Record<string, UniformGroup | TextureSource> {
    if (name === this.name) return this.resources();
    let uniforms = this.aliases.get(name);
    if (!uniforms) {
      const own = this.uniforms.uniforms as Record<string, Float32Array>;
      uniforms = new UniformGroup({
        [`${name}Rect`]: { value: new Float32Array(own[`${this.name}Rect`]!), type: 'vec4<f32>' },
        [`${name}Params`]: { value: new Float32Array(own[`${this.name}Params`]!), type: 'vec2<f32>' },
      });
      this.aliases.set(name, uniforms);
    }
    return { [name]: this.texture.source, [`${name}Uniforms`]: uniforms };
  }

  destroy(): void {
    this.scene.destroy({ children: true });
    this.empty.destroy();
    this.releaseBuilt();
    this.initialGeometry.destroy();
    destroyQuad(this.quad);
    this.shader.destroy();
    this.target.destroy(true);
  }
}
