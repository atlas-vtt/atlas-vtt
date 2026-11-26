import type { TEXTURE_FORMATS } from 'pixi.js';

/**
 * Every texture format the engine renders into (`createTarget` takes no other): the light and
 * zone maps and the bounce (`rgba16float`), the wall fields (`r16float`), the area and reflection
 * pictures (`rg16float`), the tiles, the wall band and the darkness map (8 bit).
 */
export const ENGINE_TARGET_FORMATS = ['rgba16float', 'r16float', 'rg16float', 'r8unorm', 'rg8unorm', 'rgba8unorm'] as const satisfies readonly TEXTURE_FORMATS[];

export type EngineTargetFormat = (typeof ENGINE_TARGET_FORMATS)[number];

type Gl = WebGLRenderingContext | WebGL2RenderingContext;

/** WebGL 2's sized internal format of each target format. */
function internalFormat(gl: WebGL2RenderingContext, format: EngineTargetFormat): number {
  switch (format) {
    case 'rgba16float': return gl.RGBA16F;
    case 'r16float': return gl.R16F;
    case 'rg16float': return gl.RG16F;
    case 'r8unorm': return gl.R8;
    case 'rg8unorm': return gl.RG8;
    case 'rgba8unorm': return gl.RGBA8;
  }
}

const isWebGl2 = (gl: Gl): gl is WebGL2RenderingContext => 'texStorage2D' in gl && typeof gl.texStorage2D === 'function';

/** Whether a framebuffer with a 1 px texture of `format` as its colour is complete. */
function renders(gl: WebGL2RenderingContext, format: EngineTargetFormat): boolean {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    if (!texture || !framebuffer) return false;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internalFormat(gl, format), 1, 1);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    return gl.checkFramebufferStatus(gl.DRAW_FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } finally {
    if (framebuffer) gl.deleteFramebuffer(framebuffer);
    if (texture) gl.deleteTexture(texture);
  }
}

/**
 * The engine's target formats this device cannot render into. Linking shaders says nothing
 * about them: a GPU without renderable 16 bit float textures links every program and then draws
 * into incomplete framebuffers, an error on every pass. The context's bindings are left as they
 * were found, since PIXI remembers them. A WebGL 1 context is not asked: the engine was never
 * held to one.
 */
export function unrenderableEngineTargets(gl: Gl, formats: readonly EngineTargetFormat[] = ENGINE_TARGET_FORMATS): EngineTargetFormat[] {
  if (!isWebGl2(gl)) return [];
  // Rendering into float textures is an extension of WebGL 2; asking for one PIXI already has changes nothing.
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_color_buffer_half_float');
  const boundTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  const boundFramebuffer = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  try {
    return formats.filter((format) => !renders(gl, format));
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, boundTexture);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, boundFramebuffer);
  }
}
