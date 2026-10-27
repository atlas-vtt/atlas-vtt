import { describe, expect, it } from 'vitest';
import { pickLightingQuality, type GpuFacts } from '../../src/app/lighting/deviceTier';

const strong: GpuFacts = { renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)', maxTextureSize: 16384, cores: 16, memoryGb: 8 };

describe('the lighting quality a device starts on', () => {
  it.each([
    ['a discrete NVIDIA card', strong.renderer, 'high'],
    ['an Apple M chip', 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)', 'high'],
    ['an AMD RX card', 'ANGLE (AMD, AMD Radeon RX 6800 XT (0x000073BF) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['an Intel Arc card', 'ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics (0x000056A0) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'high'],
    ['Intel UHD graphics', 'ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'balanced'],
    ['Intel Iris graphics on a Mac', 'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)', 'balanced'],
    ['an AMD APU', 'ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'balanced'],
    ['AMD Vega graphics', 'ANGLE (AMD, AMD Radeon Vega 8 Graphics (0x000015D8) Direct3D11 vs_5_0 ps_5_0, D3D11)', 'balanced'],
    ['SwiftShader', 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)', 'saver'],
    ['llvmpipe', 'llvmpipe (LLVM 15.0.7, 256 bits)', 'saver'],
    ['Windows\' basic display driver', 'ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11 vs_5_0 ps_5_0, D3D11)', 'saver'],
  ] as const)('%s', (_name, renderer, level) => {
    expect(pickLightingQuality({ ...strong, renderer })).toBe(level);
  });

  it('follows the largest texture the GPU takes, as Foundry does', () => {
    expect(pickLightingQuality({ ...strong, maxTextureSize: 4096 })).toBe('saver');
    expect(pickLightingQuality({ ...strong, maxTextureSize: 8192 })).toBe('balanced');
    expect(pickLightingQuality({ ...strong, maxTextureSize: 32768 })).toBe('high');
  });

  it('takes a few processor threads or little memory as a weaker machine', () => {
    expect(pickLightingQuality({ ...strong, cores: 4 })).toBe('balanced');
    expect(pickLightingQuality({ ...strong, memoryGb: 4 })).toBe('balanced');
    expect(pickLightingQuality({ ...strong, cores: null, memoryGb: null })).toBe('high');
  });

  it('never raises a level another fact lowered', () => {
    expect(pickLightingQuality({ ...strong, renderer: 'llvmpipe', cores: 32 })).toBe('saver');
  });
});
