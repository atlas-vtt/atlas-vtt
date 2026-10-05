import { getDomHost } from '../../host/dom';
/**
 * Whether a WebGL context can be created right now, asked of a canvas made for the question.
 * PIXI asks once per session and keeps the answer, so it goes on starting WebGL renderers
 * after the graphics process gave up or a driver reset left WebGL blocked.
 */
export function webglAvailable(): boolean {
  try {
    const canvas = getDomHost().createCanvas();
    const gl = canvas.getContext('webgl2', { stencil: true }) ?? canvas.getContext('webgl', { stencil: true });
    // Browsers keep only a few contexts alive: this one is given back at once.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
