// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { GlProgram, Shader } from 'pixi.js';
import { LaserBeam } from '../../src/app/pixi/laser/LaserBeam';

function glProgramOf(beam: LaserBeam): GlProgram {
  return (beam as unknown as { shader: { shader: Shader } }).shader.shader.glProgram;
}

describe('LaserBeam GL program', () => {
  it('keeps the shared program usable for beams created after one is destroyed', () => {
    // PIXI probes a WebGL context for shader precision; jsdom has none
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    // Every map view creates a beam; closing a view destroys its beam
    const first = new LaserBeam();
    first.view.destroy({ children: true });
    first.destroy();

    const second = new LaserBeam();
    const program = glProgramOf(second);

    // A destroyed program has null sources, which the GPU compiles as "null": a syntax error
    expect(program.fragment).toEqual(expect.stringContaining('uLaserColor'));
    expect(program.vertex).toEqual(expect.stringContaining('aSegment'));
  });
});
