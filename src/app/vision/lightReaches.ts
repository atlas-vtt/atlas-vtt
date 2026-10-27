import type { WallSegment } from '../types/wallTypes';
import { areaLightReach, kindOf, lightReach, type LightReach } from './sight';
import { sameCone } from './visionCone';
import type { AreaSampling } from './areaReach';
import { reflectionParts, type ReflectionSampling } from './reflectedLight';
import type { EngineLight } from '../pixi/lighting/engine/types';

interface Entry {
  x: number;
  y: number;
  dim: number;
  surface: EngineLight['surface'];
  walls: readonly WallSegment[];
  reach: LightReach;
  /** It was worked out with its reflection. */
  reflected: boolean;
}

/** How the outline of an area light is sampled when no map says more: a quarter of a 70 px cell apart, clear of 3 px capsules. */
const DEFAULT_SAMPLING: AreaSampling = { spacing: 17.5, clearance: 3 };

/**
 * Where each light reaches, for deciding on the CPU how well a point is lit. A light's polygon
 * is recomputed only when it moved, its reach changed or the walls changed, so dragging a token
 * does not retrace every light, and again when its cone turned or an area light's area changed.
 * A new bright radius, kind or priority keeps the polygon, which they do not shape; the
 * reflection is worked out again from it, since how far and how strongly the lit floor reflects
 * follows the bright radius. A moving light (`LightMotion`) keeps its reflection: it is traced
 * anew at every step, as its reach is.
 */
export class LightReaches {
  private entries = new Map<string, Entry>();
  private sampling: AreaSampling = DEFAULT_SAMPLING;
  private reflection: ReflectionSampling | null = null;

  /**
   * `sampling` says how area lights' outlines are traced (`areaSamples`), `reflection` how the
   * lights' reflections are (`reflectionParts`; without it they have none); another one retraces
   * them.
   */
  sync(lights: readonly EngineLight[], walls: readonly WallSegment[], sampling: AreaSampling = DEFAULT_SAMPLING, reflection: ReflectionSampling | null = null): LightReach[] {
    const resampled = sampling.spacing !== this.sampling.spacing || sampling.clearance !== this.sampling.clearance;
    const reflectionChanged = !sameReflection(reflection, this.reflection);
    this.sampling = sampling;
    this.reflection = reflection;
    const next = new Map<string, Entry>();
    for (const light of lights) {
      const { key, x, y, bright, dim, surface } = light;
      const cached = this.entries.get(key);
      // A darkness gives nothing back.
      const reflects = !!this.reflection && !light.darkness;
      const traced = cached && cached.walls === walls && cached.x === x && cached.y === y && cached.dim === dim && sameCone(cached.reach.cone, light.cone)
        && cached.surface === surface && !(surface && resampled) && !reflectionChanged;
      if (!traced) next.set(key, { x, y, dim, surface, walls, reach: this.trace(light, walls, reflects), reflected: reflects });
      else if (cached.reach.bright === bright && sameKind(cached.reach, light) && cached.reflected === reflects) next.set(key, cached);
      else {
        const { origin, polygon, parts } = cached.reach;
        const kept: LightReach = { origin, dim, polygon, ...(parts && { parts }), bright, ...kindOf(light) };
        next.set(key, { ...cached, reach: reflects ? { ...kept, reflection: reflectionParts(kept, walls, this.reflection!) } : kept, reflected: reflects });
      }
    }
    this.entries = next;
    return [...next.values()].map((entry) => entry.reach);
  }

  private trace(light: EngineLight, walls: readonly WallSegment[], reflects: boolean): LightReach {
    const { x, y, bright, dim, surface } = light;
    const reach = surface ? areaLightReach({ x, y }, surface, dim, walls, this.sampling, bright, light) : lightReach({ x, y }, dim, walls, bright, light);
    return reflects ? { ...reach, reflection: reflectionParts(reach, walls, this.reflection!) } : reach;
  }
}

function sameReflection(a: ReflectionSampling | null, b: ReflectionSampling | null): boolean {
  return a === b || (!!a && !!b && a.spacing === b.spacing && a.clearance === b.clearance && a.reach === b.reach);
}

function sameKind(reach: LightReach, light: EngineLight): boolean {
  return !!reach.darkness === !!light.darkness && (reach.priority ?? 0) === (light.priority ?? 0);
}
