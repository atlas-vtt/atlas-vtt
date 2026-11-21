/**
 * The key light of the dice stage and the shadow it casts on the table.
 */

import * as THREE from 'three';

import type { DieAnim } from './dieMotion';
import { FLOOR_Y } from './dieTour';

const KEY_INTENSITY = 0.95;

/** Ink colour as a number: the canvas knows no CSS variables. */
const INK = 0x16130f;

/**
 * **The shadow gets softer the higher the die is.**
 *
 * There once was a round blob underneath. It did what it should, show contact
 * with the ground, and looked like what it was: a circle under an icosahedron.
 * A shadow has the shape of its body, otherwise it is decoration.
 *
 * So it stays a cast shadow (VSM, soft edge, true silhouette), and the missing
 * information about height comes from the **blur**: just above the table the
 * core is narrow and dark, high up it dissolves into a breath. That is what a
 * penumbra does, and it costs two numbers per frame.
 */
const SHADOW_SHARP = { blur: 6.5, opacity: 0.3 };
const SHADOW_SOFT = { blur: 17, opacity: 0.14 };

/**
 * **What the shadow costs.**
 *
 * The shadow map is blurred in two passes over every one of its texels, each
 * reading `SHADOW_TAPS` of them. At 2048 texels a side and 24 taps that was two
 * hundred million reads a frame: nine tenths of a dice frame's time on the
 * graphics card, the same for one die as for ten, on a display that asks for
 * 120 frames a second and has a lit map to draw as well.
 *
 * The panel shows about five units of table on some 670 pixels, and the map
 * spans eight: 1024 texels still put more than one on every pixel. The blur
 * above is counted in texels, so half the map takes half the radius for the
 * same softness on the table, and half the taps keep their spacing.
 */
const SHADOW_MAP = 1024;
const SHADOW_TAPS = 12;

/**
 * **A smaller map for a device with less to spend.**
 *
 * The same reckoning one step further: the texels a side of the map has, where
 * a device gives fewer than `SHADOW_MAP` (`setShadowMapSize`, told once, before
 * the first stage is built). The blur and its taps shrink with the map, so the
 * shadow is as soft on the table: at half the side, an eighth of the reads.
 */
let shadowMap = SHADOW_MAP;

/** The dice's shadow map gets `texels` a side from the next stage built on, at most `SHADOW_MAP`. */
export function setShadowMapSize(texels: number): void {
  shadowMap = Math.min(SHADOW_MAP, Math.max(1, Math.round(texels)));
}

/** What a stage's shadow is drawn with: the map's side, the blur's taps, and what the blur radii are multiplied by. */
export function shadowDetail(): { map: number; taps: number; blur: number } {
  const blur = shadowMap / SHADOW_MAP;
  return { map: shadowMap, taps: Math.max(4, Math.round(SHADOW_TAPS * blur)), blur };
}

/**
 * **The shadow follows the paper, the die does not.**
 *
 * The die keeps its colours in a dark theme, but the shadow is not a thing: it
 * is the mark the thing leaves on the page, and the page does change colour.
 * Two values change with it:
 *
 * - **The colour** goes to black instead of ink. Ink on a dark page barely
 *   differs from the page: a shadow you would have to measure to find.
 * - **The opacity** rises, because the way down is shorter. Even black at one
 *   and a half times the opacity takes less from the dark page than the light
 *   case takes from the light one; more would be a hole in the paper.
 */
const NIGHT_SHADOW_GAIN = 1.5;

function nightSheet(canvas: HTMLCanvasElement): boolean {
  return canvas.ownerDocument.body.classList.contains('theme-dark');
}

/**
 * Sets up the shadow map of a renderer every stage draws with: soft (VSM) and
 * drawn only when a stage asks for it (`StageShadow.update`).
 */
export function prepareShadowMap(renderer: THREE.WebGLRenderer): void {
  // VSM: the only shadow type with a truly soft edge. Its cost does not grow
  // with the dice, only with the map (see `SHADOW_MAP`).
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  // Drawn when it changed, not on every frame (see `update`).
  renderer.shadowMap.autoUpdate = false;
}

/**
 * **Where the key light stands.**
 *
 * It once hung almost straight above the table, so the shadow would lie
 * *under* the die rather than beside it. That was true, and it was why none of
 * it could be seen: at 75° elevation it vanished entirely under the body that
 * casts it. A shadow hidden by its own body is no shadow.
 *
 * Now it stands at a good 60°: flat enough that the silhouette falls on the
 * table beside the die and its shape can be read, steep enough that it clings
 * to the body instead of running across the sheet.
 *
 * **And it stands back left, not front left.** The camera looks at the table
 * from above and in front; on screen, depth (-z) is *up*. A light from the
 * front threw the shadow **up**, behind the die, but a view from above calls for
 * a shadow falling down. So the light moves over the die to the other side:
 * from back left, shadow to front right, lower right on screen.
 *
 * The fill light pays back what that costs: the faces turned to the viewer
 * only get grazing light from the key, and without light from the front they
 * would be too dark for their numerals.
 */
const KEY_AT = [-1.7, 6.0, -1.7] as const;

export class StageShadow {
  private readonly key: THREE.DirectionalLight;
  private readonly floorMat: THREE.ShadowMaterial;
  /**
   * The map no longer shows what casts it: the bodies or the light were
   * changed, or the last frame moved a body and its ghosts have yet to go.
   */
  private stale = true;
  /** What the blur radii, counted in texels of the full map, are multiplied by on this stage's map. */
  private readonly blur: number;

  /**
   * `renderer` is shared by every stage of the document (`DiceGpu`), so its
   * shadow map is asked for right before this stage draws; `canvas` is where
   * the stage is shown, whose page decides the shadow's colour.
   */
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.key = new THREE.DirectionalLight(0xfff0da, KEY_INTENSITY);
    this.key.castShadow = true;
    const detail = shadowDetail();
    this.blur = detail.blur;
    this.key.shadow.mapSize.set(detail.map, detail.map);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.radius = SHADOW_SHARP.blur * this.blur;
    this.key.shadow.blurSamples = detail.taps;
    this.key.shadow.bias = -0.0004;
    scene.add(this.key);
    this.fit(1, 0, 3.2, 3.2);

    const fill = new THREE.DirectionalLight(0xd8c4a0, 0.62);
    fill.position.set(2.4, 1.2, 2.6);
    scene.add(fill);

    // The table: invisible except for the shadow falling on it.
    this.floorMat = new THREE.ShadowMaterial({ color: INK, opacity: SHADOW_SHARP.opacity });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = FLOOR_Y;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  /** Other bodies are on the stage: whatever the map holds is of the last ones. */
  bodiesChanged(): void {
    this.stale = true;
  }

  /**
   * Puts the light and its shadow frame where the camera looks: `reach` times
   * the base distance, at `focusZ` in the depth, over a stage of the given half
   * width and depth. The frame holds the **whole** stage, or a body at the wall
   * loses its shadow.
   */
  fit(reach: number, focusZ: number, halfX: number, halfZ: number): void {
    const frame = Math.max(halfX, halfZ) + 1;
    const camera = this.key.shadow.camera;
    camera.left = -frame;
    camera.right = frame;
    camera.top = frame;
    camera.bottom = -frame;
    camera.far = 14 * reach;
    this.key.position.set(KEY_AT[0] * reach, KEY_AT[1] * reach, KEY_AT[2] * reach + focusZ);
    this.key.target.position.set(0, 0, focusZ);
    this.key.target.updateMatrixWorld();
    camera.updateProjectionMatrix();
    this.stale = true;
  }

  /**
   * Sets light and shadow for the frame about to be drawn. `emphasis` (0 to 1)
   * swells the light as the dice come to rest: the gleam of the result.
   *
   * **The shadow is drawn anew only when it changed.** Drawing and blurring
   * the map is most of a frame's work, and dice that lie still cast the shadow
   * they cast a frame ago: while a die waits for its push, and while the sparks
   * burn out over a landed roll, every frame drew the same map again. So the
   * map is drawn in a frame that `moved` a body, and in the one after: the
   * ghosts of a smear follow the spin, and go only once the body lies.
   */
  update(dice: readonly { anim: DieAnim }[], emphasis: number, moved: boolean): void {
    this.key.intensity = KEY_INTENSITY * (1 + 0.22 * emphasis);

    // **Penumbra.** The highest body decides how soft the shadow is drawn: a
    // shadow has one softness, not two, and the flying die is the one being
    // watched.
    let height = 0;
    for (const { anim } of dice) height = Math.max(height, (anim.p[1] - anim.floor) / (anim.radius * 2.6));
    const softness = Math.min(1, Math.max(0, height));
    this.key.shadow.radius = (SHADOW_SHARP.blur + (SHADOW_SOFT.blur - SHADOW_SHARP.blur) * softness) * this.blur;
    // Read on every frame: the stage is pooled and outlives a theme switch.
    const night = nightSheet(this.canvas);
    const shadowGain = night ? NIGHT_SHADOW_GAIN : 1;
    this.floorMat.color.setHex(night ? 0x000000 : INK);
    this.floorMat.opacity =
      (SHADOW_SHARP.opacity + (SHADOW_SOFT.opacity - SHADOW_SHARP.opacity) * softness) * shadowGain;

    if (moved || this.stale) this.renderer.shadowMap.needsUpdate = true;
    this.stale = moved;
  }
}
