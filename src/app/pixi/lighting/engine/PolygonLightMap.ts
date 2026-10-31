import { Container, Mesh, UniformGroup, type BufferImageSource, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { sightWedges } from '../../../vision/sightWedges';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { createDarknessMesh, destroyDarknessMesh, setDarknessMesh, type DarknessMesh, type DrawnDarkness } from './DarknessMap';
import type { AreaPicture } from './AreaLightPictures';
import { ENGINE_SHADERS } from './engineShaders';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import { createFalloff, fansGeometry, setFalloff, type Falloff } from './polygonFans';
import { MAX_WEDGES, wedgeTexture } from './wedges';
import type { EngineLight } from './types';
import { sameLights } from './SceneMaps';
import type { WallBand } from './WallBand';

/** A light as the polygon picture draws it: its reach, the polygon the rule counts, star-shaped around it. */
export interface DrawnReach {
  light: EngineLight;
  polygon: Polygon;
  /** Where its shadows' soft edges are worked out from, where not its reach: a beam's reach all around. */
  shadows?: Polygon;
}

/** An area light: its picture (`AreaLightPictures`), added in its colour. */
export interface DrawnArea {
  light: EngineLight;
  picture: AreaPicture;
}

export type PolygonDrawn = DrawnReach | DrawnArea | DrawnDarkness;

function isReach(item: PolygonDrawn): item is DrawnReach {
  return 'light' in item && 'polygon' in item;
}

function isArea(item: PolygonDrawn): item is DrawnArea {
  return 'picture' in item;
}

function isDarkness(item: PolygonDrawn): item is DrawnDarkness {
  return 'origin' in item;
}

interface ReachSlot {
  mesh: Mesh<Geometry, Shader>;
  falloff: Falloff;
  /** The soft edges of its shadows (`sightWedges`, `wedgeTexture`). */
  wedges: BufferImageSource;
  /** What its geometry and wedges were made for: made anew when any of it changes. */
  polygon: Polygon | null;
  shadows: Polygon | null;
  penumbra: number;
}

/** A shadow's soft edge opens as a flame of at least this many texels across would cast it, so no edge shows the texel grid's steps. */
const MIN_PENUMBRA_TEXELS = 2;

interface AreaSlot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  color: Float32Array;
}

/**
 * Lights drawn from the polygons the rule counts into a world-space target over the map: a light
 * is its reach as a fan with the falloff of the traced picture; an area light its picture; lights
 * add up, and a darkness erases what was drawn before it within its area, so the list `draw` takes
 * is in order of priority. Nothing is drawn on the walls' band (`WallBand`), so no bilinear read
 * carries light past a wall.
 */
class LightLayer {
  private readonly scene = new Container();
  private readonly reaches: ReachSlot[] = [];
  private readonly areas: AreaSlot[] = [];
  private readonly darkSlots: DarknessMesh[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  /** Bound to idle area slots, so none keeps a picture its owner may destroy. */
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, private readonly world: readonly [number, number], private readonly texel: number, private readonly band: WallBand) {}

  /** `drawn` into `target` in their order of priority (onto what it holds, unless `clear`): a darkness takes the light drawn before it out of its area. */
  draw(drawn: readonly PolygonDrawn[], target: RenderTexture, clear: boolean): void {
    const reaches = drawn.filter(isReach);
    const areas = drawn.filter(isArea);
    const dark = drawn.filter(isDarkness);
    while (this.reaches.length < reaches.length) this.reaches.push(this.createReach());
    while (this.areas.length < areas.length) this.areas.push(this.createArea());
    while (this.darkSlots.length < dark.length) this.darkSlots.push(this.createDark());
    this.reaches.forEach((slot, i) => this.setReach(slot, reaches[i]));
    this.areas.forEach((slot, i) => this.setArea(slot, areas[i]));
    this.darkSlots.forEach((slot, i) => this.setDarkness(slot, dark[i]));
    drawn.forEach((item, z) => {
      if (isArea(item)) this.areas[areas.indexOf(item)]!.mesh.zIndex = z;
      else if (isDarkness(item)) this.darkSlots[dark.indexOf(item)]!.mesh.zIndex = z;
      else this.reaches[reaches.indexOf(item)]!.mesh.zIndex = z;
    });
    this.scene.sortChildren();
    renderInto(this.renderer, this.scene, target, clear ? [0, 0, 0, 0] : undefined);
    for (const slot of this.areas) slot.mesh.shader!.resources.uPicture = this.placeholder.source;
  }

  destroy(): void {
    for (const { mesh, wedges } of this.reaches) {
      mesh.geometry.destroy(true);
      mesh.shader?.destroy();
      wedges.destroy();
    }
    for (const { mesh } of this.areas) mesh.shader?.destroy();
    for (const slot of this.darkSlots) {
      this.scene.removeChild(slot.mesh);
      destroyDarknessMesh(slot);
    }
    destroyTree(this.scene);
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
  }

  private setReach(slot: ReachSlot, item: DrawnReach | undefined): void {
    slot.mesh.visible = !!item;
    if (!item) return;
    const { light, polygon } = item;
    const shadows = item.shadows ?? polygon;
    // A moving light keeps its soft shadows: hard ones showed the texel grid's steps through every door and window of a drag, and the wedges of a reach cost a drag step well under a millisecond.
    const penumbra = Math.max(light.flame, MIN_PENUMBRA_TEXELS * this.texel);
    if (slot.polygon !== polygon || slot.shadows !== shadows || slot.penumbra !== penumbra) {
      const origin = { x: light.x, y: light.y };
      const previous = slot.mesh.geometry;
      slot.mesh.geometry = fansGeometry([{ origin, polygon }]);
      previous.destroy(true);
      // A beam's shadows are its light's all around (`shadows`): their edges have no cone to skip.
      const wedges = penumbra > 0 ? sightWedges(origin, shadows, penumbra, shadows === polygon ? light.cone?.apex ?? 0 : 0).slice(0, MAX_WEDGES) : [];
      const previousWedges = slot.wedges;
      slot.wedges = wedgeTexture(wedges, origin);
      slot.mesh.shader!.resources.uWedges = slot.wedges;
      previousWedges.destroy();
      slot.polygon = polygon;
      slot.shadows = shadows;
      slot.penumbra = penumbra;
    }
    setFalloff(slot.falloff, light);
  }

  private setArea(slot: AreaSlot, item: DrawnArea | undefined): void {
    slot.mesh.visible = !!item;
    if (!item) return;
    slot.rect.set(item.picture.rect);
    slot.color.set(item.light.color);
    slot.uniforms.update();
    slot.mesh.shader!.resources.uPicture = item.picture.texture.source;
  }

  private setDarkness(slot: DarknessMesh, darkness: DrawnDarkness | undefined): void {
    slot.mesh.visible = !!darkness;
    if (darkness) setDarknessMesh(slot, darkness);
  }

  private createReach(): ReachSlot {
    const falloff = createFalloff(this.texel, [0, 0, this.world[0], this.world[1]]);
    const wedges = wedgeTexture([], { x: 0, y: 0 });
    const shader = createShader(ENGINE_SHADERS.polygonLight, { falloffUniforms: falloff.uniforms, uWedges: wedges, ...this.band.resources() });
    const mesh = new Mesh({ geometry: fansGeometry([]), shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, falloff, wedges, polygon: null, shadows: null, penumbra: 0 };
  }

  private createArea(): AreaSlot {
    const rect = new Float32Array(4);
    const color = new Float32Array(3);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uTexel: { value: this.texel, type: 'f32' },
      uLightColor: { value: color, type: 'vec3<f32>' },
    });
    const shader = createShader(ENGINE_SHADERS.areaLight, { areaUniforms: uniforms, uPicture: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, color };
  }

  private createDark(): DarknessMesh {
    const slot = createDarknessMesh(this.world, [0, 0, 0, 1], 'erase');
    this.scene.addChild(slot.mesh);
    return slot;
  }
}

/**
 * The polygon picture's light map (`PolygonWorld`): every light's light over the map in world
 * space (`rgba16float`, like the traced picture's `LightMap`, which the composite reads alike),
 * drawn from the polygons the rule counts and nothing traced (`LightLayer`). While lights move
 * (`EngineLight.moving`: a carried torch dragged) and no darkness is in the scene, the lights at
 * rest are drawn once into a texture of their own and each redraw copies that and adds the moving
 * ones, so a drag step draws only what moved.
 */
export class PolygonLightMap {
  readonly texture: RenderTexture;
  readonly world: readonly [number, number];
  private readonly resting: LightLayer;
  private readonly moving: LightLayer;
  /** The lights at rest while some move, and what they were drawn from. */
  private still: { texture: RenderTexture; drawn: readonly PolygonDrawn[] } | null = null;

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number, band: WallBand) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
    this.resting = new LightLayer(renderer, this.world, texel, band);
    this.moving = new LightLayer(renderer, this.world, texel, band);
  }

  /** `drawn` in their order of priority: a darkness takes the light drawn before it out of its area. */
  draw(drawn: readonly PolygonDrawn[]): void {
    const moves = (item: PolygonDrawn): boolean => !isDarkness(item) && !!item.light.moving;
    if (drawn.some(isDarkness) || !drawn.some(moves)) {
      this.dropStill();
      this.resting.draw(drawn, this.texture, true);
      return;
    }
    const resting = drawn.filter((item) => !moves(item));
    if (!this.still || !sameDrawn(this.still.drawn, resting)) {
      this.still ??= { texture: createTarget(this.texture.source.pixelWidth, this.texture.source.pixelHeight, 'rgba16float'), drawn: resting };
      this.still.drawn = resting;
      this.resting.draw(resting, this.still.texture, true);
    }
    const { pixelWidth: width, pixelHeight: height } = this.texture.source;
    this.renderer.renderTarget.copyToTexture(this.still.texture, this.texture, { x: 0, y: 0 }, { width, height }, { x: 0, y: 0 });
    this.moving.draw(drawn.filter(moves), this.texture, false);
  }

  destroy(): void {
    this.resting.destroy();
    this.moving.destroy();
    this.dropStill();
    this.texture.destroy(true);
  }

  private dropStill(): void {
    this.still?.texture.destroy(true);
    this.still = null;
  }
}

/** Whether two lists of lights at rest draw alike: the same lights with the same reaches or pictures. */
function sameDrawn(a: readonly PolygonDrawn[], b: readonly PolygonDrawn[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    if (isDarkness(x) || isDarkness(y) || !sameLights([x.light], [y.light])) return false;
    return isArea(x) ? isArea(y) && x.picture === y.picture : isReach(y) && x.polygon === y.polygon && x.shadows === y.shadows;
  });
}
