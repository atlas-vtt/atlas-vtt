import type { FogRectangleFill } from '../../src/app/types/fogTypes';

export function fogRectangle(changes: Partial<FogRectangleFill> = {}): FogRectangleFill {
  return { id: 'paint', kind: 'fog', type: 'rectangle', timestamp: 1, isErasing: false,
    x: 0, y: 0, width: 20, height: 20, ...changes };
}
