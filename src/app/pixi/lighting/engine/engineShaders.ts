import { defaultFilterVert } from 'pixi.js';
import type { PictureChoice } from '../../../lighting/graphicsSettings';
import { FULLSCREEN_VERTEX } from './glsl';
import { capsuleFieldFragment, capsuleFieldVertex } from './capsuleFieldShader';
import { cascadeFragment, cascadeVertex, emissionFragment, resolveFragment } from './cascadeShaders';
import { compositeFragmentFor } from './compositeShader';
import { compositeUpscaleFragment } from './compositeUpscaleShader';
import { darknessFragment, darknessVertex, pierceFragment, pierceVertex } from './darknessShader';
import { lightMapFragment, lightMapVertex } from './lightMapShader';
import { limitedFragment, limitedVertex } from './limitedShader';
import { sightFragment, sightVertex } from './sightShader';
import { tileFragment, tileVertex } from './tileShader';
import { tileSmoothFragment } from './tileSmoothShader';
import { areaBlurFragment, areaDistanceFragment, areaTileFragment } from './areaTileShader';
import { flatZoneFragment, zoneFragment } from './zoneShader';
import { areaLightFragment, areaPictureFragment, polygonLightFragment, polygonVertex } from './polygonLightShader';
import { wallBandFragment } from './wallBandShader';
import { roofFragment } from './roofShader';
import { unlitOpeningsFragment } from './unlitOpeningsShader';
import { reflectionBlurFragment, reflectionFragment, reflectionVertex } from './reflectionShader';
import { polygonReflectionFragment, reflectionCutFragment } from './polygonReflectionShader';

export interface EngineShaderSource {
  readonly name: string;
  readonly vertex: string;
  readonly fragment: string;
  /** The polygon picture (Saver) draws with it too; any other program only the traced picture uses, and a device on Saver never compiles it. */
  readonly polygons?: true;
}

/**
 * Every program the lighting engine draws with. Passes create their shaders from these entries
 * (`createShader`), so the rules the unit tests hold the sources to, and the check that they
 * compile on the device (`verifyEngineShaders`), cover all of them.
 */
export const ENGINE_SHADERS = {
  capsuleField: { name: 'atlas-capsule-field', vertex: capsuleFieldVertex, fragment: capsuleFieldFragment, polygons: true },
  tile: { name: 'atlas-visibility-tile', vertex: tileVertex, fragment: tileFragment },
  tileSmooth: { name: 'atlas-visibility-tile-smooth', vertex: tileVertex, fragment: tileSmoothFragment },
  areaDistance: { name: 'atlas-area-light-distance', vertex: tileVertex, fragment: areaDistanceFragment },
  areaTile: { name: 'atlas-area-light-tile', vertex: tileVertex, fragment: areaTileFragment },
  areaBlur: { name: 'atlas-area-light-blur', vertex: tileVertex, fragment: areaBlurFragment },
  tileLimited: { name: 'atlas-visibility-tile-limited', vertex: limitedVertex, fragment: limitedFragment },
  reflection: { name: 'atlas-reflected-light', vertex: reflectionVertex, fragment: reflectionFragment },
  reflectionBlur: { name: 'atlas-reflected-light-blur', vertex: FULLSCREEN_VERTEX, fragment: reflectionBlurFragment },
  lightMap: { name: 'atlas-light-map', vertex: lightMapVertex, fragment: lightMapFragment },
  darkness: { name: 'atlas-darkness', vertex: darknessVertex, fragment: darknessFragment, polygons: true },
  pierce: { name: 'atlas-darkness-pierce', vertex: pierceVertex, fragment: pierceFragment, polygons: true },
  zone: { name: 'atlas-ambient-zone', vertex: lightMapVertex, fragment: zoneFragment },
  bounceEmission: { name: 'atlas-bounce-emission', vertex: cascadeVertex, fragment: emissionFragment },
  bounceCascade: { name: 'atlas-bounce-cascade', vertex: cascadeVertex, fragment: cascadeFragment },
  bounceResolve: { name: 'atlas-bounce-resolve', vertex: cascadeVertex, fragment: resolveFragment },
  sight: { name: 'atlas-sight', vertex: sightVertex, fragment: sightFragment, polygons: true },
  composite: { name: 'atlas-lighting-composite', vertex: defaultFilterVert, fragment: compositeFragmentFor('traced') },
  wallBand: { name: 'atlas-wall-band', vertex: capsuleFieldVertex, fragment: wallBandFragment, polygons: true },
  polygonLight: { name: 'atlas-polygon-light', vertex: polygonVertex, fragment: polygonLightFragment, polygons: true },
  areaPicture: { name: 'atlas-polygon-area-picture', vertex: polygonVertex, fragment: areaPictureFragment, polygons: true },
  areaLight: { name: 'atlas-polygon-area-light', vertex: lightMapVertex, fragment: areaLightFragment, polygons: true },
  polygonReflection: { name: 'atlas-polygon-reflected-light', vertex: reflectionVertex, fragment: polygonReflectionFragment, polygons: true },
  reflectionCut: { name: 'atlas-polygon-reflection-cut', vertex: polygonVertex, fragment: reflectionCutFragment, polygons: true },
  flatZone: { name: 'atlas-flat-zone', vertex: lightMapVertex, fragment: flatZoneFragment, polygons: true },
  compositePolygons: { name: 'atlas-lighting-composite-polygons', vertex: defaultFilterVert, fragment: compositeFragmentFor('polygons'), polygons: true },
  compositeUpscale: { name: 'atlas-lighting-composite-upscale', vertex: defaultFilterVert, fragment: compositeUpscaleFragment, polygons: true },
  roof: { name: 'atlas-roof', vertex: defaultFilterVert, fragment: roofFragment, polygons: true },
  unlitOpenings: { name: 'atlas-unlit-openings', vertex: sightVertex, fragment: unlitOpeningsFragment, polygons: true },
} as const satisfies Record<string, EngineShaderSource>;

const ALL_SHADERS: readonly EngineShaderSource[] = Object.values(ENGINE_SHADERS);
const POLYGON_SHADERS = ALL_SHADERS.filter((source) => source.polygons === true);

/**
 * The programs a picture may draw with, which the device is asked about before it draws. A device
 * stepped down to the polygon picture after its graphics driver died must not compile the traced
 * picture's long loops, which Direct3D's compiler unrolls.
 */
export function shadersOfPicture(picture: PictureChoice): readonly EngineShaderSource[] {
  return picture === 'traced' ? ALL_SHADERS : POLYGON_SHADERS;
}

