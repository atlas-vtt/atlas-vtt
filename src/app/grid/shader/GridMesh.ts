import { Geometry, Mesh, type Shader } from 'pixi.js';
import type { GridBounds } from '../gridLineStyle';
import { createGridShader, type GridShaderLook } from './gridShader';

/**
 * The grid's lines: one quad over the grid's bounds, drawn by `gridShaderGlsl`
 * from the lattice alone. Its cost is the pixels it covers, whatever the map's size or the cell's,
 * and nothing is built per zoom: every render reads its own pixel size, so the GM's canvas, the
 * player frame and a thumbnail each get the grid for their camera.
 */
export class GridMesh {
  readonly view: Mesh<Geometry, Shader>;
  private readonly positions = new Float32Array(8);
  private readonly geometry: Geometry;
  private readonly shader = createGridShader();

  constructor(bounds: GridBounds, look: GridShaderLook) {
    this.geometry = new Geometry({
      attributes: { aPosition: { buffer: this.positions, format: 'float32x2' } },
      indexBuffer: new Uint16Array([0, 1, 2, 0, 2, 3]),
    });
    this.view = new Mesh<Geometry, Shader>({ geometry: this.geometry, shader: this.shader.shader, label: 'grid-lines' });
    this.setBounds(bounds);
    this.setLook(look);
  }

  /** Where the quad lies, in the mesh's own coordinates. */
  setBounds({ minX, minY, maxX, maxY }: GridBounds): void {
    this.positions.set([minX, minY, maxX, minY, maxX, maxY, minX, maxY]);
    this.geometry.getBuffer('aPosition').update();
  }

  setLook(look: GridShaderLook): void {
    this.shader.update(look);
  }

  destroy(): void {
    this.view.destroy();
    this.geometry.destroy();
    this.shader.shader.destroy();
  }
}
