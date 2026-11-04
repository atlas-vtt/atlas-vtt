import type { EngineLight } from '../../src/app/pixi/lighting/engine/types';
import type { LightReach } from '../../src/app/vision/sight';

/**
 * `now`'s lights as the scene model handed them on before every light came with the rule's reach
 * (`EngineLight.area`, an area light's `parts`; earlier only in a scene with a darkness): those
 * fields are taken off where `before`'s light has none, but only where they are that light's own
 * reach (`reaches`, in the lights' order), so a light handed the wrong polygon still differs.
 */
export function lightsAsBefore(now: readonly EngineLight[], reaches: readonly LightReach[], before: readonly EngineLight[]): EngineLight[] {
  return now.map((light, i) => {
    const reach = reaches[i];
    const earlier = before[i];
    if (!reach || !earlier || 'area' in earlier || light.area !== reach.polygon || light.parts !== reach.parts) return light;
    const { area: _area, parts: _parts, ...rest } = light;
    return rest;
  });
}

/** The index of each light's area among `reaches`, as before (-1 where the earlier light had none and it is its own reach's). */
export function areaPlacesAsBefore(now: readonly number[], before: readonly number[]): number[] {
  return now.map((place, i) => (before[i] === -1 && place === i ? -1 : place));
}
