import { Buffer, BufferImageSource, BufferUsage, Color, Container, Geometry, Mesh, Texture, triangulateWithHoles, type Shader } from 'pixi.js';
import type { MeasureEffect } from '../../../measure/measureEffects';
import { ringBounds } from '../../../measure/measureGeometry';
import type { Point } from '../../../types/visionTypes';
import { fnv1a32 } from '../../../utils/hashing';
import type { Box } from '../../../vision/polygonBounds';
import { fieldDistance, liquidField } from '../../liquids/liquidField';
import { loopTime } from '../../liquids/liquidMotion';
import { destroyTree } from '../../utils/destroyTree';
import { EFFECT_STILL_SECONDS, effectDrifts } from './effectMotion';
import { areaFrame, effectPieces, movedBy, reachFrom, type EffectPiece, type Ring } from './effectPieces';
import { createEffectLook, createEffectShader, EFFECT_CODE, type EffectDetail, type EffectLook } from './effectShader';

/** The cell an area's patterns are scaled to where none is given, world pixels. */
const DEFAULT_CELL = 100;
/** How far arcs lean from a thin area's length, radians; a round area's lean any way (half a turn). */
const THIN_SPREAD = 0.45;

export interface MeasureEffectOptions {
  /** The area's outline, world pixels (`MeasureArea.rings`): one ring, or more where walls cut it apart. */
  rings: readonly Ring[];
  effect: MeasureEffect;
  /** '#rrggbb': the one colour the look's lights and darks come from. */
  color: string;
  detail: EffectDetail;
  /** The grid's cell, world pixels: the size every pattern is scaled to. Unset, 100. */
  cell?: number;
  /**
   * The area's origin, world pixels: its patterns hold on to it (an aura's go with its token) and
   * radiance's rays leave from it. Unset, the middle of its bounds.
   */
  origin?: Point;
  /** What tells this area's pattern from another's of the same look, e.g. the measurement's id. */
  seed?: string;
}

interface Piece {
  mesh: Mesh<Geometry, Shader>;
  geometry: Geometry;
  field: Texture;
}

const local = (ring: Ring, anchor: Point): Point[] => ring.map(({ x, y }) => ({ x: x - anchor.x, y: y - anchor.y }));

/** A piece as triangles, exactly its outline less its holes (earcut, as PIXI fills a polygon). */
function triangles({ outline, holes }: EffectPiece): { positions: Float32Array; indices: Uint32Array } {
  const points: number[] = [];
  const starts: number[] = [];
  for (const ring of [outline, ...holes]) {
    if (ring !== outline) starts.push(points.length / 2);
    for (const { x, y } of ring) points.push(x, y);
  }
  const vertices: number[] = [];
  const indices: number[] = [];
  triangulateWithHoles(points, starts, vertices, 2, 0, indices, 0);
  return { positions: new Float32Array(vertices), indices: new Uint32Array(indices) };
}

/**
 * One area's effect on the map: a mesh of exactly the area's polygon for each piece walls cut it
 * into, shaded by `effectShader` with the piece's distance field (the liquids' `liquidField`), in
 * world space at the area's own place. Its layer lies under the tokens and the lighting, which
 * lights it like floor. Changed in place: only new rings build geometry, and rings that only
 * moved (an aura with its token) move the view instead.
 */
export class MeasureEffectMesh {
  /** What goes on the stage. */
  readonly view = new Container({ label: 'measure-effect', eventMode: 'none', interactiveChildren: false });
  private readonly look: EffectLook = createEffectLook();
  private readonly drifts = new Float32Array(8);
  private pieces: Piece[] = [];
  private options: Required<Omit<MeasureEffectOptions, 'origin'>> & { origin: Point | null };
  /** World place of the view: the pieces' geometry is measured from it. */
  private anchor: Point = { x: 0, y: 0 };
  private box: Box = ringBounds([]);
  private seconds = 0;
  private still = false;

  constructor(options: MeasureEffectOptions) {
    this.options = { ...options, cell: options.cell ?? DEFAULT_CELL, origin: options.origin ?? null, seed: options.seed ?? '' };
    this.build();
    this.showLook();
    this.showTime();
  }

  /** The box around the area, world pixels: nothing need be shown while it is out of view. */
  get bounds(): Box {
    return this.box;
  }

  /** Takes on what changed; what is left out stays. New rings build geometry, rings that only moved move the view. */
  update(changes: Partial<MeasureEffectOptions>): void {
    const before = this.options;
    // An origin given as undefined is taken away again; everything else given as undefined stays.
    const origin = 'origin' in changes ? changes.origin ?? null : before.origin;
    this.options = {
      rings: changes.rings ?? before.rings,
      effect: changes.effect ?? before.effect,
      color: changes.color ?? before.color,
      detail: changes.detail ?? before.detail,
      cell: changes.cell ?? before.cell,
      seed: changes.seed ?? before.seed,
      origin,
    };
    const { rings, cell, effect } = this.options;
    const moved = rings === before.rings ? { x: 0, y: 0 } : movedBy(before.rings, rings);
    if (!moved || cell !== before.cell) {
      this.build();
    } else if (moved.x !== 0 || moved.y !== 0) {
      this.anchor = { x: this.anchor.x + moved.x, y: this.anchor.y + moved.y };
      this.box = { minX: this.box.minX + moved.x, minY: this.box.minY + moved.y, maxX: this.box.maxX + moved.x, maxY: this.box.maxY + moved.y };
      this.view.position.set(this.anchor.x, this.anchor.y);
      this.frame(effectPieces(rings));
    } else if (origin !== before.origin) {
      this.frame(effectPieces(rings));
    }
    this.showLook();
    if (effect !== before.effect) this.showTime();
  }

  /** Shows the effect as it moves `seconds` into its motion; held still, it takes the moment on once it moves again. */
  setTime(seconds: number): void {
    this.seconds = seconds;
    if (!this.still) this.showTime();
  }

  /** Holds the effect on its still picture (maps not animated, reduced motion), or lets it move again. */
  setStill(still: boolean): void {
    if (still === this.still) return;
    this.still = still;
    this.showTime();
  }

  /** Frees the view, its geometry, fields and shaders; the GL program stays shared in PIXI's cache. */
  destroy(): void {
    this.clear();
    destroyTree(this.view);
  }

  private showLook(): void {
    const { uniforms } = this.look;
    const { effect, color, detail, cell, seed } = this.options;
    const tint = new Color(color);
    uniforms.uTint.set([tint.red, tint.green, tint.blue]);
    uniforms.uEffect = EFFECT_CODE[effect];
    uniforms.uDetail = detail;
    uniforms.uCell = cell;
    const hash = fnv1a32(seed);
    uniforms.uSeed.set([hash % 997, (hash >>> 10) % 991]);
  }

  private showTime(): void {
    const { uniforms } = this.look;
    const seconds = this.still ? EFFECT_STILL_SECONDS : this.seconds;
    effectDrifts(this.options.effect, seconds, this.drifts);
    uniforms.uDriftA.set(this.drifts.subarray(0, 4));
    uniforms.uDriftB.set(this.drifts.subarray(4, 8));
    uniforms.uTime = loopTime(seconds);
    uniforms.uStill = this.still ? 1 : 0;
  }

  /** Where the area's patterns hold on, its middle, length and reach, for the looks that read them. */
  private frame(pieces: readonly EffectPiece[]): void {
    const { uniforms } = this.look;
    const { rings, cell } = this.options;
    const { minX, minY, maxX, maxY } = this.box;
    const origin = this.options.origin ?? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    uniforms.uShift.set([this.anchor.x - origin.x, this.anchor.y - origin.y]);
    uniforms.uReach = Math.max(reachFrom(origin, rings) / cell, 1e-3);
    const shape = areaFrame(pieces);
    if (!shape) return;
    uniforms.uFrame.set([(shape.centre.x - origin.x) / cell, (shape.centre.y - origin.y) / cell, shape.axis.x, shape.axis.y]);
    uniforms.uSpread = Math.PI + (THIN_SPREAD - Math.PI) * Math.min(1, shape.stretch * 1.25);
  }

  private build(): void {
    this.clear();
    const { rings, cell } = this.options;
    const pieces = Number.isFinite(cell) && cell > 0 ? effectPieces(rings) : [];
    this.box = ringBounds(pieces.map((piece) => piece.outline));
    this.anchor = pieces[0]?.outline[0] ?? { x: 0, y: 0 };
    this.view.position.set(this.anchor.x, this.anchor.y);
    this.frame(pieces);
    for (const piece of pieces) this.add({ outline: local(piece.outline, this.anchor), holes: piece.holes.map((hole) => local(hole, this.anchor)) });
  }

  private add(piece: EffectPiece): void {
    const { positions, indices } = triangles(piece);
    if (indices.length === 0) return;
    const { cell } = this.options;
    const field = liquidField(piece.outline, cell, piece.holes);
    const texture = new Texture({
      source: new BufferImageSource({
        resource: field.texels, width: field.width, height: field.height, format: 'rgba8unorm',
        alphaMode: 'no-premultiply-alpha', scaleMode: 'linear', addressMode: 'clamp-to-edge', autoGenerateMipmaps: false,
      }),
    });
    const geometry = new Geometry({
      attributes: { aPosition: { buffer: new Buffer({ data: positions, usage: BufferUsage.VERTEX }), format: 'float32x2' } },
      indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX }),
    });
    const { shader, uniforms } = createEffectShader(this.look.group, texture);
    uniforms.uFieldRect.set([field.origin.x, field.origin.y, field.width * field.texel, field.height * field.texel]);
    uniforms.uFieldCode.set([field.outside, field.near, field.far, 0]);
    let depth = 0;
    for (let j = 0; j < field.height; j++) for (let i = 0; i < field.width; i++) depth = Math.max(depth, fieldDistance(field, i, j));
    uniforms.uDepth = Math.max(depth, 0.05);
    const mesh = new Mesh({ geometry, shader, label: 'measure-effect-piece' });
    mesh.eventMode = 'none';
    this.view.addChild(mesh);
    this.pieces.push({ mesh, geometry, field: texture });
  }

  private clear(): void {
    for (const { mesh, geometry, field } of this.pieces) {
      const shader = mesh.shader;
      mesh.destroy();
      geometry.destroy(true);
      shader?.destroy();
      field.destroy(true);
    }
    this.pieces = [];
  }
}
