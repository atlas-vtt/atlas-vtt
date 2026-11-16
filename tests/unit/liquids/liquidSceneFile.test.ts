import { describe, expect, it } from 'vitest';
import { mapSceneFile } from '../../../src/app/import/writeMapScene';
import type { LiquidSurface } from '../../../src/app/types/liquidTypes';

describe('liquid surfaces in a scene Atlas makes', () => {
  it('are written into a new scene by the map scene writer', () => {
    const liquids = { lake: { id: 'lake', kind: 'liquid', liquid: 'water', polygon: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 0, y: 70 }], colors: { surface: '#336699', deep: '#112233', glint: '#ffffff' } } satisfies LiquidSurface };
    const file = mapSceneFile({ conditions: [] }, 'maps/lake.webp', { grid: { size: 70, offsetX: 0, offsetY: 0 }, walls: {}, lights: {}, lighting: { enabled: false, ambient: 1 }, liquids });
    expect(file.state.objects.liquids).toEqual(liquids);
  });
});
