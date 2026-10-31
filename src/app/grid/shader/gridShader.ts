import { Color, GlProgram, Shader, UniformGroup } from 'pixi.js';
import { HIGHP } from '../../pixi/lighting/engine/gpu';
import { dashPattern } from '../gridDash';
import type { GridLineType } from '../gridLineStyle';
import { hexCircumradius } from '../hexGeometry';
import { GRID_FRAGMENT, GRID_SHADER_KIND, GRID_SHADER_STYLE, GRID_VERTEX } from './gridShaderGlsl';

export type GridShaderKind = keyof typeof GRID_SHADER_KIND;

/** The grid as the shader draws it, in the mesh's own coordinates. */
export interface GridShaderLook {
  kind: GridShaderKind;
  /** Cell size: a square's side, a hex's flat-to-flat distance. */
  cell: number;
  /** A square lattice's line origin; a hex lattice's origin, the corner of the box around hex (0, 0). */
  offsetX: number;
  offsetY: number;
  lineType: GridLineType;
  /** Width in map pixels. */
  lineWidth: number;
  /** Arm length of a dotted grid's vertex markers, in map pixels. */
  markerArm: number;
  color: number;
  alpha: number;
}

export interface GridShader {
  shader: Shader;
  update(look: GridShaderLook): void;
}

/** The length of a cell edge: a square's side, a hex's circumradius. */
function edgeLength(look: GridShaderLook): number {
  return look.kind === 'square' ? look.cell : hexCircumradius(look.cell);
}

/** The grid's program and its uniforms (`gridShaderGlsl.ts`). Atlas renders with WebGL, so it ships a GLSL program only. */
export function createGridShader(): GridShader {
  const grid = new UniformGroup({
    uShape: { value: new Float32Array(4), type: 'vec4<f32>' },
    uStyle: { value: new Float32Array(4), type: 'vec4<f32>' },
    uDash: { value: new Float32Array(3), type: 'vec3<f32>' },
    uInk: { value: new Float32Array(4), type: 'vec4<f32>' },
  });
  const { uniforms } = grid;
  const glProgram = GlProgram.from({ vertex: GRID_VERTEX, fragment: GRID_FRAGMENT, name: 'atlas-grid', preferredFragmentPrecision: HIGHP });
  return {
    shader: new Shader({ glProgram, resources: { grid } }),
    update(look): void {
      const { count, dash, gap } = dashPattern(edgeLength(look));
      const rgb = new Color(look.color);
      uniforms.uShape.set([look.cell, GRID_SHADER_KIND[look.kind], look.offsetX, look.offsetY]);
      uniforms.uStyle.set([GRID_SHADER_STYLE[look.lineType], look.lineWidth, look.markerArm, 0]);
      uniforms.uDash.set([count, dash, gap]);
      uniforms.uInk.set([rgb.red, rgb.green, rgb.blue, look.alpha]);
    },
  };
}
