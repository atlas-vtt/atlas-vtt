import { Color, Container, Matrix, Texture, UniformGroup } from 'pixi.js';
import { DEFAULT_AMBIENT_COLOR } from '../../../lighting/sceneLightingOptions';
import { LEVEL_CODES, type AmbientRaster } from '../../../lighting/ambientRaster';
import { PURKINJE } from '../../../lighting/lightingConstants';
import { srgbToLinear } from '../../../lighting/srgb';
import type { PiecesTransform, RoofPieces } from '../../../levels/roofs';
import type { LightLevel } from '../../../types/senseTypes';
import type { RoofViewers } from '../../../vision/roofSight';
import { NORMAL_SIGHT } from '../../../gameSystems/senses/generic';
import { perceivedLevel } from '../../../gameSystems/senseRules';
import { destroyTree } from '../../utils/destroyTree';
import { AreaAwareFilter } from '../engine/areaAwareFilter';
import { ENGINE_SHADERS } from '../engine/engineShaders';
import { engineProgram } from '../engine/gpu';
import { RoofFade } from './roofFade';
import { DataTexture, ambientData, levelBits, piecesData, viewersData } from './roofTextures';

/** Above the lighting composite (90), below the light zones, markers and token UI. */
export const ROOF_Z_INDEX = 91;
/** How opaque the GM sees a roof: what lies beneath shows through. */
export const GM_ROOF_ALPHA = 0.65;
/** The least ambient light the GM sees a roof lit by, so a roof reads at night too. */
const GM_ROOF_LIGHT = 0.6;
/** The least ambient light a roof the players see is lit by: a sense that sees in the dark shows it dim, never black. */
const PLAYER_ROOF_LIGHT = 0.12;

/** Which picture a roof is drawn for: the players' (faded by the party), the GM's (by the selection), or a picture of the scene (whole). */
export type RoofMode = 'player' | 'gm' | 'picture';

/** How a roof is lit: by the ambient light (a lit scene), or not at all. */
export interface RoofLight {
  /** Lit by the ambient light; unset, drawn as the image is. */
  lit: boolean;
  /** The scene's ambient light (0–1), its colour (sRGB), and the level it gives. */
  ambient: number;
  color?: string | undefined;
  level: LightLevel;
  /** The ambient light by texel where the scene has zones. */
  raster: AmbientRaster | null;
}

/**
 * A level's roof as drawn (`roofFragment`): the roof image's layer under a filter that draws each
 * pixel only where its piece shows and, in the players' picture of a lit scene, where a sense sees
 * the roof. It only ever covers what lies beneath: where it is not drawn it adds nothing.
 */
export class RoofLayer {
  readonly view = new Container({ label: 'roof', eventMode: 'none' });
  private readonly group: UniformGroup;
  private readonly filter: AreaAwareFilter;
  private readonly pieces = new DataTexture('rg8unorm');
  private readonly viewers = new DataTexture('rgba32float');
  private readonly ambient = new DataTexture('rg8unorm');
  private readonly fades: Record<RoofMode, RoofFade>;
  private mode: RoofMode = 'gm';
  private gmHidden = false;
  private gated = false;

  constructor(image: Container, fadeMs: number) {
    this.fades = { player: new RoofFade(fadeMs), gm: new RoofFade(fadeMs), picture: new RoofFade(0) };
    this.view.zIndex = ROOF_Z_INDEX;
    this.view.addChild(image);
    const areaOrigin = new Float32Array(2);
    this.group = new UniformGroup({
      uAreaOrigin: { value: areaOrigin, type: 'vec2<f32>' },
      uScreenToWorld: { value: new Matrix(), type: 'mat3x3<f32>' },
      uPiecesSize: { value: new Float32Array(2), type: 'vec2<f32>' },
      uWorldToPieces: { value: new Matrix(), type: 'mat3x3<f32>' },
      uGate: { value: 0, type: 'f32' },
      uViewerCount: { value: 0, type: 'i32' },
      uAllFlags: { value: 0, type: 'f32' },
      uHasAmbient: { value: 0, type: 'f32' },
      uAmbientGrid: { value: new Float32Array(3), type: 'vec3<f32>' },
      uSceneLevel: { value: 0, type: 'f32' },
      uSceneLight: { value: 1, type: 'f32' },
      uAmbientColor: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
      uLit: { value: 0, type: 'f32' },
      uMinLight: { value: 0, type: 'f32' },
      uPurkinje: { value: PURKINJE, type: 'f32' },
      uAlpha: { value: 1, type: 'f32' },
    });
    this.filter = new AreaAwareFilter({
      glProgram: engineProgram(ENGINE_SHADERS.roof),
      resources: {
        roofUniforms: this.group,
        uPieces: this.pieces.source,
        uFade: this.fades.gm.texture.source,
        uViewers: this.viewers.source,
        uAmbient: this.ambient.source,
      },
      resolution: 'inherit',
    }, areaOrigin, this.group);
    this.view.filters = [this.filter];
    this.view.visible = false;
  }

  /** The roof's pieces and where they lie on the world; null takes the roof away. */
  setPieces(pieces: RoofPieces | null, transform: PiecesTransform | null): void {
    const u = this.group.uniforms;
    if (!pieces || !transform) {
      (u.uPiecesSize as Float32Array).set([0, 0]);
      this.group.update();
      this.view.visible = false;
      return;
    }
    this.pieces.fill(piecesData(pieces, this.pieces), pieces.width, pieces.height);
    (u.uPiecesSize as Float32Array).set([pieces.width, pieces.height]);
    for (const fade of Object.values(this.fades)) fade.reset(pieces.count);
    this.setTransform(transform);
    this.showFor();
  }

  /** Where the pieces lie on the world: the level's map was placed anew. */
  setTransform(transform: PiecesTransform): void {
    (this.group.uniforms.uWorldToPieces as Matrix).set(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
    this.group.update();
  }

  /** The pieces that fade in the players' picture and in the GM's; true where a table changed at once. */
  setFaded(mode: Exclude<RoofMode, 'picture'>, faded: ReadonlySet<number>): boolean {
    return this.fades[mode].setFaded(faded);
  }

  /** Who sees roofs in the players' picture of a lit scene (`roofViewers`); null in an unlit one, where it is seen everywhere. */
  setViewers(viewers: RoofViewers | null): void {
    const u = this.group.uniforms;
    this.gated = viewers !== null;
    if (viewers === 'all' || viewers === null) {
      u.uViewerCount = 0;
      u.uAllFlags = viewers === 'all' ? levelBits((level) => perceivedLevel(NORMAL_SIGHT, level) !== null) : 0;
    } else {
      this.viewers.fill(viewersData(viewers, this.viewers), Math.max(1, viewers.length * 2), 1);
      u.uViewerCount = viewers.length;
      u.uAllFlags = 0;
    }
    this.applyMode();
  }

  /** How the roof is lit, and the ambient light the players' sight of it reads. */
  setLight(light: RoofLight): void {
    const u = this.group.uniforms;
    const color = new Color(light.color ?? DEFAULT_AMBIENT_COLOR);
    (u.uAmbientColor as Float32Array).set([srgbToLinear(color.red), srgbToLinear(color.green), srgbToLinear(color.blue)]);
    u.uSceneLevel = LEVEL_CODES[light.level === 'magical-dark' ? 'dark' : light.level];
    u.uSceneLight = light.ambient;
    u.uLit = light.lit ? 1 : 0;
    u.uHasAmbient = light.raster ? 1 : 0;
    if (light.raster) {
      const { texel, columns, rows } = light.raster.grid;
      this.ambient.fill(ambientData(light.raster, this.ambient), columns, rows);
      (u.uAmbientGrid as Float32Array).set([texel, columns, rows]);
    }
    this.group.update();
  }

  /** Draws the roof for `mode`; the GM may hide every roof of the GM's picture (`gmHidden`). */
  setMode(mode: RoofMode, gmHidden = this.gmHidden): void {
    this.mode = mode;
    this.gmHidden = gmHidden;
    this.applyMode();
  }

  get currentMode(): RoofMode {
    return this.mode;
  }

  /** Maps points of the render being drawn to world pixels. */
  setView(screenToWorld: Matrix): void {
    (this.group.uniforms.uScreenToWorld as Matrix).copyFrom(screenToWorld);
    this.group.update();
  }

  /** Moves pieces on their way to fading or showing; true where the picture changed. */
  animate(now: number): boolean {
    const player = this.fades.player.animate(now);
    const gm = this.fades.gm.animate(now);
    // Either picture may be drawn next (the player window's frame, the canvas): both ask for a render.
    return player || gm;
  }

  /** Whether a piece is fading or showing again. */
  busy(): boolean {
    return this.fades.player.busy() || this.fades.gm.busy();
  }

  destroy(): void {
    // The filter lets go of its textures before they go.
    const empty = Texture.EMPTY.source;
    Object.assign(this.filter.resources, { uPieces: empty, uFade: empty, uViewers: empty, uAmbient: empty });
    this.view.filters = null;
    this.filter.destroy();
    this.view.removeChildren();
    destroyTree(this.view);
    for (const fade of Object.values(this.fades)) fade.destroy();
    this.pieces.destroy();
    this.viewers.destroy();
    this.ambient.destroy();
  }

  private hasPieces(): boolean {
    return (this.group.uniforms.uPiecesSize as Float32Array)[0]! > 0;
  }

  private showFor(): void {
    this.view.visible = this.hasPieces() && !(this.mode === 'gm' && this.gmHidden);
  }

  private applyMode(): void {
    const u = this.group.uniforms;
    const players = this.mode === 'player';
    this.filter.resources.uFade = this.fades[this.mode].texture.source;
    u.uGate = players && this.gated ? 1 : 0;
    u.uAlpha = this.mode === 'gm' ? GM_ROOF_ALPHA : 1;
    u.uMinLight = players ? PLAYER_ROOF_LIGHT : GM_ROOF_LIGHT;
    this.group.update();
    this.showFor();
  }
}
