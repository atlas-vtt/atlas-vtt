// @vitest-environment jsdom
import type { Renderer } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EngineDeviceCheck } from '../engineDeviceCheck';
import { ENGINE_SHADERS } from '../engineShaders';
import { engineProgram } from '../gpu';

const GL = {
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  LINK_STATUS: 0x8b82,
  TEXTURE_2D: 0x0de1,
  TEXTURE_BINDING_2D: 0x8069,
  DRAW_FRAMEBUFFER: 0x8ca9,
  DRAW_FRAMEBUFFER_BINDING: 0x8ca6,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  FRAMEBUFFER_INCOMPLETE_ATTACHMENT: 0x8cd6,
  RGBA16F: 0x881a,
  R16F: 0x822d,
  RG16F: 0x822f,
  R8: 0x8229,
  RG8: 0x822b,
  RGBA8: 0x8058,
};

interface FakeShader { type: number; source: string }
interface FakeProgram { shaders: FakeShader[] }

interface Device {
  /**
   * When the graphics process dies: from then on the context answers as Chromium's did in the task
   * in which that process was killed while a page linked shaders. It does not say it is lost yet,
   * every link fails with empty logs, and no framebuffer is complete.
   */
  dies?: 'before-links' | 'after-links';
  /** Fragment sources a live driver does not link; it logs why. */
  rejects?: (fragment: string) => boolean;
  /** A live device that cannot render into the engine's formats. */
  incompleteTargets?: boolean;
}

/** The device check over the WebGL 2 calls it makes, answered as `device` would. */
function deviceCheck({ dies, rejects = () => false, incompleteTargets = false }: Device = {}): EngineDeviceCheck {
  let dead = dies === 'before-links';
  const rejected = (shader: FakeShader): boolean => shader.type === GL.FRAGMENT_SHADER && rejects(shader.source);
  const gl = {
    ...GL,
    isContextLost: () => false,
    getExtension: () => ({}),
    getParameter: () => null,
    createShader: (type: number): FakeShader => ({ type, source: '' }),
    shaderSource: (shader: FakeShader, source: string) => {
      shader.source = source;
    },
    compileShader: () => undefined,
    createProgram: (): FakeProgram => ({ shaders: [] }),
    attachShader: (program: FakeProgram, shader: FakeShader) => {
      program.shaders.push(shader);
    },
    linkProgram: () => undefined,
    getProgramParameter: (program: FakeProgram) => !dead && !program.shaders.some(rejected),
    getShaderInfoLog: (shader: FakeShader) => (!dead && rejected(shader) ? "ERROR: 0:12: 'nonsense' : undeclared identifier" : ''),
    getProgramInfoLog: () => '',
    deleteShader: () => undefined,
    deleteProgram: () => undefined,
    texStorage2D: () => undefined,
    createTexture: () => ({}),
    createFramebuffer: () => ({}),
    bindTexture: () => undefined,
    bindFramebuffer: () => undefined,
    framebufferTexture2D: () => undefined,
    checkFramebufferStatus: () => {
      if (dies === 'after-links') dead = true;
      if (dead) return 0;
      return incompleteTargets ? GL.FRAMEBUFFER_INCOMPLETE_ATTACHMENT : GL.FRAMEBUFFER_COMPLETE;
    },
    deleteTexture: () => undefined,
    deleteFramebuffer: () => undefined,
  };
  return new EngineDeviceCheck({ name: 'webgl', gl } as unknown as Renderer);
}

describe('EngineDeviceCheck', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['before-links', 'after-links'] as const)('waits when the graphics process died %s, instead of taking the device for one that cannot run the engine', (dies) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(deviceCheck({ dies }).check('traced')).toBe('wait');
    expect(deviceCheck({ dies }).check('polygons')).toBe('wait');
    expect(error).not.toHaveBeenCalled();
  });

  it('fails on a live device that does not link one of the shaders, naming it with the driver\'s log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lightMap = engineProgram(ENGINE_SHADERS.lightMap).fragment;

    expect(deviceCheck({ rejects: (fragment) => fragment === lightMap }).check('traced')).toBe('failed');
    expect(error).toHaveBeenCalledOnce();
    const message = String(error.mock.calls[0]![0]);
    expect(message).toContain(`${ENGINE_SHADERS.lightMap.name}: ERROR: 0:12: 'nonsense'`);
    expect(message).not.toContain(ENGINE_SHADERS.capsuleField.name);
  });

  it('fails on a live device that cannot render into the engine\'s formats', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(deviceCheck({ incompleteTargets: true }).check('traced')).toBe('failed');
    expect(String(error.mock.calls[0]![0])).toContain('rgba16float');
  });

  it('is ready on a live device that links every shader and renders into every format', () => {
    expect(deviceCheck().check('traced')).toBe('ready');
  });
});
