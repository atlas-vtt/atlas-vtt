import { Buffer, BufferImageSource, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Shader } from 'pixi.js';
import type { Point } from '../../../types/visionTypes';
import type { SeenSpot } from '../../../vision/perception';
import type { Sight } from '../../../vision/sight';
import { sightWedges, type SightWedge } from '../../../vision/sightWedges';
import type { Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader } from './gpu';
import { SPOT_CHANNELS, sightChannels, type SightChannels } from './senseDrawing';
import { MAX_WEDGES, layoutWedges, wedgeSource, writeWedges } from './wedges';

/** A sight mesh with the GPU objects it owns besides the mesh itself, filled anew for each area it draws. */
interface SightMesh {
  mesh: Mesh<Geometry, Shader>;
  positions: Buffer;
  indices: Buffer;
  uniforms: UniformGroup;
  /** The wedge texture, `capacity` columns wide, in the sector layout `WEDGE_GLSL` reads (`writeWedges`). */
  wedges: BufferImageSource;
  wedgeData: Float32Array;
  capacity: number;
}

/** An area to draw, with everything the senses that share it write. */
interface Area {
  origin: Point;
  apex: number;
  /** How far the senses that share it reach, 0 where that is the whole map (`unlimited`). */
  range: number;
  channels: [number, number, number, number];
}

/** Wedge texture columns a mesh starts with (a layout is at least its sectors wide), and the most spare meshes kept between frames. */
const WEDGE_COLUMNS = 64;
const SPARE_MESHES = 8;

/**
 * What vision tokens see, drawn into the lighting layer (so each render, including the player
 * window's own camera, draws it with its camera), in the channels `sightChannels` gives each
 * sense (red = seen by light, green and blue = perceived without light, alpha = dim light as
 * bright). There is one mesh per area: senses of a token that reach as far share their polygon
 * (`SightCache`) and are drawn once, with their channels together. A mesh is kept while its
 * polygon stays, so a moved token draws only its own areas anew. Meshes combine with `max`. A
 * visibility polygon is star-shaped around its origin, so a triangle fan from the origin covers
 * it exactly.
 *
 * A mesh whose area is gone is not destroyed but kept spare and filled with the next area: its
 * buffers take the new fan and wedges in place, so a token dragged across the map, whose polygon
 * changes every frame, makes no shader, geometry, buffer or texture anew for any frame (about
 * 2 ms of a step's CPU on a generated dungeon, and uploads the device had to wait for).
 */
export class SightMeshes {
  readonly view = new Container({ label: 'sight' });
  private meshes = new Map<Polygon, SightMesh>();
  /** The footprint radius the wedges of the kept meshes were worked out for. */
  private radius = 0;
  /** The footprints of tokens shown where no sense shows the map: drawn apart, since they follow a dragged token. */
  private spots: SightMesh[] = [];
  /** Meshes whose areas are gone, ready to be filled again. */
  private spare: SightMesh[] = [];

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
      this.meshes.set(polygon, this.show(polygon, origin, sightWedges(origin, polygon, radius, apex).slice(0, MAX_WEDGES), channels, range));
    }
  }

  /**
   * Each footprint as walls leave it (`SeenSpot.polygon`): never the whole disc, which would show
   * the far side of a wall the token stands at. Its edges stay hard: a wedge only ever softens
   * sight, and a footprint is too small for one.
   */
  drawSpots(spots: readonly SeenSpot[]): void {
    for (const spot of this.spots) this.release(spot);
    this.spots = spots.filter((spot) => spot.polygon.length >= 3).map((spot) => this.show(spot.polygon, spot, [], SPOT_CHANNELS));
  }

  /** A mesh of `polygon` around `origin`, a spare one filled or a new one; a `range` above 0 fades its picture towards that radius (`SENSE_FADE`). */
  private show(polygon: Polygon, origin: Point, wedges: readonly SightWedge[], channels: SightChannels, range = 0): SightMesh {
    const entry = this.spare.pop() ?? create();
    fill(entry, polygon, origin, wedges, channels, range);
    this.view.addChild(entry.mesh);
    return entry;
  }

  private release(entry: SightMesh): void {
    this.view.removeChild(entry.mesh);
    if (this.spare.length < SPARE_MESHES) this.spare.push(entry);
    else dispose(entry);
  }

  destroy(): void {
    for (const entry of [...this.meshes.values(), ...this.spots, ...this.spare]) dispose(entry);
    this.meshes.clear();
    this.spots = [];
    this.spare = [];
    destroyTree(this.view);
  }
}

/** A mesh with empty buffers and a wedge texture of `WEDGE_COLUMNS` columns, to be filled. */
function create(): SightMesh {
  const positions = new Buffer({ data: new Float32Array(0), usage: BufferUsage.VERTEX | BufferUsage.COPY_DST, shrinkToFit: false });
  const indices = new Buffer({ data: new Uint32Array(0), usage: BufferUsage.INDEX | BufferUsage.COPY_DST, shrinkToFit: false });
  const geometry = new Geometry({ attributes: { aPosition: { buffer: positions, format: 'float32x2' } }, indexBuffer: indices });
  const uniforms = new UniformGroup({
    uChannel: { value: new Float32Array(4), type: 'vec4<f32>' },
    uFade: { value: new Float32Array(3), type: 'vec3<f32>' },
  });
  const { source: wedges, data: wedgeData } = wedgeSource(WEDGE_COLUMNS);
  const shader = createShader(ENGINE_SHADERS.sight, { sightUniforms: uniforms, uWedges: wedges });
  const mesh = new Mesh({ geometry, shader });
  mesh.blendMode = 'max';
  return { mesh, positions, indices, uniforms, wedges, wedgeData, capacity: WEDGE_COLUMNS };
}

/** Fills `entry` with the fan of `polygon` around `origin`, its wedges and what the shader is told of the area. */
function fill(entry: SightMesh, polygon: Polygon, origin: Point, wedges: readonly SightWedge[], channels: SightChannels, range: number): void {
  const count = polygon.length;
  const positions = new Float32Array(2 + count * 2);
  positions[0] = origin.x;
  positions[1] = origin.y;
  for (let i = 0; i < count; i++) {
    positions[2 + i * 2] = polygon[i]!.x;
    positions[3 + i * 2] = polygon[i]!.y;
  }
  const indices = new Uint32Array(count * 3);
  for (let i = 0; i < count; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = ((i + 1) % count) + 1;
  }
  entry.positions.data = positions;
  entry.indices.data = indices;
  const layout = layoutWedges(wedges, origin);
  if (layout.width > entry.capacity) {
    let capacity = entry.capacity;
    while (capacity < layout.width) capacity *= 2;
    entry.wedges.destroy();
    ({ source: entry.wedges, data: entry.wedgeData } = wedgeSource(capacity));
    entry.capacity = capacity;
    entry.mesh.shader!.resources.uWedges = entry.wedges;
  }
  writeWedges(entry.wedgeData, entry.capacity, layout);
  entry.wedges.update();
  const { uniforms } = entry.uniforms;
  (uniforms.uChannel as Float32Array).set(channels);
  (uniforms.uFade as Float32Array).set([origin.x, origin.y, range]);
  entry.uniforms.update();
}

function dispose({ mesh, wedges }: SightMesh): void {
  mesh.geometry.destroy(true);
  mesh.shader?.destroy();
  wedges.destroy();
  mesh.destroy();
}

