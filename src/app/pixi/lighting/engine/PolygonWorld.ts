import type { Renderer, Texture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { pictureTexel, type LightingQuality } from '../../../lighting/lightingQuality';
import { LightReaches } from '../../../vision/lightReaches';
import type { LightReach } from '../../../vision/sight';
import type { MapBounds } from '../../../vision/visibility';
import { AreaLightPictures } from './AreaLightPictures';
import type { DarknessMap, PierceShape } from './DarknessMap';
import { ENGINE_SHADERS } from './engineShaders';
import { PolygonLightMap, type PolygonDrawn } from './PolygonLightMap';
import { NO_ZONES, SceneMaps, byPriority, sameLights } from './SceneMaps';
import type { EngineLight, EngineZone } from './types';
import { WallBand } from './WallBand';
import type { ZoneLook, ZoneMap } from './ZoneMap';

const NO_PARTS: NonNullable<EngineLight['parts']> = [];

/**
 * The polygon picture of one map (`PolygonQuality`): what the rules already work out on the CPU,
 * drawn and nothing traced. Each light is the polygon of its reach (`LightReach`, handed on by the
 * scene model as `EngineLight.area`, else traced here as the rule traces it) drawn into the light
 * map with the traced picture's falloff; an area light is its area and the reaches of its outline
 * (`AreaLightPictures`); a darkness erases; zones are flat fills. No light tile, wall field,
 * bounce, reflected light or flicker: the light map is drawn again only when the walls or the
 * lights change. The texels within a wall's capsule radius of its centre line hold no light and
 * no zone of the floor (`WallBand`), so no bilinear read carries either past a wall.
 */
export class PolygonWorld {
  readonly picture = 'polygons';
  readonly texel: number;
  readonly lightMap: PolygonLightMap;
  private readonly band: WallBand;
  /** How often the band was drawn: an area light's picture is drawn again with every new band. */
  private bandDrawn = 0;
  private readonly maps: SceneMaps;
  private readonly areaPictures: AreaLightPictures;
  /** The reaches of lights that come without the rule's (`EngineLight.area`), traced as the rule traces them. */
  private readonly reaches = new LightReaches();
  /** The reaches beams would have shining all around: their shadows' soft edges are those of the light all around. */
  private readonly allAround = new LightReaches();
  private walls: readonly WallSegment[] | null = null;
  private lights: readonly EngineLight[] = [];

  /** `cell` is the map's grid cell in world px, which the texel follows (`pictureTexel`). */
  constructor(renderer: Renderer, readonly bounds: MapBounds, quality: LightingQuality, private readonly cell?: number) {
    this.texel = pictureTexel(bounds, quality, cell);
    this.band = new WallBand(renderer, bounds, this.texel);
    this.lightMap = new PolygonLightMap(renderer, bounds, this.texel, this.band);
    this.areaPictures = new AreaLightPictures(renderer, bounds, this.texel, this.band);
    // The composite reads a zone at the texel a pixel lies in, whose centre lies within half its diagonal.
    this.maps = new SceneMaps(renderer, bounds, this.texel, { shader: ENGINE_SHADERS.flatZone, wallReach: this.texel * Math.SQRT1_2 * 1.001 });
  }

  /** Whether this world was made as `quality` makes one for its map and cell: else it is built anew. */
  fits(quality: LightingQuality, cell: number | undefined = this.cell): boolean {
    return quality.picture === 'polygons' && this.texel === pictureTexel(this.bounds, quality, cell);
  }

  /** What the composite binds of this world: its textures never change. */
  binding(): object {
    return this;
  }

  /** `pierce` is what the senses that see in magical darkness perceive (`pierceShapes`); the map image is not read. */
  update(walls: readonly WallSegment[], lights: readonly EngineLight[], _albedo: Texture | null, pierce: readonly PierceShape[] = this.maps.pierced): void {
    const pierceChanged = this.maps.setPierce(pierce);
    const wallsChanged = walls !== this.walls;
    if (wallsChanged) {
      this.walls = walls;
      this.band.build(walls);
      this.bandDrawn++;
    }
    const lightsChanged = !sameLights(this.lights, lights);
    this.lights = lights;
    this.maps.setScene(walls, lights, wallsChanged);
    if (wallsChanged || lightsChanged) this.drawLightMap(walls);
    if (wallsChanged || lightsChanged || pierceChanged) this.maps.drawDarkness();
  }

  /** Nothing is built over several frames and nothing flickers. */
  animate(): boolean {
    return false;
  }

  busy(): boolean {
    return false;
  }

  /** Everything is drawn in `update`. */
  flush(): void {}

  darknessMap(): DarknessMap | null {
    return this.maps.darknessMap();
  }

  zoneMap(): ZoneMap | null {
    return this.maps.zoneMap();
  }

  get holdsZoneMap(): boolean {
    return this.maps.holdsZoneMap;
  }

  get holdsDarknessMap(): boolean {
    return this.maps.holdsDarknessMap;
  }

  /** The scene's ambient zones as flat fills, ending at the walls' band; call it after `update`. */
  setZones(zones: readonly EngineZone[] = NO_ZONES, look: ZoneLook): void {
    this.maps.setZones(zones, look, () => this.band);
  }

  trim(): void {
    this.maps.trim();
  }

  destroy(): void {
    this.lightMap.destroy();
    this.areaPictures.destroy();
    this.maps.destroy();
    this.band.destroy();
  }

  private drawLightMap(walls: readonly WallSegment[]): void {
    const shining = this.lights.filter((light) => !light.darkness);
    const traced = this.traced(shining.filter((light) => !light.area || (light.surface && !light.parts)), walls);
    const areas = shining.filter((light) => light.surface).map((light) => ({ light, parts: light.parts ?? traced.get(light.key)?.parts ?? NO_PARTS }));
    const pictures = this.areaPictures.sync(areas, this.bandDrawn);
    const shadows = this.shadowsOfBeams(shining, walls);
    const drawn: PolygonDrawn[] = [];
    for (const light of byPriority(this.lights)) {
      if (light.darkness) {
        drawn.push(this.maps.darknessOf(light));
      } else if (light.surface) {
        const picture = pictures.get(light.key);
        if (picture) drawn.push({ light, picture });
      } else {
        const polygon = light.area ?? traced.get(light.key)?.polygon;
        const shadowed = shadows.get(light.key);
        if (polygon && polygon.length >= 3) drawn.push({ light, polygon, ...(shadowed && { shadows: shadowed }) });
      }
    }
    this.lightMap.draw(drawn);
  }

  /**
   * The reach each beam at rest would have shining all around, by key: its shadows' soft edges are
   * worked out from that (`DrawnReach.shadows`), so a beam lights nothing more than its light all
   * around, also where the corner of a shadow that falls into the beam lies outside it.
   */
  private shadowsOfBeams(lights: readonly EngineLight[], walls: readonly WallSegment[]): Map<string, LightReach['polygon']> {
    const beams = lights.filter((light) => light.cone && !light.moving && !light.surface).map(({ cone: _cone, ...light }) => light);
    const reaches = this.allAround.sync(beams, walls);
    return new Map(beams.map((light, i) => [light.key, reaches[i]!.polygon]));
  }

  /** The reaches of `lights` as the rule traces them, by key: for lights handed over without them. */
  private traced(lights: readonly EngineLight[], walls: readonly WallSegment[]): Map<string, LightReach> {
    const reaches = this.reaches.sync(lights, walls);
    return new Map(lights.map((light, i) => [light.key, reaches[i]!]));
  }
}
