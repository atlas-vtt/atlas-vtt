import { defaultFilterVert } from 'pixi.js';
import { FULLSCREEN_VERTEX } from './glsl';
import { capsuleFieldFragment, capsuleFieldVertex } from './capsuleFieldShader';
import { cascadeFragment, cascadeVertex, emissionFragment, resolveFragment } from './cascadeShaders';
import { compositeFragment } from './compositeShader';
import { compositeUpscaleFragment } from './compositeUpscaleShader';
import { darknessFragment, darknessVertex, pierceFragment, pierceVertex } from './darknessShader';
import { lightMapFragment, lightMapVertex } from './lightMapShader';
import { limitedFragment, limitedVertex } from './limitedShader';
import { sightFragment, sightVertex } from './sightShader';
import { tileFragment, tileVertex } from './tileShader';
import { tileSmoothFragment } from './tileSmoothShader';
import { areaBlurFragment, areaDistanceFragment, areaTileFragment } from './areaTileShader';
import { zoneFragment } from './zoneShader';
import { roofFragment } from './roofShader';
import { reflectionBlurFragment, reflectionFragment, reflectionVertex } from './reflectionShader';

export interface EngineShaderSource {
  readonly name: string;
  readonly vertex: string;
  readonly fragment: string;
}

/**
 * Every program the lighting engine draws with. Passes create their shaders from these entries
 * (`createShader`), so the rules the unit tests hold the sources to, and the check that they
 * compile on the device (`verifyEngineShaders`), cover all of them.
 */
export const ENGINE_SHADERS = {
  capsuleField: { name: 'atlas-capsule-field', vertex: capsuleFieldVertex, fragment: capsuleFieldFragment },
  tile: { name: 'atlas-visibility-tile', vertex: tileVertex, fragment: tileFragment },
  tileSmooth: { name: 'atlas-visibility-tile-smooth', vertex: tileVertex, fragment: tileSmoothFragment },
  areaDistance: { name: 'atlas-area-light-distance', vertex: tileVertex, fragment: areaDistanceFragment },
  areaTile: { name: 'atlas-area-light-tile', vertex: tileVertex, fragment: areaTileFragment },
  areaBlur: { name: 'atlas-area-light-blur', vertex: tileVertex, fragment: areaBlurFragment },
  tileLimited: { name: 'atlas-visibility-tile-limited', vertex: limitedVertex, fragment: limitedFragment },
  reflection: { name: 'atlas-reflected-light', vertex: reflectionVertex, fragment: reflectionFragment },
  reflectionBlur: { name: 'atlas-reflected-light-blur', vertex: FULLSCREEN_VERTEX, fragment: reflectionBlurFragment },
  lightMap: { name: 'atlas-light-map', vertex: lightMapVertex, fragment: lightMapFragment },
  darkness: { name: 'atlas-darkness', vertex: darknessVertex, fragment: darknessFragment },
  pierce: { name: 'atlas-darkness-pierce', vertex: pierceVertex, fragment: pierceFragment },
  zone: { name: 'atlas-ambient-zone', vertex: lightMapVertex, fragment: zoneFragment },
  bounceEmission: { name: 'atlas-bounce-emission', vertex: cascadeVertex, fragment: emissionFragment },
  bounceCascade: { name: 'atlas-bounce-cascade', vertex: cascadeVertex, fragment: cascadeFragment },
  bounceResolve: { name: 'atlas-bounce-resolve', vertex: cascadeVertex, fragment: resolveFragment },
  sight: { name: 'atlas-sight', vertex: sightVertex, fragment: sightFragment },
  composite: { name: 'atlas-lighting-composite', vertex: defaultFilterVert, fragment: compositeFragment },
  compositeUpscale: { name: 'atlas-lighting-composite-upscale', vertex: defaultFilterVert, fragment: compositeUpscaleFragment },
  roof: { name: 'atlas-roof', vertex: defaultFilterVert, fragment: roofFragment },
} as const satisfies Record<string, EngineShaderSource>;
