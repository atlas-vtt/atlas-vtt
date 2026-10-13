import type { WallSegment } from '../types/wallTypes';
import { kindOf, lightReach, type LightReach } from './sight';
import { sameCone } from './visionCone';
import type { EngineLight } from '../pixi/lighting/engine/types';

interface Entry {
  x: number;
  y: number;
  dim: number;
  walls: readonly WallSegment[];
  reach: LightReach;
}

/**
 * Where each light reaches, for deciding on the CPU how well a point is lit. A light's polygon
 * is recomputed only when it moved, its reach changed or the walls changed, so dragging a token
 * does not retrace every light, and again when its cone turned. A new bright radius, kind or priority keeps the polygon, which they do not shape.
 */
export class LightReaches {
  private entries = new Map<string, Entry>();

  sync(lights: readonly EngineLight[], walls: readonly WallSegment[]): LightReach[] {
    const next = new Map<string, Entry>();
    for (const light of lights) {
      const { key, x, y, bright, dim } = light;
      const cached = this.entries.get(key);
      const traced = cached && cached.walls === walls && cached.x === x && cached.y === y && cached.dim === dim && sameCone(cached.reach.cone, light.cone);
      if (!traced) next.set(key, { x, y, dim, walls, reach: lightReach({ x, y }, dim, walls, bright, light) });
      else if (cached.reach.bright === bright && sameKind(cached.reach, light)) next.set(key, cached);
      else next.set(key, { ...cached, reach: { origin: cached.reach.origin, dim, polygon: cached.reach.polygon, bright, ...kindOf(light) } });
    }
    this.entries = next;
    return [...next.values()].map((entry) => entry.reach);
  }
}

function sameKind(reach: LightReach, light: EngineLight): boolean {
  return !!reach.darkness === !!light.darkness && (reach.priority ?? 0) === (light.priority ?? 0);
}
