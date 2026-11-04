import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader, type TextureSource } from 'pixi.js';
import { MAX_ZONE_CORNERS } from '../../../lighting/lightZones';
import { wallBand } from '../../../lighting/lightingConstants';
import { DEFAULT_AMBIENT_COLOR } from '../../../lighting/sceneLightingOptions';
import { linearColor } from '../../../lighting/srgb';
import type { MapBounds } from '../../../vision/visibility';
import type { EngineShaderSource } from './engineShaders';
import { ambientLift } from './senseDrawing';
import { createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { EngineZone } from './types';

type Rgb = readonly [number, number, number];

/** A zone as it is drawn: its outline, how wide its soft edge is, and its ambient light in linear light. */
interface DrawnZone {
  zone: EngineZone;
  light: Rgb;
  /** The same light where dim light is perceived as bright (`ambientLift`). */
  lifted: Rgb;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  points: Float32Array;
  light: Float32Array;
}

/**
 * What tells a zone where the walls are: a capsule field (`zoneFragment`) or a band of the map's
 * texels around them (`flatZoneFragment`), bound under the names the zone's program reads.
 */
export interface ZoneWalls {
  resources(): Record<string, UniformGroup | TextureSource>;
}

/**
 * What of the scene decides how its zones are drawn: its ambient light, which only darker zones
 * replace on walls, its colour where a zone has none, and the levels dim light lies between.
 */
export interface ZoneLook {
  ambient?: number | undefined;
  ambientColor?: string | undefined;
  litThreshold?: number | undefined;
  brightThreshold?: number | undefined;
}

/**
 * The ambient light of the scene's zones over the map, in world space like the light map
 * (`rgba16float`, premultiplied): the composite takes `rgb + scene ambient · (1 − alpha)` as the
 * ambient light of a pixel. Inside a zone's polygon alpha is 1, so the floor has the zone's light
 * exactly, as the rule counts it; the soft edge lies outside (`zoneFragment`). A wall's capsule
 * has the darkest light that lies on it, the scene's or a zone's: zones are drawn onto the floor
 * in their order and onto the walls from the brightest to the darkest, those darker than the
 * scene only. `lifted` is the same with every zone's light where dim light is perceived as
 * bright. It exists only while the scene has a zone. `shader` is the program each zone is drawn
 * with: the traced picture's soft edge through the wall field, or the polygon picture's flat fill.
 */
export class ZoneMap {
  readonly texture: RenderTexture;
  readonly lifted: RenderTexture;
  private readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);

  /**
   * `wallReach` is how far past its outline a zone darker than the scene lies on the walls: a
   * band past it where the composite lights a wall's face from the floor in front of it, else as
   * far as a read of the texel a pixel lies in reaches (`flatZoneFragment`).
   */
  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number, private readonly shader: EngineShaderSource, private readonly wallReach = wallBand(texel)) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.lifted = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  /** Draws `zones` in their order, later ones over earlier ones, ending at the walls `walls` tells of. */
  draw(zones: readonly EngineZone[], look: ZoneLook, walls: ZoneWalls): void {
    const drawn = zones.map((zone) => drawnZone(zone, look));
    const scene = sceneLuma(look);
    const onWalls = drawn.filter((zone) => luma(zone.light) < scene).sort((a, b) => luma(b.light) - luma(a.light));
    while (this.slots.length < drawn.length) this.slots.push(this.createSlot(walls));
    for (const [target, pick] of [[this.texture, 'light'], [this.lifted, 'lifted']] as const) {
      this.fill(drawn, pick, false, walls);
      renderInto(this.renderer, this.scene, target, [0, 0, 0, 0]);
      if (onWalls.length === 0) continue;
      this.fill(onWalls, pick, true, walls);
      renderInto(this.renderer, this.scene, target);
    }
  }

  /** Sets the slots to draw `zones` in this order, onto the floor or onto the walls. */
  private fill(zones: readonly DrawnZone[], pick: 'light' | 'lifted', onWalls: boolean, walls: ZoneWalls): void {
    const { wallReach } = this;
    this.slots.forEach((slot, i) => {
      const next = zones[i];
      slot.mesh.visible = !!next;
      if (!next) return;
      const { polygon, soft } = next.zone;
      const reach = Math.max(soft, wallReach);
      const xs = polygon.map((p) => p.x);
      const ys = polygon.map((p) => p.y);
      const x = Math.min(...xs) - reach;
      const y = Math.min(...ys) - reach;
      slot.rect.set([x, y, Math.max(...xs) + reach - x, Math.max(...ys) + reach - y]);
      slot.points.set(polygon.flatMap((p) => [p.x, p.y]));
      slot.light.set(next[pick]);
      Object.assign(slot.uniforms.uniforms, { uCount: polygon.length, uSoft: soft, uOnWalls: onWalls ? 1 : 0, uWallReach: wallReach });
      slot.uniforms.update();
      Object.assign(slot.mesh.shader!.resources, walls.resources());
    });
  }

  private createSlot(walls: ZoneWalls): Slot {
    const rect = new Float32Array(4);
    const points = new Float32Array(MAX_ZONE_CORNERS * 2);
    const light = new Float32Array(3);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uPoints: { value: points, type: 'vec2<f32>', size: MAX_ZONE_CORNERS },
      uCount: { value: 0, type: 'i32' },
      uSoft: { value: 1, type: 'f32' },
      uOnWalls: { value: 0, type: 'f32' },
      uWallReach: { value: 1, type: 'f32' },
      uZoneLight: { value: light, type: 'vec3<f32>' },
    });
    const mesh = new Mesh({ geometry: this.geometry, shader: createShader(this.shader, { zoneUniforms: uniforms, ...walls.resources() }) });
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, points, light };
  }

  destroy(): void {
    for (const { mesh } of this.slots) mesh.shader?.destroy();
    this.scene.destroy({ children: true });
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.texture.destroy(true);
    this.lifted.destroy(true);
  }
}

/**
 * Whether a scene that looks like `next` draws `zones` as one that looked like `drawn` did. Its
 * ambient level counts only by which zones are darker than it (those lie on the walls): the
 * composite adds the scene's own light itself, so dusk falling over a cave redraws nothing.
 */
export function sameZoneLook(zones: readonly EngineZone[], next: ZoneLook, drawn: ZoneLook): boolean {
  if (next.ambientColor !== drawn.ambientColor || next.litThreshold !== drawn.litThreshold || next.brightThreshold !== drawn.brightThreshold) return false;
  const now = sceneLuma(next);
  const then = sceneLuma(drawn);
  return now === then || zones.every((zone) => {
    const light = luma(zoneLight(zone, next));
    return light < now === light < then;
  });
}

function sceneLuma(look: ZoneLook): number {
  return luma(linearColor(look.ambientColor ?? DEFAULT_AMBIENT_COLOR, look.ambient ?? 0));
}

/** A zone's ambient light as the composite adds it: its colour (the scene's without one) in linear light, at its level. */
function zoneLight(zone: EngineZone, look: ZoneLook): Rgb {
  return linearColor(zone.ambientColor ?? look.ambientColor ?? DEFAULT_AMBIENT_COLOR, zone.ambient);
}

function drawnZone(zone: EngineZone, look: ZoneLook): DrawnZone {
  const light = zoneLight(zone, look);
  const level = { ambient: zone.ambient, ...(look.litThreshold !== undefined && { litThreshold: look.litThreshold }), ...(look.brightThreshold !== undefined && { brightThreshold: look.brightThreshold }) };
  // Dim light raised to bright, as the scene's is.
  const lift = ambientLift(level);
  return { zone, light, lifted: [light[0] * lift, light[1] * lift, light[2] * lift] };
}

function luma(light: Rgb): number {
  return 0.2126 * light[0] + 0.7152 * light[1] + 0.0722 * light[2];
}
