import { describe, expect, it } from 'vitest';
import { DEFAULT_FOG_EDGE, MAX_FOG_EDGE_WIDTH, readFogEdge, sameFogEdge } from '../../src/app/fog/fogEdge';
import { DEFAULT_SETTINGS, readStoredSettings } from '../../src/app/services/atlasSettings';
import { crackleCells } from '../../src/app/pixi/fog/fogEdgeMesh';

describe('the fog edge setting', () => {
  it('reads what Atlas can use', () => {
    expect(readFogEdge({ style: 'crackle', width: 30 })).toEqual({ style: 'crackle', width: 30 });
    expect(readFogEdge({ style: 'soft', width: MAX_FOG_EDGE_WIDTH })).toEqual({ style: 'soft', width: MAX_FOG_EDGE_WIDTH });
    expect(readFogEdge({ style: 'soft', width: 0 })).toEqual({ style: 'soft', width: 0 });
    expect(readFogEdge({ width: 30 })).toEqual({ style: 'crackle', width: 30 });
  });

  it('reads anything else as the default: crackled, 15 map pixels', () => {
    expect(DEFAULT_FOG_EDGE).toEqual({ style: 'crackle', width: 15 });
    for (const stored of [undefined, null, 'soft', 3, {}, { width: -1 }, { width: MAX_FOG_EDGE_WIDTH + 1 }, { width: '30' }, { width: Number.NaN }]) {
      expect(readFogEdge(stored).width).toBe(15);
    }
    expect(readFogEdge({ style: 'lava', width: 30 }).style).toBe('crackle');
  });

  it('is the default of settings that never stored one, as every GM\'s from before fog edges', () => {
    expect(DEFAULT_SETTINGS.fogEdge).toEqual({ style: 'crackle', width: 15 });
    expect(readStoredSettings({ fogFill: 'black' }, 'mouse').settings.fogEdge).toEqual({ style: 'crackle', width: 15 });
    expect(readStoredSettings({ fogEdge: { style: 'soft', width: 0 } }, 'mouse').settings.fogEdge).toEqual({ style: 'soft', width: 0 });
  });

  it('tells edges apart by what they draw', () => {
    expect(sameFogEdge({ style: 'soft', width: 30 }, { style: 'soft', width: 30 })).toBe(true);
    expect(sameFogEdge({ style: 'soft', width: 30 }, { style: 'soft', width: 31 })).toBe(false);
    expect(sameFogEdge({ style: 'soft', width: 30 }, { style: 'crackle', width: 30 })).toBe(false);
  });

  it('grows the cracks with the edge, down to the least they have', () => {
    expect(crackleCells(0)).toEqual([16, 5, 2]);
    expect(crackleCells(100)[0]).toBeCloseTo(110);
    expect(crackleCells(100)[2]).toBeCloseTo(12);
  });
});
