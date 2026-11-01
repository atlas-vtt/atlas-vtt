import { Buffer, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader, createTarget, renderInto } from './gpu';

/** A darkness source as it swallows light: the area the rule counts (`lightReach`), with its soft rim inside the radius. */
export interface DrawnDarkness {
  origin: Point;
  dim: number;
  /** Width of the rim, in world pixels, over which the light comes back before the radius. */
  soft: number;
  polygon: Polygon;
  darkness: true;
}

/** What a sense that sees in magical darkness perceives, and how: 1 as bright light, 0.5 as dim, 0 not at all. */
export interface PierceShape {
  origin: Point;
  polygon: Polygon;
  level: number;
  /** The party looks at the darkness here from outside it (`sightFromOutside`). */
  fromOutside?: true;
}

/** Where a light would shine but for the darkness: the area the rule counts as lit by it. */
export interface LitShape {
  origin: Point;
  polygon: Polygon;
}

/** One darkness source's coverage: its polygon as a fan, rebuilt only when the polygon is another. */
export interface DarknessMesh {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  light: Float32Array;
  polygon: Polygon | null;
}

/** A coverage mesh (`darknessFragment`) that writes `out`; the light map and the darkness map each draw their own. */
export function createDarknessMesh(world: readonly [number, number], out: readonly [number, number, number, number], blendMode: 'max' | 'erase'): DarknessMesh {
  const light = new Float32Array(2);
  const uniforms = new UniformGroup({
    uMapWorld: { value: new Float32Array(world), type: 'vec2<f32>' },
    uLight: { value: light, type: 'vec2<f32>' },
    uDim: { value: 0, type: 'f32' },
    uSoft: { value: 1, type: 'f32' },
    uOut: { value: new Float32Array(out), type: 'vec4<f32>' },
  });
  // A point until it is given its polygon.
  const mesh = new Mesh({ geometry: fanGeometry({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]), shader: createShader(ENGINE_SHADERS.darkness, { darknessUniforms: uniforms }) });
  mesh.blendMode = blendMode;
  return { mesh, uniforms, light, polygon: null };
}

/** Sets a coverage mesh to `darkness`: its area, where it is, how far it reaches and how wide its rim is. */
export function setDarknessMesh(slot: DarknessMesh, darkness: DrawnDarkness): void {
  if (slot.polygon !== darkness.polygon) {
    const previous = slot.mesh.geometry;
    slot.mesh.geometry = fanGeometry(darkness.origin, darkness.polygon);
    previous.destroy(true);
    slot.polygon = darkness.polygon;
  }
  slot.light[0] = darkness.origin.x;
  slot.light[1] = darkness.origin.y;
  slot.uniforms.uniforms.uDim = darkness.dim;
  slot.uniforms.uniforms.uSoft = darkness.soft;
}

export function destroyDarknessMesh({ mesh }: DarknessMesh): void {
  mesh.geometry.destroy(true);
  mesh.shader?.destroy();
  mesh.destroy();
}

/**
 * Where the map is magically dark, in world space like the light map (`rgba8unorm`): red is how
 * much of the light the darkness sources swallow there, green what a sense that sees in magical
 * darkness perceives of it (0.5 as dim light, 1 as bright), blue where a light would shine
 * (the lights the darkness swallows are not in the light map, so nothing else tells), alpha where
 * the party looks at it from outside. The composite takes the ambient light, the bounce and the
 * senses that do not see in magical darkness out by red, lets the senses in green through, and
 * shows the players the veil only where something is swallowed (blue is one of the three things
 * that can be) and they look from outside. It exists only on maps that have had a darkness source.
 */
export class DarknessMap {
  readonly texture: RenderTexture;
  private readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly pierce = new Container();
  private readonly slots: DarknessMesh[] = [];

  constructor(private readonly renderer: Renderer, bounds: MapBounds, texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba8unorm');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
    this.scene.addChild(this.pierce);
  }

  draw(sources: readonly DrawnDarkness[], shapes: readonly PierceShape[], lit: readonly LitShape[] = []): void {
    while (this.slots.length < sources.length) this.slots.push(this.createSlot());
    this.slots.forEach((slot, i) => {
      const source = sources[i];
      slot.mesh.visible = !!source;
      if (source) setDarknessMesh(slot, source);
    });
    this.releasePierce();
    for (const shape of shapes) {
      if (shape.polygon.length >= 3) this.pierce.addChild(this.createShape(shape, [0, shape.level, 0, shape.fromOutside ? 1 : 0]));
    }
    for (const shape of lit) {
      if (shape.polygon.length >= 3) this.pierce.addChild(this.createShape(shape, [0, 0, 1, 0]));
    }
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
  }

  private createSlot(): DarknessMesh {
    const slot = createDarknessMesh(this.world, [1, 0, 0, 0], 'max');
    // Below what the senses see in it, which is drawn into the other channel.
    this.scene.addChildAt(slot.mesh, 0);
    return slot;
  }

  private createShape({ origin, polygon }: LitShape, out: readonly [number, number, number, number]): Mesh<Geometry, Shader> {
    const uniforms = new UniformGroup({
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uOut: { value: new Float32Array(out), type: 'vec4<f32>' },
    });
    const mesh = new Mesh({ geometry: fanGeometry(origin, polygon), shader: createShader(ENGINE_SHADERS.pierce, { pierceUniforms: uniforms }) });
    mesh.blendMode = 'max';
    return mesh;
  }

  private releasePierce(): void {
    for (const mesh of this.pierce.removeChildren() as Mesh<Geometry, Shader>[]) {
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      mesh.destroy();
    }
  }

  destroy(): void {
    this.releasePierce();
    for (const slot of this.slots) {
      this.scene.removeChild(slot.mesh);
      destroyDarknessMesh(slot);
    }
    destroyTree(this.scene);
    this.texture.destroy(true);
  }
}

/** A visibility polygon is star-shaped around its origin, so a triangle fan from the origin covers it exactly. */
export function fanGeometry(origin: Point, polygon: Polygon): Geometry {
  const positions = new Float32Array([origin.x, origin.y, ...polygon.flatMap((p) => [p.x, p.y])]);
  const indices: number[] = [];
  for (let i = 1; i <= polygon.length; i++) indices.push(0, i, (i % polygon.length) + 1);
  return new Geometry({
    attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
    indexBuffer: new Buffer({ data: new Uint32Array(indices), usage: BufferUsage.INDEX }),
  });
}
