import { Buffer, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { REFLECTION } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import type { ReflectionPart } from '../../../vision/reflectedLight';
import type { MapBounds } from '../../../vision/visibility';
import type { CapsuleField } from './CapsuleField';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import { REFLECTION_BLUR_TEXELS } from './reflectionShader';
import type { EngineLight } from './types';

/** A light's reflected light over its own rectangle, on the light map's texel grid: the share of `REFLECTION.level` each texel gets. */
export interface ReflectionTile {
  rect: Rect;
  texture: RenderTexture;
}

interface Entry {
  parts: readonly ReflectionPart[];
  field: CapsuleField;
  tile: ReflectionTile | null;
}

/**
 * One reflection tile per light that reflects (`EngineLight.reflection`, the rule's own parts),
 * drawn anew only when its parts are other ones (the light moved or changed, or walls did, which
 * the rule traces again) or the wall field is another. Each tile is one draw of every part's
 * polygon as a fan, max-blended (`reflectionShader.ts`), over the bounds of those polygons alone,
 * so a light whose shadows are few and short keeps a small tile.
 */
export class ReflectionTiles {
  private readonly entries = new Map<string, Entry>();
  private readonly uniforms = new UniformGroup({
    uReflectRect: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
  // `max` blending applies only to a mesh below the render root, so the mesh is drawn from here.
  private readonly scene = new Container();
  private shader: { field: CapsuleField; shader: Shader } | null = null;
  private readonly blurUniforms = new UniformGroup({
    uReflectRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uStep: { value: new Float32Array([1, 0]), type: 'vec2<f32>' },
    uRadius: { value: 1, type: 'f32' },
    uTexel: { value: 1, type: 'f32' },
  });
  private blur: { field: CapsuleField; mesh: Mesh<Geometry, Shader> } | null = null;
  private readonly quad: Quad = createQuad();
  private readonly quadGeometry: Geometry = quadGeometry(this.quad);
  /** Bound as the blur's source between draws, so the program never keeps a tile. */
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, private readonly bounds: MapBounds, private readonly texel: number) {
    this.blurUniforms.uniforms.uTexel = texel;
  }

  get(key: string): ReflectionTile | undefined {
    return this.entries.get(key)?.tile ?? undefined;
  }

  /** Brings the tiles up to `lights` (a darkness has none); true when one was drawn or dropped. */
  sync(lights: readonly EngineLight[], field: CapsuleField): boolean {
    let changed = false;
    const reflecting = new Map(lights.flatMap((light) => (light.reflection?.length && !light.darkness ? [[light.key, light.reflection] as const] : [])));
    for (const [key, entry] of this.entries) {
      if (reflecting.has(key)) continue;
      entry.tile?.texture.destroy(true);
      this.entries.delete(key);
      changed = true;
    }
    for (const [key, parts] of reflecting) {
      const entry = this.entries.get(key);
      if (entry && entry.parts === parts && entry.field === field) continue;
      entry?.tile?.texture.destroy(true);
      this.entries.set(key, { parts, field, tile: this.draw(parts, field) });
      changed = true;
    }
    return changed;
  }

  destroy(): void {
    for (const entry of this.entries.values()) entry.tile?.texture.destroy(true);
    this.entries.clear();
    this.shader?.shader.destroy();
    this.blur?.mesh.shader?.destroy();
    this.blur?.mesh.destroy();
    this.scene.destroy({ children: true });
    this.quadGeometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
  }

  private draw(parts: readonly ReflectionPart[], field: CapsuleField): ReflectionTile | null {
    const rect = this.rectOf(parts);
    if (!rect) return null;
    const texture = createTarget(rect[2] / this.texel, rect[3] / this.texel, 'r8unorm', 'nearest');
    const covered: Rect = [rect[0], rect[1], texture.source.pixelWidth * this.texel, texture.source.pixelHeight * this.texel];
    this.uniforms.uniforms.uReflectRect.set(covered);
    const geometry = fansOf(parts);
    const mesh = new Mesh({ geometry, shader: this.shaderFor(field) });
    mesh.blendMode = 'max';
    this.scene.addChild(mesh);
    renderInto(this.renderer, this.scene, texture, [0, 0, 0, 0]);
    this.scene.removeChild(mesh);
    mesh.destroy();
    geometry.destroy(true);
    this.melt(texture, covered, field, Math.max(...parts.map((part) => part.reach)));
    return { rect: covered, texture };
  }

  /** Blurs `texture` across, into a scratch target, and back down (`reflectionBlurFragment`). */
  private melt(texture: RenderTexture, rect: Rect, field: CapsuleField, reach: number): void {
    const radius = Math.min(REFLECTION_BLUR_TEXELS, (REFLECTION.blur * reach) / this.texel);
    if (radius < 1) return;
    const scratch = createTarget(texture.source.pixelWidth, texture.source.pixelHeight, 'r8unorm', 'nearest');
    const mesh = this.blurMesh(field);
    const u = this.blurUniforms.uniforms;
    u.uReflectRect.set(rect);
    u.uRadius = radius;
    for (const [from, to, step] of [[texture, scratch, [1, 0]], [scratch, texture, [0, 1]]] as const) {
      u.uStep.set(step);
      mesh.shader!.resources.uSource = from.source;
      renderInto(this.renderer, mesh, to);
    }
    mesh.shader!.resources.uSource = this.placeholder.source;
    scratch.destroy(true);
  }

  private blurMesh(field: CapsuleField): Mesh<Geometry, Shader> {
    if (this.blur?.field !== field) {
      this.blur?.mesh.shader?.destroy();
      this.blur?.mesh.destroy();
      const shader = createShader(ENGINE_SHADERS.reflectionBlur, { blurUniforms: this.blurUniforms, uSource: this.placeholder.source, ...field.resourcesAs('uField') });
      this.blur = { field, mesh: new Mesh({ geometry: this.quadGeometry, shader }) };
    }
    return this.blur.mesh;
  }

  private shaderFor(field: CapsuleField): Shader {
    if (this.shader?.field !== field) {
      this.shader?.shader.destroy();
      this.shader = { field, shader: createShader(ENGINE_SHADERS.reflection, { reflectionUniforms: this.uniforms, ...field.resourcesAs('uField') }) };
    }
    return this.shader.shader;
  }

  /** The bounds of every part's polygon, grown to the texel grid and clipped to the map; null if empty. */
  private rectOf(parts: readonly ReflectionPart[]): Rect | null {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const { polygon } of parts) {
      for (const { x, y } of polygon) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
    const { texel } = this;
    const width = Math.ceil(this.bounds.width / texel) * texel, height = Math.ceil(this.bounds.height / texel) * texel;
    const left = Math.max(0, Math.floor(x0 / texel) * texel), top = Math.max(0, Math.floor(y0 / texel) * texel);
    const right = Math.min(width, Math.ceil(x1 / texel) * texel), bottom = Math.min(height, Math.ceil(y1 / texel) * texel);
    return right > left && bottom > top ? [left, top, right - left, bottom - top] : null;
  }
}

/** Every part's polygon as a triangle fan from its point, which each corner carries with the part's reach and strength (`aPart`). */
function fansOf(parts: readonly ReflectionPart[]): Geometry {
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
  return new Geometry({
    attributes: {
      aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' },
      aPart: { buffer: new Buffer({ data: info, usage: BufferUsage.VERTEX }), format: 'float32x4' },
    },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}
