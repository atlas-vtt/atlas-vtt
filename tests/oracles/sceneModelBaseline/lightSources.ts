// Frozen from c246011fe636672a3865b52bf6f43a9138355085 src/app/pixi/lighting/lightSources.ts. Only import paths are adapted.
// Reads colours through the installed pixi.js (8.21.0 when frozen): a PIXI release that changes Color changes this side, not the code under test.
import { lightList, readEmission } from '../../../src/app/lighting/lightingObjects';
import { Color } from 'pixi.js';
import type { TokenEntity } from '../../../src/app/types';
import type { LightEmission, LightSource } from '../../../src/app/types/lightingTypes';
import { isLightOn } from '../../../src/app/lighting/lightActivity';
import { beamOf } from '../../../src/app/lighting/lightBeam';
import { gameUnitsToWorld, type UnitScale } from '../../../src/app/lighting/lightingUnits';
import { MIN_SOFTNESS, TINT_TO_WHITE, softEdge } from '../../../src/app/lighting/lightingConstants';
import { srgbToLinear } from '../../../src/app/lighting/srgb';
import { kindOf } from '../../../src/app/vision/sight';
import { ambientAt } from '../../../src/app/vision/lightLevels';
import type { AmbientLight } from '../../../src/app/vision/sight';
import type { EngineLight } from '../../../src/app/pixi/lighting/engine/types';

/** A light that shines right now: placed on the map or carried by a token. */
export interface ActiveLight {
  /** `light:<id>` or `token:<id>`, stable while the light exists. */
  key: string;
  x: number;
  y: number;
  emission: LightEmission;
  /** Where a light that shines one way faces: the placed light's rotation, or that of the token carrying it. */
  rotation?: number;
}

/**
 * The lights that shine under `ambient` light: placed ones that are switched on and, where they
 * follow the ambient light, awake (`isLightOn`), and those tokens carry. Both the picture and
 * the rule are built from this list, so a sleeping lamp lights neither.
 */
export function activeLights(lights: Record<string, LightSource>, tokens: Record<string, TokenEntity>, ambient: number | AmbientLight = 0): ActiveLight[] {
  const active: ActiveLight[] = [];
  for (const light of lightList(lights)) {
    // The ambient light where the light stands: that of a zone around it, else the scene's.
    if (isLightOn(light, typeof ambient === 'number' ? ambient : ambientAt(light, ambient))) active.push({ key: `light:${light.id}`, x: light.x, y: light.y, emission: light.emission, ...turned(light.rotation) });
  }
  for (const token of Object.values(tokens)) {
    const carried = readEmission(token.light);
    if (carried) active.push({ key: `token:${token.id}`, x: token.x, y: token.y, emission: carried, ...turned(token.rotation) });
  }
  return active;
}

function turned(rotation: number | undefined): Pick<ActiveLight, 'rotation'> {
  return rotation === undefined ? {} : { rotation };
}

/**
 * A light in world pixels for the engine; its colour mixed towards white and linearised. A
 * light with an angle gets its cone (`beamOf`, facing as a token's sight does), with half a cell
 * around it lit all around: the space of whoever carries it.
 */
export function engineLight(light: ActiveLight, scale: UnitScale): EngineLight {
  const { emission } = light;
  const cone = beamOf(light, scale.cellSize / 2);
  // A darkness has one radius, its dim one: nothing in it is bright.
  const bright = emission.darkness ? 0 : gameUnitsToWorld(Math.max(0, emission.bright), scale);
  const dim = Math.max(bright, gameUnitsToWorld(Math.max(0, emission.dim), scale));
  return {
    key: light.key,
    x: light.x,
    y: light.y,
    bright,
    dim,
    // Every light casts soft edges, however small its flame is set: at least a share of its reach.
    flame: Math.max(gameUnitsToWorld(emission.sourceRadius ?? 1, scale), dim * MIN_SOFTNESS),
    color: tintedLinear(emission.color),
    intensity: emission.intensity,
    // Darkness does not flicker: its edge is where the rules end it.
    animation: emission.darkness ? 'none' : emission.animation,
    ...kindOf({ ...(emission.darkness && { darkness: true }), ...(emission.priority !== undefined && { priority: emission.priority }), ...(cone && { cone }) }),
    ...(cone && { edge: softEdge(dim, scale.cellSize) }),
  };
}

function tintedLinear(hex: string): [number, number, number] {
  const c = new Color(hex);
  const linear = (v: number): number => srgbToLinear(1 + (v - 1) * TINT_TO_WHITE);
  return [linear(c.red), linear(c.green), linear(c.blue)];
}
