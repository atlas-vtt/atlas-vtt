import { Buffer, BufferUsage, Container, Geometry, Mesh, UniformGroup, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { limitedMargin } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import type { Point } from '../../../types/visionTypes';
import type { WallSegment } from '../../../types/wallTypes';
import { sweepLightMask, wallsInReach, type Swept } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createShader, createTarget, renderInto } from './gpu';

/**
 * Takes out of a light's tile what limited walls stop. A sphere trace cannot count the walls it
 * crosses, so the tile is traced through solid walls only, and then:
 *
 * 1. Everything beyond the polygon of `sweepLightMask` is written as 0: along every ray from
 *    the light's place the tile is kept as far as the first limited wall, and behind that wall
 *    only as far as the rule's own reach (`computeVisibility`: the first solid wall or the
 *    second limited one). So before the first limited wall a light is what it is in any scene,
 *    with the soft shadows of solid walls, and behind one it is the rule's reach and nothing
 *    else: a soft shadow there would be light from the flame's edge that passed a solid wall's
 *    end through limited walls the count from the flame's middle never met. For every edge of
 *    the polygon the strip between the two rays from that edge outward is drawn, which together
 *    are all that lies outside it, the polygon being star-shaped (`beyond`). Around every edge
 *    that lies on a limited wall, a box a capsule's width to every side is written as 0 too:
 *    the wall's capsule, as a tile is dark inside a solid wall's.
 * 2. Around every limited wall, as far, each texel takes the darkest of itself and what lies
 *    across the wall (`limitedFragment`): a ray that runs along a wall and stops elsewhere
 *    lights the floor beside it though the wall's other side is dark, and no edge of the
 *    polygon lies there. Where the light passed the wall, both sides are lit and nothing changes.
 *
 * With both, no texel within a bilinear read of a limited wall's dark side is lit, whichever
 * way the light came to it, and the composite gives the wall's near face the light of the
 * floor in front of it, as it does for every wall.
 *
 * A light that no limited wall can stop keeps its tile as it is.
 */
export class LimitedTileMask {
  private readonly world = new Float32Array(2);
  private readonly outside: Shader;
  private readonly across: Shader;
  private readonly acrossUniforms: UniformGroup;
  private readonly outsideUniforms: UniformGroup;
  private readonly placeholder = createPlaceholder();
  private readonly scene = new Container();

  constructor(private readonly renderer: Renderer, private readonly texel: number) {
    this.outsideUniforms = new UniformGroup({ uMapWorld: { value: this.world, type: 'vec2<f32>' }, uOut: { value: new Float32Array([0, 0, 0, 1]), type: 'vec4<f32>' } });
    this.outside = createShader(ENGINE_SHADERS.pierce, { pierceUniforms: this.outsideUniforms });
    this.acrossUniforms = new UniformGroup({ uMapWorld: { value: this.world, type: 'vec2<f32>' }, uTexel: { value: texel, type: 'f32' } });
    this.across = createShader(ENGINE_SHADERS.tileLimited, { limitedUniforms: this.acrossUniforms, uTile: this.placeholder.source });
  }

  /**
   * `tile` covers `rect` (on the texel grid) and was traced for a light whose rule counts from
   * `origin`. Returns the tile to use: `tile` itself where no limited wall stops the light, else
   * a new one, `tile` being destroyed.
   */
  apply(tile: RenderTexture, rect: Rect, origin: Point, walls: readonly WallSegment[]): RenderTexture {
    // Far enough to hold the whole tile, whose light stands inside it.
    const radius = Math.hypot(rect[2], rect[3]) + 2;
    const inReach = wallsInReach(walls, origin, radius, 'light');
    const limited = inReach.filter((wall) => wall.limited);
    if (limited.length === 0) return tile;
    const swept = sweepLightMask(origin, radius, inReach, 'light');
    if (!swept.polygon.some((corner) => Math.hypot(corner.x - origin.x, corner.y - origin.y) < radius - 1)) return tile;
    const corner = { x: rect[0], y: rect[1] };
    const { pixelWidth, pixelHeight } = tile.source;
    this.world.set([pixelWidth * this.texel, pixelHeight * this.texel]);
    this.outsideUniforms.update();
    this.acrossUniforms.update();
    this.draw(tile, this.outside, 'normal', beyond(origin, swept, corner, radius, limitedMargin(this.texel)));
    const masked = createTarget(pixelWidth, pixelHeight, 'r8unorm', 'nearest');
    this.across.resources.uTile = tile.source;
    this.draw(masked, this.across, 'min', around(limited, corner, limitedMargin(this.texel), this.world), [1, 0, 0, 1]);
    this.across.resources.uTile = this.placeholder.source;
    tile.destroy(true);
    return masked;
  }

  destroy(): void {
    destroyTree(this.scene);
    this.outside.destroy();
    this.across.destroy();
    this.placeholder.destroy(true);
  }

  private draw(target: RenderTexture, shader: Shader, blendMode: 'normal' | 'min', geometry: Geometry, clear?: [number, number, number, number]): void {
    const mesh = new Mesh({ geometry, shader });
    mesh.blendMode = blendMode;
    // `min` blending applies only to a mesh below the render root.
    this.scene.addChild(mesh);
    try {
      renderInto(this.renderer, this.scene, target, clear);
    } finally {
      this.scene.removeChild(mesh);
      mesh.destroy();
      geometry.destroy(true);
    }
  }
}

type Quad = (a: Point, b: Point, c: Point, d: Point, across?: Point) => void;

function quadList(corner: Point): { positions: number[]; reach: number[]; quad: Quad } {
  const positions: number[] = [];
  const reach: number[] = [];
  return {
    positions,
    reach,
    quad: (a, b, c, d, across = { x: 0, y: 0 }) => {
      for (const p of [a, b, c, a, c, d]) {
        positions.push(p.x - corner.x, p.y - corner.y);
        reach.push(across.x, across.y);
      }
    },
  };
}

const vertexBuffer = (data: number[]): Buffer => new Buffer({ data: new Float32Array(data), usage: BufferUsage.VERTEX });

/** Corners of the polygon nearer to each other than this are one: three rays a hair apart that stop at the same wall. */
const SAME_CORNER = 0.05;
/** How far a strip reaches past the rays that bound it, in pixels at its near end; never less than `MIN_OVERLAP` radians. */
const OVERLAP = 0.03;
const MIN_OVERLAP = 3e-5;
const MAX_OVERLAP = 5e-4;

/**
 * Beyond every edge of the polygon, the strip between the rays through its two ends, well past
 * the tile; and around every edge on a wall that stopped the light, a box `margin` to every
 * side. A rasteriser decides slivers thinner than its grid either way and may leave a crack
 * between two triangles that reach far out of its target, so the strips overlap: each reaches
 * a little past its rays (at most `MAX_OVERLAP` radians: a shadow's edge moves by less than
 * half a pixel at a thousand), and corners that lie within `SAME_CORNER` of each other are one.
 */
function beyond(origin: Point, { polygon, stops }: Swept, corner: Point, far: number, margin: number): Geometry {
  const { positions, quad } = quadList(corner);
  const turned = (p: Point, by: number, length = 1): Point => {
    const cos = Math.cos(by) * length, sin = Math.sin(by) * length;
    return { x: origin.x + (p.x - origin.x) * cos - (p.y - origin.y) * sin, y: origin.y + (p.x - origin.x) * sin + (p.y - origin.y) * cos };
  };
  const kept: number[] = [];
  polygon.forEach((p, i) => {
    const last = polygon[kept[kept.length - 1] ?? -1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > SAME_CORNER) kept.push(i);
  });
  for (let k = 0; k < kept.length; k++) {
    const i = kept[k]!, j = kept[(k + 1) % kept.length]!;
    const a = polygon[i]!, b = polygon[j]!;
    const [ra, rb] = [Math.hypot(a.x - origin.x, a.y - origin.y), Math.hypot(b.x - origin.x, b.y - origin.y)];
    const near = Math.min(ra, rb);
    if (near > 1e-6) {
      const by = Math.min(MAX_OVERLAP, Math.max(MIN_OVERLAP, OVERLAP / near));
      quad(turned(a, -by), turned(b, by), turned(b, by, (2 * far) / rb), turned(a, -by, (2 * far) / ra));
    }
    const [stopA, stopB] = [stops[i], stops[j]];
    const onWall = !!stopA && !!stopB && stopA.some((wall) => stopB.includes(wall));
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (!onWall || length < 1e-9) continue;
    const along = { x: ((b.x - a.x) / length) * margin, y: ((b.y - a.y) / length) * margin };
    const across = { x: -along.y, y: along.x };
    const from = { x: a.x - along.x, y: a.y - along.y }, to = { x: b.x + along.x, y: b.y + along.y };
    quad({ x: from.x + across.x, y: from.y + across.y }, { x: to.x + across.x, y: to.y + across.y }, { x: to.x - across.x, y: to.y - across.y }, { x: from.x - across.x, y: from.y - across.y });
  }
  return new Geometry({ attributes: { aPosition: { buffer: vertexBuffer(positions), format: 'float32x2' } } });
}

/** The whole tile once, to copy it, and a box around every limited wall, `margin` to every side, that reads across the wall. */
function around(walls: readonly WallSegment[], corner: Point, margin: number, world: Float32Array): Geometry {
  const { positions, reach, quad } = quadList(corner);
  const [w = 0, h = 0] = world;
  quad(corner, { x: corner.x + w, y: corner.y }, { x: corner.x + w, y: corner.y + h }, { x: corner.x, y: corner.y + h });
  for (const { p1, p2 } of walls) {
    const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (!(length > 0)) continue;
    const along = { x: ((p2.x - p1.x) / length) * margin, y: ((p2.y - p1.y) / length) * margin };
    const across = { x: -along.y, y: along.x };
    const from = { x: p1.x - along.x, y: p1.y - along.y }, to = { x: p2.x + along.x, y: p2.y + along.y };
    quad({ x: from.x + across.x, y: from.y + across.y }, { x: to.x + across.x, y: to.y + across.y }, { x: to.x - across.x, y: to.y - across.y }, { x: from.x - across.x, y: from.y - across.y }, across);
  }
  return new Geometry({ attributes: { aPosition: { buffer: vertexBuffer(positions), format: 'float32x2' }, aAcross: { buffer: vertexBuffer(reach), format: 'float32x2' } } });
}
