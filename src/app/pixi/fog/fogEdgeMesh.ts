import { GlProgram, Mesh, MeshGeometry, Shader, Texture, UniformGroup, type Container, type Sprite, type TextureSource } from 'pixi.js';
import { destroyTree } from '../utils/destroyTree';
import { GLSL_VERSION } from '../lighting/engine/glsl';
import { fogEdgeBlur, type FogEdge } from '../../fog/fogEdge';

/** How far the noise pushes the edge in or out, at most, in alpha. */
const CRACKLE_AMOUNT = 0.9;
/**
 * Within this much alpha of solid fog or open ground the noise's push fades to none, so the cut
 * meets both without a seam: stopped where the blur's 8 bits end, it cut holes right beside solid
 * fog, along a contour that moved with every pan on the screen.
 */
const CRACKLE_TAPER = 0.1;
/** The weights of the noise's three octaves: broad cracks, then grit. */
const CRACKLE_WEIGHTS = [0.5, 0.3, 0.2] as const;
/** Each octave's cell size against the edge's blur, and the least it has, in world pixels. */
const CELLS_PER_EDGE = [1.1, 0.36, 0.12] as const;
const MIN_CELLS = [16, 5, 2] as const;

/**
 * The noise's cell sizes in world pixels for an edge blurred by `blurPx` (`fogEdgeBlur`): the cracks
 * grow with the edge, so a wide one breaks into cracks of its size, not into grit.
 */
export function crackleCells(blurPx: number): [number, number, number] {
  return [0, 1, 2].map((i) => Math.max(MIN_CELLS[i]!, CELLS_PER_EDGE[i]! * blurPx)) as [number, number, number];
}

/**
 * Every fog edge, soft or crackled, is this one shader over the fog canvas, which holds the fog
 * blurred at a part of the map's resolution, which a blur loses nothing to. A soft edge is that blur
 * as it is. A crackled one (`uCrackle`) is the blur cut against fractal noise for every pixel it is
 * drawn at, so the cracks stay sharp however far the map is zoomed in, and the noise lies on the map
 * (world pixels), the same in every picture of it.
 *
 * It reads the fog canvas itself (`uFog`) and applies the sprite's opacity (the GM's see-through fog)
 * after the cut: fog already made translucent in 8 bits moved the cut by pixels at half opacity.
 */
const FRAGMENT_HEAD = `${GLSL_VERSION}
precision highp float;
in vec2 vUv;
out vec4 finalColor;
uniform sampler2D uFog;
uniform vec4 uSpriteRect;
uniform vec3 uCells;
uniform float uOpacity;
uniform float uCrackle;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

/** The noise at the pixel's place on the map, into `grain`. */
const GRAIN = `
    vec2 world = uSpriteRect.xy + uv * uSpriteRect.zw;
    grain = (noise(world / uCells.x) - 0.5) * ${CRACKLE_WEIGHTS[0].toFixed(3)}
      + (noise(world / uCells.y + 17.0) - 0.5) * ${CRACKLE_WEIGHTS[1].toFixed(3)}
      + (noise(world / uCells.z + 41.0) - 0.5) * ${CRACKLE_WEIGHTS[2].toFixed(3)};`;
const TAPER = CRACKLE_TAPER.toFixed(3);
const PUSH = (CRACKLE_AMOUNT * 2).toFixed(3);

const CRACKLE_FRAGMENT = `${FRAGMENT_HEAD}
void main() {
  vec2 uv = vUv;
  vec4 fog = textureLod(uFog, clamp(uv, 0.0, 1.0), 0.0);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float alpha = fog.a * inside;
  // The noise moves the edge less towards solid fog and open ground and not at all on them
  // (CRACKLE_TAPER), so the cut meets both without a seam, and is worked out only where it can
  float reach = smoothstep(0.0, ${TAPER}, min(alpha, 1.0 - alpha));
  float grain = 0.0;
  if (reach > 0.0 && uCrackle > 0.5) {${GRAIN}
  }
  // Where the edge lies: past it on the fog's side, the fog stays. The cut is antialiased over a
  // pixel and a half of the screen at any zoom. Its derivative is taken outside any branch: within
  // one, a neighbour that left it gives it garbage
  float side = alpha + grain * reach * ${PUSH} - 0.5;
  float cut = clamp(0.5 + side / max(1.5 * fwidth(side), 1e-5), 0.0, 1.0);
  finalColor = vec4(fog.rgb / max(fog.a, 1e-4), 1.0) * mix(alpha, cut, uCrackle) * uOpacity;
}`;

/**
 * The same over two pictures of the fog while one fades into the other: the fog as it was
 * (`uBefore`) and as it is (`uFog`), each with its edge, and `uMix` of the way from the one to the
 * other. Only their difference moves: where both hold the same, it is exactly nothing, so fog
 * neither picture changed is drawn as it is without the fade, at any opacity. The picture before
 * is kept only where the fog changed (`uBeforeRect`, in the sprite's own coordinates): around it,
 * and in its outermost ring of pixels, which the pixels beyond would have a share in, the fog was
 * what it is. It may itself be a mix of two pictures (a change during a fade), whose edge cannot
 * be cut again (`uBeforeCrackle` 0): half-faded fog would break into cracks all over.
 */
const FADE_FRAGMENT = `${FRAGMENT_HEAD}
uniform sampler2D uBefore;
uniform vec4 uBeforeRect;
uniform float uMix;
uniform float uBeforeCrackle;

void main() {
  vec2 uv = vUv;
  vec2 at = clamp(uv, 0.0, 1.0);
  vec4 fog = textureLod(uFog, at, 0.0);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float alpha = fog.a * inside;
  vec2 size = vec2(textureSize(uBefore, 0));
  vec2 place = (at - uBeforeRect.xy) / uBeforeRect.zw;
  vec2 pixel = place * size;
  float kept = step(1.0, pixel.x) * step(pixel.x, size.x - 1.0) * step(1.0, pixel.y) * step(pixel.y, size.y - 1.0);
  vec4 was = textureLod(uBefore, clamp(place, 0.0, 1.0), 0.0) * kept;
  float before = mix(alpha, was.a * inside, kept);
  float reach = smoothstep(0.0, ${TAPER}, min(alpha, 1.0 - alpha));
  float reachBefore = smoothstep(0.0, ${TAPER}, min(before, 1.0 - before));
  float grain = 0.0;
  if (max(reach, reachBefore) > 0.0 && uCrackle > 0.5) {${GRAIN}
  }
  float side = alpha + grain * reach * ${PUSH} - 0.5;
  float sideBefore = before + grain * reachBefore * ${PUSH} - 0.5;
  float cut = clamp(0.5 + side / max(1.5 * fwidth(side), 1e-5), 0.0, 1.0);
  float cutBefore = clamp(0.5 + sideBefore / max(1.5 * fwidth(sideBefore), 1e-5), 0.0, 1.0);
  float now = mix(alpha, cut, uCrackle);
  float then = mix(before, cutBefore, uBeforeCrackle);
  float shown = then + (now - then) * uMix;
  // Both pictures are the fog's one colour, premultiplied: whichever holds any gives it
  finalColor = vec4((fog.rgb + was.rgb) / max(fog.a + was.a, 1e-4), 1.0) * shown * uOpacity;
}`;

const CRACKLE_VERTEX = `${GLSL_VERSION}
in vec2 aPosition;
out vec2 vUv;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
uniform vec4 uSpriteRect;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(uSpriteRect.xy + aPosition * uSpriteRect.zw, 1.0)).xy, 0.0, 1.0);
  vUv = aPosition;
}`;

let program: GlProgram | null = null;
let fadeProgram: GlProgram | null = null;

/** The picture a fade of the fog comes from. */
export interface FogBefore {
  readonly source: TextureSource;
  /** Where it lies on the fog's sprite: left, top, width and height as shares of the sprite's. */
  readonly rect: readonly [number, number, number, number];
  /** Whether its edge is cut like the fog's; a mix of two pictures has none to cut. */
  readonly cut: boolean;
}

/**
 * A sprite's opacity as PIXI's batcher draws it, in 8 bits: the mesh that stands in for a
 * hard-edged sprite during a fade must draw fog nothing changed exactly as that sprite does.
 */
const batchedOpacity = (opacity: number): number => ((opacity * 255) | 0) / 255;

/**
 * The edge of one fog sprite, drawn in its place by a mesh with the edge's shader, never through a
 * filter: a filter's own passes over the screen cost about 7 ms a render at 4K on an Iris
 * Xe. The sprite stays what the fog code shows, hides and fills; it only draws nothing
 * (`renderable`), and the mesh, beside it in its parent, takes its place, texture, visibility and
 * opacity at every render, before PIXI decides what to draw (`onRender`).
 */
export class FogEdgeMesh {
  private readonly group = new UniformGroup({
    uSpriteRect: { value: new Float32Array(4), type: 'vec4<f32>' },
    uCells: { value: new Float32Array(3), type: 'vec3<f32>' },
    uOpacity: { value: 1, type: 'f32' },
    uCrackle: { value: 0, type: 'f32' },
    uMix: { value: 1, type: 'f32' },
    uBeforeCrackle: { value: 0, type: 'f32' },
    uBeforeRect: { value: new Float32Array([0, 0, 1, 1]), type: 'vec4<f32>' },
  });
  private readonly shader = new Shader({
    glProgram: program ??= GlProgram.from({ vertex: CRACKLE_VERTEX, fragment: CRACKLE_FRAGMENT, name: 'atlas-fog-edge' }),
    resources: { crackle: this.group, uFog: Texture.EMPTY.source },
  });
  /** Draws the fog while it fades from another picture; made with the first fade. */
  private fadeShader: Shader | null = null;
  /** The picture a fade comes from; null while none runs. */
  private before: FogBefore | null = null;
  /** Whether the edge is hard: the mesh then stands in for a sprite PIXI would draw itself. */
  private hard = false;
  private readonly mesh = new Mesh({
    geometry: new MeshGeometry({ positions: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }),
    shader: this.shader,
    eventMode: 'none',
    label: 'fog-edge',
  });

  /** Draws `sprite` with this edge; the sprite must be in its parent already. */
  constructor(private readonly sprite: Sprite, edge: FogEdge) {
    this.setEdge(edge);
    sprite.renderable = false;
    this.mesh.onRender = () => this.follow();
    this.follow();
    sprite.parent?.addChildAt(this.mesh, sprite.parent.getChildIndex(sprite) + 1);
  }

  /** The edge's look, and its width in world pixels, which the cracks' sizes follow. */
  setEdge({ style, width }: FogEdge): void {
    this.hard = width <= 0;
    (this.group.uniforms.uCells as Float32Array).set(crackleCells(fogEdgeBlur(width)));
    this.group.uniforms.uCrackle = style === 'crackle' && !this.hard ? 1 : 0;
    this.group.update();
  }

  /**
   * Fades from the picture `before` to the sprite's, as far as `setMix` says. Null ends the fade:
   * the sprite's picture alone is drawn.
   */
  fadeFrom(before: FogBefore | null): void {
    this.before = before;
    if (before) {
      this.fadeShader ??= new Shader({
        glProgram: fadeProgram ??= GlProgram.from({ vertex: CRACKLE_VERTEX, fragment: FADE_FRAGMENT, name: 'atlas-fog-fade' }),
        resources: { crackle: this.group, uFog: Texture.EMPTY.source, uBefore: Texture.EMPTY.source },
      });
      this.fadeShader.resources.uBefore = before.source;
      (this.group.uniforms.uBeforeRect as Float32Array).set(before.rect);
      this.group.update();
    } else if (this.fadeShader) {
      // The picture it came from is destroyed once the fade has ended
      this.fadeShader.resources.uBefore = Texture.EMPTY.source;
    }
    const shown = before && this.fadeShader ? this.fadeShader : this.shader;
    // The shader that rests lets go of the fog's texture: a fade's end destroys the one it began on
    const resting = shown === this.shader ? this.fadeShader : this.shader;
    if (resting) resting.resources.uFog = Texture.EMPTY.source;
    this.mesh.shader = shown;
  }

  /** How far a fade has come: 0 shows the picture before, 1 the sprite's. */
  setMix(mix: number): void {
    this.group.uniforms.uMix = mix;
    this.group.update();
  }

  /** The sprite as it is drawn this render: its place, texture, visibility and opacity, its parents' too. */
  private follow(): void {
    const { sprite, mesh } = this;
    mesh.visible = sprite.visible;
    if (mesh.zIndex !== sprite.zIndex) mesh.zIndex = sprite.zIndex;
    const { uniforms } = this.group;
    (uniforms.uSpriteRect as Float32Array).set([sprite.x, sprite.y, sprite.width, sprite.height]);
    // The mesh's own alpha stays 1: the shader applies the sprite's and its parents' after the cut
    let opacity = 1;
    for (let node: Container | null = sprite; node; node = node.parent) opacity *= node.alpha;
    uniforms.uOpacity = this.hard ? batchedOpacity(opacity) : opacity;
    uniforms.uBeforeCrackle = this.before?.cut ? uniforms.uCrackle : 0;
    const shader = this.before && this.fadeShader ? this.fadeShader : this.shader;
    shader.resources.uFog = sprite.texture.source;
    this.group.update();
  }

  destroy(): void {
    if (!this.sprite.destroyed) this.sprite.renderable = true;
    // A mesh lets go of its geometry without destroying it, which would keep its buffers on the GPU
    const { geometry } = this.mesh;
    destroyTree(this.mesh);
    geometry.destroy();
    this.shader.destroy();
    this.fadeShader?.destroy();
  }
}
