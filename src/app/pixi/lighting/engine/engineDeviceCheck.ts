import type { Renderer } from 'pixi.js';
import type { PictureChoice } from '../../../lighting/graphicsSettings';
import { contextLost, glOf } from './gpu';
import { shadersOfPicture } from './engineShaders';
import { describeShaderFailures, shaderLinkFailures, startShaderLinks, type ShaderLinks } from './shaderCheck';
import { unrenderableEngineTargets } from './targetCheck';

/**
 * Whether a context can run the engine's picture: WebGL, its shaders link, and it renders into the
 * engine's texture formats. Asked once per picture and context; the traced picture's shaders are all of them.
 */
export class EngineDeviceCheck {
  /** The picture whose shaders link on the current context. */
  private verified: PictureChoice | null = null;
  /** The shaders of a picture handed to the driver ahead (`prepare`), asked about by `check`. */
  private links: { picture: PictureChoice; started: ShaderLinks } | null = null;

  constructor(private readonly renderer: Renderer) {}

  /**
   * Hands the driver the shaders `check` asks about to compile and link now, so the browser's graphics
   * process works on them meanwhile. Nothing where they were asked about on this context already.
   */
  prepare(picture: PictureChoice): void {
    if (this.links || this.verified === 'traced' || this.verified === picture || contextLost(this.renderer)) return;
    const gl = glOf(this.renderer);
    if (gl) this.links = { picture, started: startShaderLinks(gl, shadersOfPicture(picture)) };
  }

  /**
   * `ready`, or `wait` while the context was lost meanwhile (the logs then say nothing about the
   * device), or `failed` for good. Another renderer than WebGL (PIXI's Canvas or WebGPU renderer,
   * which a browser without WebGL gets) has no pipe for the engine's meshes: it fails.
   */
  check(picture: PictureChoice): 'ready' | 'wait' | 'failed' {
    if (this.verified === 'traced' || this.verified === picture) return 'ready';
    const gl = glOf(this.renderer);
    if (!gl) {
      console.error(`Atlas: dynamic lighting needs WebGL, and this view draws with PIXI's ${this.renderer.name} renderer`);
      return 'failed';
    }
    const links = this.links?.picture === picture && this.links.started.gl === gl ? this.links.started : startShaderLinks(gl, shadersOfPicture(picture));
    if (this.links && this.links.started !== links) shaderLinkFailures(this.links.started);
    this.links = null;
    const failures = shaderLinkFailures(links);
    const unrenderable = unrenderableEngineTargets(gl);
    if (contextLost(this.renderer)) return 'wait';
    if (failures.length > 0) {
      console.error(`Atlas: dynamic lighting cannot run on this graphics device. These shaders did not compile:\n${describeShaderFailures(failures)}`);
      return 'failed';
    }
    if (unrenderable.length > 0) {
      console.error(`Atlas: dynamic lighting cannot run on this graphics device. It cannot render into these texture formats: ${unrenderable.join(', ')}`);
      return 'failed';
    }
    this.verified = picture;
    return 'ready';
  }

  /** A restored context: nothing is known of it, and the shaders handed to the lost one are gone. */
  forget(): void {
    this.verified = null;
    this.links = null;
  }

  /** Collects the shaders still handed to the driver. */
  release(): void {
    if (this.links && !contextLost(this.renderer)) shaderLinkFailures(this.links.started);
    this.links = null;
  }
}
