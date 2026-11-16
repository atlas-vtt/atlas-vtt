import { Buffer, BufferUsage, Geometry, Mesh, UniformGroup, type Renderer, type Shader } from 'pixi.js';
import { NO_BELOW, type BelowPictures, type CompositeStack } from '../engine/compositeFilter';
import { ENGINE_SHADERS } from '../engine/engineShaders';
import { createPlaceholder, createShader, glOf } from '../engine/gpu';
import type { BelowShown } from '../engine/LightingEngine';
import { describeShaderFailures, failedEngineShaders } from '../engine/shaderCheck';

/**
 * The openings of a view whose scene has no lighting. A lit view's composite draws the levels
 * below into the holes of its map; no composite runs over an unlit view, so this mesh draws them:
 * a quad over the stack's box, placed with the eraser between the view's grid and its tokens, that
 * fills every texel showing another level with that level's snapshot, dimmed once per level down
 * (or black where nothing is drawn there). It reads the stack and the snapshots the composite
 * reads, through the same shader code (`STACK_GLSL`), so both views open the same texels.
 * Hidden while the scene is lit, and while the stack shows only the viewed level.
 */
export class UnlitOpenings {
  readonly view: Mesh<Geometry, Shader>;
  private readonly shader: Shader;
  private readonly positions = new Buffer({ data: new Float32Array(8), usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
  private readonly indices = new Buffer({ data: new Uint32Array([0, 1, 2, 1, 3, 2]), usage: BufferUsage.INDEX });
  private readonly stackBox = new Float32Array(4);
  private readonly stackGrid = new Float32Array(2);
  private readonly belowShown = new Float32Array(2);
  private readonly belowGrid = new Float32Array([0, 0, 1]);
  private readonly uniforms = new UniformGroup({
    uStackBox: { value: this.stackBox, type: 'vec4<f32>' },
    uStackGrid: { value: this.stackGrid, type: 'vec2<f32>' },
    uStackTexel: { value: 1, type: 'f32' },
    uHasBelow: { value: 0, type: 'f32' },
    uBelowShown: { value: this.belowShown, type: 'vec2<f32>' },
    uBelowDim: { value: 1, type: 'f32' },
    uBelowGrid: { value: this.belowGrid, type: 'vec3<f32>' },
  });
  /** Bound in place of the stack and the snapshots while there are none, so the shader never holds a destroyed texture. */
  private readonly nothing = createPlaceholder();
  private lit = true;
  private stack: CompositeStack | null = null;
  private shown: BelowShown = { pictures: NO_BELOW, dim: 1 };
  /** Whether the graphics device links the shader: asked once, before the mesh is first shown. */
  private links: boolean | null = null;

  constructor(private readonly renderer: Renderer) {
    const geometry = new Geometry({ attributes: { aPosition: { buffer: this.positions, format: 'float32x2' } }, indexBuffer: this.indices });
    const { source } = this.nothing;
    this.shader = createShader(ENGINE_SHADERS.unlitOpenings, { openingsUniforms: this.uniforms, uStack: source, uBelow1: source, uBelow2: source });
    this.view = new Mesh({ geometry, shader: this.shader, label: 'level-openings-unlit', eventMode: 'none' });
    this.view.visible = false;
  }

  /**
   * Whether the openings can be drawn here: a WebGL renderer whose driver links the shader. PIXI
   * only logs a failed link and then throws inside the stage's render, so the driver is asked first.
   */
  usable(): boolean {
    if (this.links !== null) return this.links;
    const gl = glOf(this.renderer);
    if (!gl) return (this.links = false);
    if (gl.isContextLost()) return false;
    const failures = failedEngineShaders(gl, [ENGINE_SHADERS.unlitOpenings]);
    if (failures.length > 0) console.error(`Atlas: the levels below an unlit scene cannot be drawn on this graphics device\n${describeShaderFailures(failures)}`);
    return (this.links = failures.length === 0);
  }

  /** Whether the scene is lit: its composite draws the openings then, and this draws nothing. */
  setLit(lit: boolean): void {
    this.lit = lit;
    this.show();
  }

  /** The level stack of the view's openings (`LevelStackTexture`), or null while it shows only its own level. The caller owns its texture. */
  setStack(stack: CompositeStack | null): void {
    this.stack = stack;
    this.shader.resources.uStack = (stack?.texture ?? this.nothing).source;
    this.uniforms.uniforms.uHasBelow = stack ? 1 : 0;
    if (stack) {
      const { box, texel } = stack;
      this.stackBox.set([box.x, box.y, box.columns, box.rows]);
      this.stackGrid.set([stack.columns, stack.rows]);
      this.uniforms.uniforms.uStackTexel = texel;
      const [left, top, right, bottom] = [box.x * texel, box.y * texel, (box.x + box.columns) * texel, (box.y + box.rows) * texel];
      this.positions.data = new Float32Array([left, top, right, top, left, bottom, right, bottom]);
    }
    this.uniforms.update();
    this.show();
  }

  /** The snapshots of the levels below for the render about to be drawn, dimmed by `dim` once per level down. The caller owns the textures. */
  setBelow(pictures: BelowPictures, dim: number): void {
    this.shown = { pictures, dim };
    this.bind(this.shown);
  }

  /** Runs `render`, a picture of the scene (a thumbnail), with the snapshots drawn for it (none: its openings show nothing below); the canvas's own are bound again afterwards. */
  renderWith<T>(shown: BelowShown | undefined, render: () => T): T {
    this.bind(shown ?? { pictures: NO_BELOW, dim: 1 });
    try {
      return render();
    } finally {
      this.bind(this.shown);
    }
  }

  destroy(): void {
    this.view.geometry.destroy(true);
    this.view.destroy();
    this.shader.destroy();
    this.nothing.destroy(true);
  }

  private bind({ pictures: { textures: [first, second], x, y, sub }, dim }: BelowShown): void {
    const { resources } = this.shader;
    resources.uBelow1 = (first ?? this.nothing).source;
    resources.uBelow2 = (second ?? this.nothing).source;
    this.belowShown.set([first ? 1 : 0, second ? 1 : 0]);
    this.belowGrid.set([x, y, sub]);
    this.uniforms.uniforms.uBelowDim = dim;
    this.uniforms.update();
  }

  private show(): void {
    this.view.visible = !this.lit && this.stack !== null && this.usable();
  }
}
