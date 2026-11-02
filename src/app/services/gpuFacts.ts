import type { GpuFacts } from '../lighting/deviceTier';

/** What `navigator` adds in Chromium beyond the DOM's types. */
interface ChromiumNavigator {
  hardwareConcurrency?: number;
  deviceMemory?: number;
}

/**
 * What this device tells about its graphics, from a WebGL 2 context made for the purpose and
 * given back at once: its renderer string and largest texture. Null where WebGL 2 is missing,
 * where no lighting runs either.
 */
export function readGpuFacts(): GpuFacts | null {
  if (typeof OffscreenCanvas === 'undefined') return null;
  try {
    const gl = new OffscreenCanvas(1, 1).getContext('webgl2');
    if (!gl) return null;
    try {
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer: unknown = gl.getParameter(debug ? debug.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
      const maxTextureSize: unknown = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (typeof maxTextureSize !== 'number') return null;
      const nav = (typeof navigator === 'undefined' ? {} : navigator) as ChromiumNavigator;
      return {
        renderer: typeof renderer === 'string' ? renderer : '',
        maxTextureSize,
        cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
        memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
      };
    } finally {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (error) {
    console.error('[Atlas] Could not read what this device\'s graphics can do', error);
    return null;
  }
}
