import { holdsPixels, releaseCanvas } from '../../imageProcessing/canvasLimit';
import type { DerivedFormat } from '../../imageProcessing/imageEncoder';
import { failedEngineShaders } from '../../pixi/lighting/engine/shaderCheck';
import { unrenderableEngineTargets } from '../../pixi/lighting/engine/targetCheck';
import { section, yesNo, type ReportRow, type ReportSection } from './reportModel';

/** What a square canvas of one side did: drew, stayed blank (WebKit's cap), or could not be made. */
export type CanvasAnswer = 'draws' | 'blank' | 'refused';

/** Whether a canvas of `side` × `side` holds what is drawn on it; the canvas is given back at once. */
export function canvasAnswer(side: number): CanvasAnswer {
  let canvas: OffscreenCanvas;
  try {
    canvas = new OffscreenCanvas(side, side);
  } catch {
    return 'refused';
  }
  try {
    return holdsPixels(canvas) ? 'draws' : 'blank';
  } catch {
    return 'refused';
  } finally {
    releaseCanvas(canvas);
  }
}

/** The sides asked without being asked for: a larger canvas takes a gigabyte where it draws, so it waits for the memory test. */
export const CANVAS_QUICK_SIDES: readonly number[] = [4096, 8192];
export const CANVAS_HEAVY_SIDE = 16384;

/** `answers` by side; a side without an answer was not tried. */
export function canvasSection(answers: ReadonlyMap<number, CanvasAnswer>): ReportSection {
  return section('Canvas', [...CANVAS_QUICK_SIDES, CANVAS_HEAVY_SIDE].map((side): ReportRow => [
    `${side} × ${side}`,
    answers.get(side) ?? 'not tried: part of the memory test',
  ]));
}

/** How pictures are encoded here, and whether the image workers run. */
export interface ImageFacts {
  /** What a canvas of this thread makes of a request for WebP. */
  mainThread: DerivedFormat | 'failed';
  /** The image workers' first job: how long it took with the worker's start, and what it encoded. */
  worker: { ms: number; type: string } | { failed: string };
  /** A second job, on the worker that is running by then. */
  warmMs: number | null;
}

export function imagesSection(facts: ImageFacts): ReportSection {
  const { worker } = facts;
  return section('Images', [
    ['Derived pictures on this thread', facts.mainThread === 'failed' ? 'cannot be encoded' : facts.mainThread.toUpperCase()],
    ['Image worker', 'failed' in worker ? `did not answer: ${worker.failed}` : `first job ${Math.round(worker.ms)} ms, encoded ${worker.type}`],
    ['Image worker, second job', facts.warmMs === null ? 'not run' : `${Math.round(facts.warmMs)} ms`],
  ]);
}

const WEBGL_EXTENSIONS = ['EXT_color_buffer_float', 'EXT_color_buffer_half_float', 'OES_texture_float_linear', 'EXT_float_blend', 'EXT_disjoint_timer_query_webgl2'] as const;

function rendererName(gl: WebGL2RenderingContext): string {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name: unknown = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  return typeof name === 'string' && name ? name : 'not reported';
}

/**
 * What the lighting engine needs of WebGL 2, asked of a context of `canvas` that is lost again
 * afterwards: its limits, its extensions, whether every target format the engine renders into is
 * complete, and whether the engine's shaders link.
 */
export function webglSection(canvas: HTMLCanvasElement): ReportSection {
  const gl = canvas.getContext('webgl2');
  if (!gl) return section('WebGL 2', [['Context', 'none']]);
  try {
    const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)?.precision;
    const missing = WEBGL_EXTENSIONS.filter((name) => gl.getExtension(name) === null);
    const targets = unrenderableEngineTargets(gl);
    const shaders = failedEngineShaders(gl);
    return section('WebGL 2', [
      ['Renderer', rendererName(gl)],
      ['MAX_TEXTURE_SIZE', String(gl.getParameter(gl.MAX_TEXTURE_SIZE))],
      ['MAX_RENDERBUFFER_SIZE', String(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE))],
      ['MAX_SAMPLES', String(gl.getParameter(gl.MAX_SAMPLES))],
      ['Fragment highp precision bits', precision === undefined ? 'not reported' : String(precision)],
      ['Extensions missing', missing.join(', ') || 'none'],
      ['Lighting targets that cannot be rendered into', targets.join(', ') || 'none'],
      ['Lighting shaders that do not link', shaders.map(({ name }) => name).join(', ') || 'none'],
      ['Context lost while asked', yesNo(gl.isContextLost())],
    ]);
  } catch (error) {
    return section('WebGL 2', [['Context', `failed while asked: ${error instanceof Error ? error.name : 'unknown error'}`]]);
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
