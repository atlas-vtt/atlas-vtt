import { Container, Mesh, UniformGroup, type Geometry, type Renderer, type RenderTexture, type Shader } from 'pixi.js';
import { HALO, LIGHT_LEVELS, REFLECTION, softEdge } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import type { VisionCone } from '../../../vision/visionCone';
import type { MapBounds } from '../../../vision/visibility';
import { destroyTree } from '../../utils/destroyTree';
import { ENGINE_SHADERS } from './engineShaders';
import { createDarknessMesh, destroyDarknessMesh, setDarknessMesh, type DarknessMesh, type DrawnDarkness } from './DarknessMap';
import { createPlaceholder, createQuad, createShader, createTarget, destroyQuad, quadGeometry, renderInto, type Quad } from './gpu';
import type { Tile } from './TileCache';
import type { ReflectionTile } from './ReflectionTiles';

/** One light's contribution this frame (bright radius and intensity already flickered). */
export interface DrawnLight {
  tile: Tile;
  bright: number;
  dim: number;
  color: readonly [number, number, number];
  intensity: number;
  /** A light that shines one way; unset shines all around. */
  cone?: VisionCone | undefined;
  /** Width of the soft edge inside a beam's sides, in world pixels; unset, `softEdge` of its dim radius. */
  edge?: number | undefined;
  /** The light its lit floor gives back (`ReflectionTiles`). */
  reflection?: ReflectionTile | undefined;
}

interface Slot {
  mesh: Mesh<Geometry, Shader>;
  uniforms: UniformGroup;
  rect: Float32Array;
  tileOrigin: Float32Array;
  reflectOrigin: Float32Array;
  light: Float32Array;
  color: Float32Array;
  cone: Float32Array;
}

function isDarkness(light: DrawnLight | DrawnDarkness): light is DrawnDarkness {
  return 'polygon' in light;
}

/** No cone: half an angle of a full turn, which the shader reads as all around. */
const ALL_AROUND = [1, 0, 2 * Math.PI, 0] as const;

/**
 * Every light's direct light over the map in world space (`rgba16float`, HDR): independent of
 * any camera, so the GM view and the player window read the same texture. Lights add up; a
 * darkness source erases what was drawn before it within its area, so the order of `draw`'s
 * list is the order of priority: a light listed after a darkness shines in it.
 */
export class LightMap {
  readonly texture: RenderTexture;
  readonly world: readonly [number, number];
  private readonly scene = new Container();
  private readonly slots: Slot[] = [];
  private readonly darkSlots: DarknessMesh[] = [];
  private readonly quad: Quad = createQuad();
  private readonly geometry: Geometry = quadGeometry(this.quad);
  /** The meshes were put in an order of priority: the next draw without a darkness puts them back. */
  private ordered = false;
  /** Bound to idle slots, so no slot keeps a tile texture its owner may destroy. */
  private readonly placeholder: RenderTexture = createPlaceholder();

  constructor(private readonly renderer: Renderer, bounds: MapBounds, private readonly texel: number) {
    this.texture = createTarget(bounds.width / texel, bounds.height / texel, 'rgba16float');
    this.world = [this.texture.source.pixelWidth * texel, this.texture.source.pixelHeight * texel];
  }

  /** `lights` in their order of priority: a darkness source takes the light drawn before it out of its area instead of adding any. */
  draw(lights: readonly (DrawnLight | DrawnDarkness)[]): void {
    const shining = lights.filter((light): light is DrawnLight => !isDarkness(light));
    const dark = lights.filter(isDarkness);
    while (this.slots.length < shining.length) this.slots.push(this.createSlot());
    while (this.darkSlots.length < dark.length) this.darkSlots.push(this.createDarkSlot());
    this.slots.forEach((slot, i) => {
      const light = shining[i];
      slot.mesh.visible = !!light;
      if (!light) return;
      const u = slot.uniforms.uniforms;
      const { reflection } = light;
      slot.rect.set(drawnRect(light));
      slot.tileOrigin.set([light.tile.rect[0], light.tile.rect[1]]);
      u.uHasReflection = reflection ? 1 : 0;
      if (reflection) slot.reflectOrigin.set([reflection.rect[0], reflection.rect[1]]);
      slot.mesh.shader!.resources.uReflection = (reflection?.texture ?? this.placeholder).source;
      slot.light[0] = light.tile.x;
      slot.light[1] = light.tile.y;
      u.uBright = light.bright;
      u.uDim = light.dim;
      u.uIntensity = light.intensity;
      slot.color.set(light.color);
      const { cone } = light;
      slot.cone.set(cone ? [Math.cos(cone.facing), Math.sin(cone.facing), cone.angle / 2, cone.apex ?? 0] : ALL_AROUND);
      u.uEdge = light.edge ?? softEdge(light.dim);
      slot.mesh.shader!.resources.uTile = light.tile.texture.source;
      // An area light counts its distances from its outline (`Tile.distance`).
      u.uIsArea = light.tile.distance ? 1 : 0;
      slot.mesh.shader!.resources.uDistance = (light.tile.distance ?? this.placeholder).source;
    });
    this.darkSlots.forEach((slot, i) => {
      const darkness = dark[i];
      slot.mesh.visible = !!darkness;
      if (darkness) setDarknessMesh(slot, darkness);
    });
    // Without a darkness the meshes stay in the order they were made: lights only add up.
    if (dark.length > 0 || this.ordered) this.order(lights, shining, dark);
    renderInto(this.renderer, this.scene, this.texture, [0, 0, 0, 0]);
    for (const slot of this.slots) {
      slot.mesh.shader!.resources.uTile = this.placeholder.source;
      slot.mesh.shader!.resources.uDistance = this.placeholder.source;
      slot.mesh.shader!.resources.uReflection = this.placeholder.source;
    }
  }

  /** Puts the meshes in the order of `lights`, so each darkness erases exactly the lights listed before it. */
  private order(lights: readonly (DrawnLight | DrawnDarkness)[], shining: readonly DrawnLight[], dark: readonly DrawnDarkness[]): void {
    lights.forEach((light, z) => {
      const slot = isDarkness(light) ? this.darkSlots[dark.indexOf(light)] : this.slots[shining.indexOf(light)];
      slot!.mesh.zIndex = z;
    });
    this.ordered = dark.length > 0;
    this.scene.sortChildren();
  }

  private createDarkSlot(): DarknessMesh {
    const slot = createDarknessMesh(this.world, [0, 0, 0, 1], 'erase');
    this.scene.addChild(slot.mesh);
    return slot;
  }

  private createSlot(): Slot {
    const rect = new Float32Array(4);
    const tileOrigin = new Float32Array(2);
    const reflectOrigin = new Float32Array(2);
    const light = new Float32Array(2);
    const color = new Float32Array(3);
    const cone = new Float32Array(ALL_AROUND);
    const uniforms = new UniformGroup({
      uRect: { value: rect, type: 'vec4<f32>' },
      uMapWorld: { value: new Float32Array(this.world), type: 'vec2<f32>' },
      uLight: { value: light, type: 'vec2<f32>' },
      uBright: { value: 0, type: 'f32' },
      uDim: { value: 0, type: 'f32' },
      uIntensity: { value: 1, type: 'f32' },
      uLightColor: { value: color, type: 'vec3<f32>' },
      uBrightLevel: { value: LIGHT_LEVELS.bright, type: 'f32' },
      uDimLevel: { value: LIGHT_LEVELS.dim, type: 'f32' },
      uHaloGain: { value: HALO.gain, type: 'f32' },
      uHaloSize: { value: HALO.size, type: 'f32' },
      uTexel: { value: this.texel, type: 'f32' },
      uCone: { value: cone, type: 'vec4<f32>' },
      uEdge: { value: 1, type: 'f32' },
      uIsArea: { value: 0, type: 'f32' },
      uTileOrigin: { value: tileOrigin, type: 'vec2<f32>' },
      uHasReflection: { value: 0, type: 'f32' },
      uReflectOrigin: { value: reflectOrigin, type: 'vec2<f32>' },
      uReflectLevel: { value: REFLECTION.level, type: 'f32' },
      uReflectLift: { value: LIGHT_LEVELS.bright / LIGHT_LEVELS.dim, type: 'f32' },
    });
    const shader = createShader(ENGINE_SHADERS.lightMap, { lightUniforms: uniforms, uTile: this.placeholder.source, uDistance: this.placeholder.source, uReflection: this.placeholder.source });
    const mesh = new Mesh({ geometry: this.geometry, shader });
    mesh.blendMode = 'add';
    this.scene.addChild(mesh);
    return { mesh, uniforms, rect, tileOrigin, reflectOrigin, light, color, cone };
  }

  destroy(): void {
    for (const { mesh } of this.slots) mesh.shader?.destroy();
    for (const slot of this.darkSlots) {
      this.scene.removeChild(slot.mesh);
      destroyDarknessMesh(slot);
    }
    destroyTree(this.scene);
    this.geometry.destroy();
    destroyQuad(this.quad);
    this.placeholder.destroy(true);
    this.texture.destroy(true);
  }
}

/** The smallest rectangle around both. */
/** Where a light draws into the light map: over its tile and its reflection. */
export function drawnRect(light: DrawnLight): Rect {
  return light.reflection ? union(light.tile.rect, light.reflection.rect) : light.tile.rect;
}

export function union([ax, ay, aw, ah]: Rect, [bx, by, bw, bh]: Rect): Rect {
  const x = Math.min(ax, bx), y = Math.min(ay, by);
  return [x, y, Math.max(ax + aw, bx + bw) - x, Math.max(ay + ah, by + bh) - y];
}
