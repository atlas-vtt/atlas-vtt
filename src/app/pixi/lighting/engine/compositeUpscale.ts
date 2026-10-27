import { Filter, Texture, TexturePool, UniformGroup, type FilterSystem, type FilterWithShader, type RenderSurface } from 'pixi.js';
import { AreaAwareFilter } from './areaAwareFilter';
import { ENGINE_SHADERS } from './engineShaders';
import { engineProgram } from './gpu';

/**
 * Device pixels per screen pixel the composite is worked out at for a render at `resolution`
 * when it may take at most `max` (`LightingQuality.compositePixelRatio`); null: the render's own.
 */
export function reducedPixelRatio(max: number | undefined, resolution: number): number | null {
  return max !== undefined && max > 0 && max < resolution - 1e-3 ? max : null;
}

/**
 * The composite as a filter that may work on fewer pixels than the render has (`maxPixelRatio`):
 * then it draws into a texture of that many pixels, writing in alpha how much each one shows
 * (`SHOWN_GLSL`), and a second pass draws that up to the render's pixels with darkness winning
 * at every edge (`compositeUpscaleFragment`). Thumbnails and every render at or below the ratio
 * are drawn in one pass as before.
 */
export class CompositeUpscale extends AreaAwareFilter {
  /** At most this many device pixels per screen pixel; unset, the render's own. */
  maxPixelRatio: number | undefined;
  private readonly upscaleUniforms = new UniformGroup({
    uReducedRatio: { value: 1, type: 'f32' },
    uReducedLast: { value: new Float32Array(2), type: 'vec2<f32>' },
  });
  private readonly upscale = new Filter({
    glProgram: engineProgram(ENGINE_SHADERS.compositeUpscale),
    resources: { upscaleUniforms: this.upscaleUniforms, uReduced: Texture.EMPTY.source },
  });

  /**
   * `shownOut` tells the composite how many of the render's pixels across one of its own covers
   * while it works on fewer (it then writes how much each pixel shows into alpha), 0 otherwise.
   */
  constructor(options: FilterWithShader, origin: Float32Array, group: UniformGroup, private readonly shownOut: (footprint: number) => void) {
    super(options, origin, group);
  }

  override apply(filterManager: FilterSystem, input: Texture, output: RenderSurface, clearMode: boolean): void {
    const ratio = reducedPixelRatio(this.maxPixelRatio, input.source.resolution);
    if (ratio === null) {
      this.shownOut(0);
      super.apply(filterManager, input, output, clearMode);
      return;
    }
    const { width, height } = input.frame;
    const reduced = TexturePool.getOptimalTexture({ width, height, resolution: ratio, antialias: false, scaleMode: 'nearest' });
    try {
      this.shownOut(input.source.resolution / ratio);
      super.apply(filterManager, input, reduced, true);
      const { uniforms } = this.upscaleUniforms;
      uniforms.uReducedRatio = ratio;
      uniforms.uReducedLast[0] = Math.max(0, Math.ceil(width * ratio) - 1);
      uniforms.uReducedLast[1] = Math.max(0, Math.ceil(height * ratio) - 1);
      this.upscaleUniforms.update();
      this.upscale.resources.uReduced = reduced.source;
      filterManager.applyFilter(this.upscale, input, output, clearMode);
    } finally {
      // The pool keeps the texture; the upscale lets go of it, so it never holds one the pool destroys.
      this.upscale.resources.uReduced = Texture.EMPTY.source;
      TexturePool.returnTexture(reduced);
    }
  }

  override destroy(destroyPrograms = false): void {
    this.upscale.destroy(destroyPrograms);
    super.destroy(destroyPrograms);
  }
}
