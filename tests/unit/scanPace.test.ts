import { describe, expect, it } from 'vitest';
import { isSoftwareRenderer, ScanPace } from '../../src/app/pixi/gridAlignment/scanPace';

/** Feeds `pace` frames of `milliseconds` each, as one scan draws them. */
function scan(pace: ScanPace, milliseconds: number, frames = 60): void {
  pace.begin();
  for (let i = 0; i < frames; i++) pace.frame(milliseconds);
}

describe('ScanPace', () => {
  it('keeps the scan at full pixels on a device that keeps up, at 60 and at 120 frames a second', () => {
    const pace = new ScanPace();
    scan(pace, 16.7, 600);
    scan(pace, 8.3, 600);
    expect(pace.quality).toBe('full');
  });

  it('steps down to half the pixels where frames come slowly, and to nothing where they still do', () => {
    const pace = new ScanPace();
    scan(pace, 33.3);
    expect(pace.quality).toBe('half');
    // Half the pixels were enough: it stays there, in later scans too.
    scan(pace, 20, 600);
    expect(pace.quality).toBe('half');

    scan(pace, 55);
    expect(pace.quality).toBe('none');
    scan(pace, 16.7, 600);
    expect(pace.quality).toBe('none');
  });

  it('does not count what is no frame of the scan: its first frames, and a window that was hidden or busy loading', () => {
    const pace = new ScanPace();
    pace.begin();
    // The first frames carry what a scan sets up.
    for (let i = 0; i < 8; i++) pace.frame(120);
    for (let i = 0; i < 40; i++) pace.frame(i % 5 === 0 ? 900 : 16.7);
    expect(pace.quality).toBe('full');
  });

  it('says a step down only in the frame that made it', () => {
    const pace = new ScanPace();
    pace.begin();
    const steps = Array.from({ length: 60 }, () => pace.frame(40)).filter(Boolean);
    expect(steps).toHaveLength(1);
  });
});

describe('isSoftwareRenderer', () => {
  const glNamed = (name: string | null): WebGLRenderingContext => ({
    getExtension: () => (name === null ? null : { UNMASKED_RENDERER_WEBGL: 1 }),
    getParameter: () => name,
  }) as unknown as WebGLRenderingContext;

  it('knows the renderers that draw on the processor', () => {
    expect(isSoftwareRenderer(glNamed('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))).toBe(true);
    expect(isSoftwareRenderer(glNamed('llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(true);
    expect(isSoftwareRenderer(glNamed('Microsoft Basic Render Driver'))).toBe(true);
  });

  it('takes a graphics card for one, and a renderer that will not say its name too', () => {
    expect(isSoftwareRenderer(glNamed('ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0, D3D11)'))).toBe(false);
    expect(isSoftwareRenderer(glNamed('ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Pro, Unspecified Version)'))).toBe(false);
    expect(isSoftwareRenderer(glNamed(null))).toBe(false);
  });
});
