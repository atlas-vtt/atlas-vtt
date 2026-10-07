import { AlphaFilter, Buffer, BufferUsage, Container, Geometry, Mesh, Rectangle, type Shader } from 'pixi.js';
import { beamSmoothingSpacing, createLaserBeamBuffers, smoothBeam, writeLaserBeam, type BeamPoint, type BeamWidth } from './laserBeamGeometry';
import { createLaserBeamShader, type LaserBeamShader } from './laserBeamShader';

/** Draws the laser beam; `LaserBeam` on the GPU, `CanvasLaserBeam` without one. */
export interface LaserBeamView {
  /** Add this to the scene. */
  readonly view: Container;
  draw(frame: LaserBeamFrame): void;
  /** Frees what destroying the view with its parent leaves alive. */
  destroy(): void;
}

export interface LaserBeamFrame {
  /** Trail samples from oldest to newest, the last one at the pointer while drawing. */
  trail: BeamPoint[];
  /** The pointer while it hovers without drawing. */
  dot: BeamPoint | null;
  /** Where the white-hot spot sits, or null when the pointer is off the map. */
  pointer: { x: number; y: number } | null;
  color: string;
  width: BeamWidth;
  /** Viewport scale, so smoothing stays fine at any zoom. */
  zoom: number;
}

/**
 * The laser's display object. Its capsules overlap at every joint and are drawn with max
 * blending, so each pixel keeps the strongest capsule instead of adding them up. That only
 * works on an empty surface, so the beam renders into its own layer (a pass-through filter)
 * that is then blended onto the map as a whole.
 */
export class LaserBeam implements LaserBeamView {
  readonly view: Container;
  private readonly mesh: Mesh<Geometry, Shader>;
  private readonly geometry: Geometry;
  private readonly shader: LaserBeamShader;
  private readonly layer = new AlphaFilter({ alpha: 1, resolution: 'inherit' });
  private readonly vertexBuffers: Buffer[];
  private readonly indexBuffer: Buffer;
  private readonly buffers = createLaserBeamBuffers();

  constructor() {
    const vertexBuffer = (data: Float32Array): Buffer => new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const positions = vertexBuffer(this.buffers.positions);
    const segments = vertexBuffer(this.buffers.segments);
    const shapes = vertexBuffer(this.buffers.shapes);
    this.vertexBuffers = [positions, segments, shapes];
    this.indexBuffer = new Buffer({ data: this.buffers.indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST });
    this.geometry = new Geometry({
      attributes: {
        aPosition: { buffer: positions, format: 'float32x2' },
        aSegment: { buffer: segments, format: 'float32x4' },
        aShape: { buffer: shapes, format: 'float32x4' },
      },
      indexBuffer: this.indexBuffer,
    });
    this.shader = createLaserBeamShader();
    this.mesh = new Mesh({ geometry: this.geometry, shader: this.shader.shader });
    this.mesh.blendMode = 'max';

    this.view = new Container({ label: 'laser-beam' });
    this.view.filters = [this.layer];
    this.view.visible = false;
    this.view.addChild(this.mesh);
  }

  /** Rebuilds the beam; the buffer updates tell PIXI to render the frame. */
  draw({ trail, dot, pointer, color, width, zoom }: LaserBeamFrame): void {
    const { halfWidth, bodyShare } = width;
    const bounds = writeLaserBeam(this.buffers, smoothBeam(trail, beamSmoothingSpacing(halfWidth, zoom)), dot, halfWidth);
    this.view.visible = bounds !== null;
    if (!bounds) return;
    for (const buffer of this.vertexBuffers) buffer.update();
    this.indexBuffer.update();
    this.shader.update(color, pointer, halfWidth, bodyShare);
    // The layer covers the beam only; vertices left from longer frames must not widen it.
    // Not `boundsArea`: inside a render group PIXI applies the group's transform to it twice, and a
    // scene thumbnail makes the viewport one, which cut the beam away in most of the map (#213).
    this.view.filterArea = new Rectangle(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  }

  /**
   * Frees the geometry, shader and filter, which a destroyed mesh leaves alive. Destroy the view with its parent first.
   * The GL program stays: `Shader.from` shares it through PIXI's program cache, and destroying it
   * would leave every later beam compiling a program without source.
   */
  destroy(): void {
    this.geometry.destroy(true);
    this.shader.shader.destroy();
    this.layer.destroy();
  }
}
