import { Container, Mesh, UniformGroup, type Renderer } from 'pixi.js';
import { LIGHT_LEVELS, REFLECTION } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import type { ReflectionPart } from '../../../vision/reflectedLight';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import type { AreaPicture } from './AreaLightPictures';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader, createTarget, renderInto } from './gpu';
import { filledPieces } from '../../../lighting/polygonFill';
import { fansGeometry, middleOf, texelRect, type Fan } from './polygonFans';
import { reflectionFans } from './ReflectionTiles';
import type { EngineLight } from './types';
import type { WallBand } from './WallBand';
import { OneWayList } from './oneWayBand';

/**
 * A light that reflects, with the floor it lights itself as the polygon picture draws it: a light's
 * reach, or an area light's reaches beyond its area (`LightReach.parts`), which lights its area too.
 */
export interface ReflectingLight {
  light: EngineLight;
  lit: { reach: Polygon } | { parts: readonly Fan[] };
}

interface Entry {
  picture: AreaPicture;
  /** What it was drawn from: drawn again when any of it changes, or the walls' band. */
  parts: readonly ReflectionPart[];
  litBy: object;
  intensity: number;
  band: number;
}

/**
 * The polygon picture's reflected light (`EngineLight.reflection`, the rule's own parts): one
 * picture per light that reflects, over its parts' polygons, each part's polygon a fan lit as the
 * traced picture lights it (`polygonReflectionFragment`), max-blended, and the light's own reach
 * cut out of it (`reflectionCutFragment`), so it fills only the shadows, where the rule counts it.
 * The light map adds it in the light's colour as an area light's picture. Drawn again only when its
 * parts (the light moved or changed, or walls did), its reach, its intensity or the walls' band
 * change, so a light at rest costs the light map one quad.
 */
export class ReflectionPictures {
  private readonly entries = new Map<string, Entry>();
  private readonly world: readonly [number, number];
  /** Every one-way wall: the rule's reflection ends at one from either side (`twoWayWalls`). */
  private readonly oneWay = new OneWayList();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number, private readonly band: WallBand) {
    this.world = [Math.ceil(bounds.width / texel) * texel, Math.ceil(bounds.height / texel) * texel];
  }

  /** The picture of each light of `lights` that reflects, keyed as they are; `band` counts the band's drawings. Others' pictures are destroyed. */
  sync(lights: readonly ReflectingLight[], band: number): Map<string, AreaPicture> {
    const kept = new Set<string>();
    for (const { light, lit } of lights) {
      const parts = light.reflection;
      if (!parts?.length || light.darkness) continue;
      kept.add(light.key);
      const entry = this.entries.get(light.key);
      const litBy = 'reach' in lit ? lit.reach : lit.parts;
      if (entry && entry.parts === parts && entry.litBy === litBy && entry.intensity === light.intensity && entry.band === band) continue;
      entry?.picture.texture.destroy(true);
      const picture = this.draw(light, parts, litFans(light, lit));
      if (picture) this.entries.set(light.key, { picture, parts, litBy, intensity: light.intensity, band });
      else this.entries.delete(light.key);
    }
    for (const [key, entry] of this.entries) {
      if (kept.has(key)) continue;
      entry.picture.texture.destroy(true);
      this.entries.delete(key);
    }
    return new Map([...this.entries].map(([key, entry]) => [key, entry.picture]));
  }

  destroy(): void {
    for (const { picture } of this.entries.values()) picture.texture.destroy(true);
    this.entries.clear();
    this.oneWay.destroy();
  }

  private draw(light: EngineLight, parts: readonly ReflectionPart[], lit: readonly Fan[]): AreaPicture | null {
    const rect = texelRect(parts, this.texel, this.world);
    if (!rect) return null;
    const texture = createTarget(Math.round(rect[2] / this.texel), Math.round(rect[3] / this.texel), 'rg16float', 'nearest');
    const covered: Rect = [rect[0], rect[1], texture.source.pixelWidth * this.texel, texture.source.pixelHeight * this.texel];
    const reflectionUniforms = new UniformGroup({
      uReflectRect: { value: new Float32Array(covered), type: 'vec4<f32>' },
      uTexel: { value: this.texel, type: 'f32' },
      uIntensity: { value: light.intensity, type: 'f32' },
      uLevel: { value: REFLECTION.level, type: 'f32' },
      uLift: { value: LIGHT_LEVELS.bright / LIGHT_LEVELS.dim, type: 'f32' },
    });
    const targetUniforms = new UniformGroup({ uTargetRect: { value: new Float32Array(covered), type: 'vec4<f32>' } });
    this.oneWay.set(this.band.everyOneWay());
    const glow = new Mesh({
      geometry: reflectionFans(parts),
      shader: createShader(ENGINE_SHADERS.polygonReflection, { reflectionUniforms, ...this.band.oneWayResources(), ...this.oneWay.resources() }),
    });
    glow.blendMode = 'max';
    const cut = new Mesh({
      geometry: fansGeometry(lit, this.texel),
      shader: createShader(ENGINE_SHADERS.reflectionCut, { targetUniforms }),
    });
    cut.blendMode = 'min';
    // `max` and `min` blending apply only to meshes below the render root; the cut is drawn after.
    const scene = new Container();
    scene.addChild(glow, cut);
    try {
      renderInto(this.renderer, scene, texture, [0, 0, 0, 0]);
    } finally {
      for (const mesh of [glow, cut]) {
        mesh.geometry.destroy(true);
        mesh.shader?.destroy();
        mesh.destroy();
      }
      scene.destroy();
    }
    return { texture, rect: covered };
  }
}

/** The floor `light` lights itself, as fans: its reach, or its area in convex pieces and the reaches of its outline. */
function litFans(light: EngineLight, lit: ReflectingLight['lit']): Fan[] {
  if ('reach' in lit) return [{ origin: { x: light.x, y: light.y }, polygon: lit.reach }];
  return [...filledPieces(light.surface ?? []).map((piece) => ({ origin: middleOf(piece), polygon: piece })), ...lit.parts];
}
