import { describe, expect, it } from 'vitest';
import { dungeonParams, floorParams } from '../../../src/app/dungeons/params';

const base = dungeonParams(['colonnades']);
const mirrored = (params: typeof base): number => params.symmetry.filter(Boolean).length;

describe('floorParams', () => {
  it('roughens each floor further down a Cavern: less symmetry, fewer round and colonnaded rooms, more steps', () => {
    const deep = floorParams(base, 3, 'down');
    expect(mirrored(deep)).toBeLessThan(mirrored(base));
    expect(deep.rotundaFactor).toBeLessThan(base.rotundaFactor);
    expect(deep.colonnadeFactor).toBeLessThan(base.colonnadeFactor);
    expect(deep.stepsChance).toBeGreaterThan(base.stepsChance);
  });

  it('builds every storey of a rising building as the entrance floor is built: its symmetry, round rooms, colonnades and steps', () => {
    for (const floor of [1, 2, 3]) {
      const up = floorParams(base, floor, 'up');
      expect(up.symmetry).toEqual(base.symmetry);
      expect(up.rotundaFactor).toBe(base.rotundaFactor);
      expect(up.colonnadeFactor).toBe(base.colonnadeFactor);
      expect(up.stepsChance).toBe(base.stepsChance);
    }
  });

  it('makes later floors smaller whichever way they stack', () => {
    for (const rise of ['up', 'down'] as const) {
      const later = floorParams(base, 2, rise);
      expect(later.maxRooms).toBeLessThan(base.maxRooms);
      expect(later.minRooms).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves the entrance floor as the tags made it', () => {
    expect(floorParams(base, 0, 'up')).toBe(base);
    expect(floorParams(base, 0, 'down')).toBe(base);
  });
});
