import { BufferImageSource, Container, Mesh, UniformGroup, type Geometry, type Shader } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import { sightWedges, type SightWedge } from '../../../vision/sightWedges';
import type { Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { fanGeometry } from './DarknessMap';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader } from './gpu';
import { SPOT_CHANNELS, sightChannels, type SightChannels } from './senseDrawing';
import { MAX_WEDGES } from './sightShader';

/** A sight mesh with the GPU objects it owns besides the mesh itself. */
interface SightMesh {
  mesh: Mesh<Geometry, Shader>;
  wedges: BufferImageSource;
}

/** An area to draw, with everything the senses that share it write. */
interface Area {
  origin: Point;
  apex: number;
  /** How far the senses that share it reach, 0 where that is the whole map (`unlimited`). */
  range: number;
  channels: [number, number, number, number];
}

/**
 * What vision tokens see, drawn into the lighting layer (so each render, including the player
 * window's own camera, draws it with its camera), in the channels `sightChannels` gives each
 * sense (red = seen by light, green and blue = perceived without light, alpha = dim light as
 * bright). There is one mesh per area: senses of a token that reach as far share their polygon
 * (`SightCache`) and are drawn once, with their channels together. A mesh is kept while its
 * polygon stays, so a moved token draws only its own areas anew. Meshes combine with `max`. A
 * visibility polygon is star-shaped around its origin, so a triangle fan from the origin covers
 * it exactly.
 */
export class SightMeshes {
  readonly view = new Container({ label: 'sight' });
  private meshes = new Map<Polygon, SightMesh>();
  /** The footprint radius the wedges of the kept meshes were worked out for. */
  private radius = 0;
  /** The footprints of tokens shown where no sense shows the map: drawn apart, since they follow a dragged token. */
  private spots: SightMesh[] = [];

  /**
   * A sense whose range is at least `unlimited` (the map's diagonal: what a sense without a range
   * is given) reaches the whole map, and its picture does not fade.
   */
  draw(sight: Sight, radius: number, unlimited = Infinity): void {
    const areas = new Map<Polygon, Area>();
    for (const region of sight.all ? [] : sight.regions) {
      const channels = sightChannels(region);
      if (!channels || !region.polygon || region.polygon.length < 3) continue;
      const area = areas.get(region.polygon);
      if (area) channels.forEach((value, i) => { area.channels[i] = Math.max(area.channels[i]!, value); });
      else areas.set(region.polygon, { origin: region.origin, apex: region.apex, range: region.radius >= unlimited - 1 ? 0 : region.radius, channels: [...channels] });
    }
    for (const [polygon, kept] of this.meshes) {
      if (areas.has(polygon) && radius === this.radius) continue;
      this.release(kept);
      this.meshes.delete(polygon);
    }
    this.radius = radius;
    for (const [polygon, { origin, apex, range, channels }] of areas) {
      // A kept polygon is drawn as it was: the cache hands out a new one whenever a token or its senses change.
      if (this.meshes.has(polygon)) continue;
      this.meshes.set(polygon, this.create(polygon, origin, sightWedges(origin, polygon, radius, apex).slice(0, MAX_WEDGES), channels, range));
    }
  }

  /**
   * Each footprint as walls leave it (`SeenSpot.polygon`): never the whole disc, which would show
   * the far side of a wall the token stands at. Its edges stay hard: a wedge only ever softens
   * sight, and a footprint is too small for one.
   */
  drawSpots(spots: readonly SeenSpot[]): void {
    for (const spot of this.spots) this.release(spot);
    this.spots = spots.filter((spot) => spot.polygon.length >= 3).map((spot) => this.create(spot.polygon, spot, [], SPOT_CHANNELS));
  }

  /** A mesh of `polygon` around `origin`; a `range` above 0 fades its picture towards that radius (`SENSE_FADE`). */
  private create(polygon: Polygon, origin: Point, wedges: readonly SightWedge[], channels: SightChannels, range = 0): SightMesh {
    const wedgeSource = wedgeTexture(wedges);
    const uniforms = new UniformGroup({
      uWedgeCount: { value: wedges.length, type: 'i32' },
      uChannel: { value: new Float32Array(channels), type: 'vec4<f32>' },
      uFade: { value: new Float32Array([origin.x, origin.y, range]), type: 'vec3<f32>' },
    });
    const shader = createShader(ENGINE_SHADERS.sight, { sightUniforms: uniforms, uWedges: wedgeSource });
    const mesh = new Mesh({ geometry: fanGeometry(origin, polygon), shader });
    mesh.blendMode = 'max';
    this.view.addChild(mesh);
    return { mesh, wedges: wedgeSource };
  }

  private release({ mesh, wedges }: SightMesh): void {
    this.view.removeChild(mesh);
    mesh.geometry.destroy(true);
    mesh.shader?.destroy();
    wedges.destroy();
    mesh.destroy();
  }

  destroy(): void {
    for (const mesh of [...this.meshes.values(), ...this.spots]) this.release(mesh);
    this.meshes.clear();
    this.spots = [];
    destroyTree(this.view);
  }
}

/** Two rows of `rgba32float` texels, one column per wedge: corner and edge, then side and angle. */
function wedgeTexture(wedges: readonly SightWedge[]): BufferImageSource {
  const count = Math.max(1, wedges.length);
  const data = new Float32Array(count * 2 * 4);
  wedges.forEach((w, i) => {
    data.set([w.a.x, w.a.y, w.e.x, w.e.y], i * 4);
    data.set([w.side, w.phi, 0, 0], (count + i) * 4);
  });
  // Premultiplying on upload is invalid for float data and leaves the texture empty.
  return new BufferImageSource({
    resource: data,
    width: count,
    height: 2,
    format: 'rgba32float',
    scaleMode: 'nearest',
    alphaMode: 'no-premultiply-alpha',
  });
}
