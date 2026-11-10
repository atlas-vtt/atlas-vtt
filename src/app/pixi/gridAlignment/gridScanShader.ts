import { Shader, Texture, UniformGroup } from 'pixi.js';
import type { TextureSource } from 'pixi.js';
import type { AlignmentPoint, MapBounds } from '../gridAlignmentMath';
import { GRID_SCAN_FRAGMENT, GRID_SCAN_VERTEX } from './gridScanGlsl';
import type { Affine, LatticeLook, ScanFrame } from './scanFrame';

/** How `cellOf` in the fragment shader tells the grid types apart (`shape.y`). */
const KIND = { square: 0, 'hex-vertical': 1, 'hex-horizontal': 2 } as const;

export interface ScanView {
  /** The map's rect in the world. */
  mapRect: MapBounds;
  /** World units per pixel of the screen. */
  pixelSize: number;
  /** Where the waves start, and how far it is from there to the map's farthest corner. */
  origin: AlignmentPoint;
  reach: number;
  /** The colour the answer's lines settle into: the scene's own grid takes over in it. */
  lineColor: readonly [number, number, number];
  /** Takes the world to the ink texture's own coordinates (0–1). */
  toInk: Affine;
}

export interface GridScanShader {
  shader: Shader;
  setInk(source: TextureSource | null): void;
  setHits(source: TextureSource | null): void;
  /** The map's own picture, laid on its image as the ink is: what a swell bends. Without one a swell only shines. */
  setPicture(source: TextureSource | null): void;
  update(view: ScanView, frame: ScanFrame): void;
}

type VecSize = 2 | 3 | 4;

function vec(size: VecSize): { value: Float32Array; type: `vec${VecSize}<f32>` } {
  return { value: new Float32Array(size), type: `vec${size}<f32>` };
}

function setRows(rowX: Float32Array, rowY: Float32Array, [a, b, c, d, e, f]: Affine): void {
  rowX.set([a, b, c]);
  rowY.set([d, e, f]);
}

/** A lattice's uniforms; a cell size of 0 is how the shader knows there is none. */
function setLattice(rowX: Float32Array, rowY: Float32Array, shape: Float32Array, look: Float32Array, { lattice, alpha, soft }: LatticeLook): void {
  look.set([alpha, soft]);
  if (!lattice) {
    shape.fill(0);
    return;
  }
  setRows(rowX, rowY, lattice.toLattice);
  shape.set([lattice.cellSize, KIND[lattice.gridType], lattice.offsetX, lattice.offsetY]);
}

export function createGridScanShader(): GridScanShader {
  const scan = new UniformGroup({
    uMapRect: vec(4),
    uPixelSize: { value: 1, type: 'f32' },
    uSeconds: { value: 0, type: 'f32' },
    uLineColor: vec(3),
    uOrigin: vec(2),
    uReach: { value: 1, type: 'f32' },
    uScrim: { value: 0, type: 'f32' },
    uLooking: { value: 0, type: 'f32' },
    uLock: vec(2),
    uInkRowX: vec(3),
    uInkRowY: vec(3),
    uHas: vec(3),
    uFrontRowX: vec(3),
    uFrontRowY: vec(3),
    uFrontShape: vec(4),
    uFrontLook: vec(2),
    uBackRowX: vec(3),
    uBackRowY: vec(3),
    uBackShape: vec(4),
    uBackLook: vec(2),
    uTrialRowX: vec(3),
    uTrialRowY: vec(3),
    uTrialShape: vec(4),
    uTrialLook: vec(2),
  });
  const { uniforms } = scan;
  const shader = Shader.from({
    gl: { vertex: GRID_SCAN_VERTEX, fragment: GRID_SCAN_FRAGMENT, name: 'atlas-grid-scan' },
    resources: { scan, uInk: Texture.EMPTY.source, uHits: Texture.EMPTY.source, uPicture: Texture.EMPTY.source },
  });
  /** 1 where the ink, the hits and the picture have a texture of their own: the empty one must count for nothing. */
  const has = [0, 0, 0];

  return {
    shader,
    setInk(source): void {
      shader.resources.uInk = source ?? Texture.EMPTY.source;
      has[0] = source ? 1 : 0;
    },
    setHits(source): void {
      shader.resources.uHits = source ?? Texture.EMPTY.source;
      has[1] = source ? 1 : 0;
    },
    setPicture(source): void {
      shader.resources.uPicture = source ?? Texture.EMPTY.source;
      has[2] = source ? 1 : 0;
    },
    update({ mapRect, pixelSize, origin, reach, lineColor, toInk }, frame): void {
      uniforms.uMapRect.set([mapRect.x, mapRect.y, mapRect.width, mapRect.height]);
      uniforms.uPixelSize = pixelSize;
      uniforms.uSeconds = frame.time;
      uniforms.uLineColor.set(lineColor);
      uniforms.uOrigin.set([origin.x, origin.y]);
      uniforms.uReach = reach;
      uniforms.uScrim = frame.scrim;
      uniforms.uLooking = frame.looking;
      uniforms.uLock.set([frame.lock.radius, frame.lock.glow]);
      setRows(uniforms.uInkRowX, uniforms.uInkRowY, toInk);
      uniforms.uHas.set(has);
      setLattice(uniforms.uFrontRowX, uniforms.uFrontRowY, uniforms.uFrontShape, uniforms.uFrontLook, frame.front);
      setLattice(uniforms.uBackRowX, uniforms.uBackRowY, uniforms.uBackShape, uniforms.uBackLook, frame.back);
      setLattice(uniforms.uTrialRowX, uniforms.uTrialRowY, uniforms.uTrialShape, uniforms.uTrialLook, frame.trial);
    },
  };
}
