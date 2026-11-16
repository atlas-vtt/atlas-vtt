import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { filledPieces } from '../../../lighting/polygonFill';
import type { Rect } from '../../../lighting/segments';
import type { MapBounds } from '../../../vision/visibility';
import { AREA_CORNER_VECTORS } from './areaTileShader';
import { ENGINE_SHADERS } from './engineShaders';
import { createShader, createTarget, renderInto } from './gpu';
import { createFalloff, fansGeometry, middleOf, setFalloff, texelRect, type Fan } from './polygonFans';
import type { EngineLight } from './types';
import type { WallBand } from './WallBand';
import { OneWayList } from './oneWayBand';

/** An area light's picture: its light over the texels around it, before its colour (`areaPictureFragment`). */
export interface AreaPicture {
  texture: RenderTexture;
  /** World px it covers, on the light map's texel grid. */
  rect: Rect;
}

interface Entry {
  picture: AreaPicture;
  /** What it was drawn from: drawn again when any of it changes, or the walls' band. */
  light: EngineLight;
  parts: readonly Fan[];
  band: number;
}

/**
 * The pictures of a scene's area lights (`EngineLight.surface`), drawn from the polygons the rule
 * counts: the area itself, in convex pieces, and the reaches of its outline (`LightReach.parts`),
 * max-blended, so the many parts that overlap light a texel once. Each is drawn again only when
 * its light or its parts or the walls changed, so lava at rest costs the light map one quad.
 */
export class AreaLightPictures {
  private readonly entries = new Map<string, Entry>();
  private readonly world: readonly [number, number];
  /** What every picture lists of the one-way walls: all of them, since the rule ends an area light at one from either side (`areaParts`). */
  private readonly oneWay = new OneWayList();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number, private readonly band: WallBand) {
    this.world = [Math.ceil(bounds.width / texel) * texel, Math.ceil(bounds.height / texel) * texel];
  }

  /**
   * The picture of each area light of `lights`, keyed as they are, with `parts` its reaches beyond
   * the area; `band` counts the walls' band's drawings, so a new band draws every picture again.
   * Pictures of lights no longer listed are destroyed.
   */
  sync(lights: readonly { light: EngineLight; parts: readonly Fan[] }[], band: number): Map<string, AreaPicture> {
    const kept = new Set<string>();
    for (const { light, parts } of lights) {
      kept.add(light.key);
      const entry = this.entries.get(light.key);
      if (entry && entry.parts === parts && entry.band === band && sameArea(entry.light, light)) continue;
      if (entry) entry.picture.texture.destroy(true);
      const picture = this.draw(light, parts);
      if (picture) this.entries.set(light.key, { picture, light, parts, band });
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

  private draw(light: EngineLight, parts: readonly Fan[]): AreaPicture | null {
    const surface = light.surface!;
    const fans: Fan[] = [...filledPieces(surface).map((piece) => ({ origin: middleOf(piece), polygon: piece })), ...parts];
    const rect = texelRect(fans, this.texel, this.world);
    if (!rect) return null;
    const texture = createTarget(Math.round(rect[2] / this.texel), Math.round(rect[3] / this.texel), 'rg16float', 'nearest');
    // The picture's texels lie on the light map's: its rect is whole texels from a texel's corner.
    const covered: Rect = [rect[0], rect[1], texture.source.pixelWidth * this.texel, texture.source.pixelHeight * this.texel];
    const falloff = createFalloff(this.texel, covered);
    setFalloff(falloff, light);
    const corners = new Float32Array(AREA_CORNER_VECTORS * 4);
    const count = Math.min(surface.length, AREA_CORNER_VECTORS * 2);
    for (let i = 0; i < count; i++) corners.set([surface[i]!.x, surface[i]!.y], 2 * i);
    const outline = new UniformGroup({
      uCorners: { value: corners, type: 'vec4<f32>', size: AREA_CORNER_VECTORS },
      uCount: { value: count, type: 'i32' },
    });
    const geometry: Geometry = fansGeometry(fans, this.texel);
    this.oneWay.set(this.band.everyOneWay());
    const shader: Shader = createShader(ENGINE_SHADERS.areaPicture, { falloffUniforms: falloff.uniforms, outlineUniforms: outline, ...this.band.oneWayResources(), ...this.oneWay.resources() });
    const mesh = new Mesh({ geometry, shader });
    mesh.blendMode = 'max';
    const scene = new Container();
    scene.addChild(mesh);
    try {
      renderInto(this.renderer, scene, texture, [0, 0, 0, 0]);
    } finally {
      geometry.destroy(true);
      shader.destroy();
      mesh.destroy();
      scene.destroy();
    }
    return { texture, rect: covered };
  }
}

/** Whether two area lights are drawn alike: their area, ranges and intensity. */
function sameArea(a: EngineLight, b: EngineLight): boolean {
  return a.surface === b.surface && a.bright === b.bright && a.dim === b.dim && a.intensity === b.intensity;
}
