/**
 * The dice renderer: **real light instead of computed tones.**
 *
 * A software version painted every face with a gradient and a formula
 * highlight; it read as cardboard, not as a die. What gives a die its look
 * cannot be painted per face:
 *
 * 1. **Reflections of the surroundings.** A studio environment
 *    (`RoomEnvironment`) stands behind the material as its mirror world.
 * 2. **The chamfer as a body.** The edge is really ground off: a narrow strip
 *    of geometry that catches the light differently from the face, anew at
 *    every turn (`dieMesh.ts`).
 * 3. **The cut numeral.** A bump map sinks the number into the material.
 * 4. **A real cast shadow.** The die casts it on the table, with a soft edge,
 *    in its own shape; no blob underneath.
 *
 * The math stays where it is: `dieGeometry.ts` supplies the bodies,
 * `dieMotion.ts` the path. This file only draws, through the document's one
 * WebGL context (`DiceGpu`), onto the stage's own canvas.
 */

import * as THREE from 'three';

import type { DiceGpu } from './DiceGpu';
import type { DieSides } from './dieGeometry';
import type { DieBody } from './dieBody';
import { dieVariantAssets, type LookVariant } from './dieMesh';
import type { DieAnim } from './dieMotion';
import { FLOOR_Y } from './dieTour';
import { chainLengthFor, GhostTrail } from './ghostTrail';
import { landingSparks, wallSparks, type Crit } from './impactSparks';
import { Sparks } from './sparks';
import { STAGE_FOV, StageCamera } from './stageCamera';
import { StageShadow } from './stageShadow';

export interface StageDie {
  anim: DieAnim;
  sides: DieSides;
  /** Rolled for an explosion: not on the table until it is thrown. */
  waits?: boolean;
  /** The die exploded: it lands with this burst, whatever the roll as a whole is. */
  burst?: Crit;
}

/** Puts the mesh where its die is. Returns whether that moved it. */
function place(mesh: THREE.Mesh, anim: DieAnim): boolean {
  const { position, quaternion, scale } = mesh;
  const [x, y, z] = anim.p;
  const q = anim.q;
  const moved =
    position.x !== x || position.y !== y || position.z !== z ||
    quaternion.x !== q.x || quaternion.y !== q.y || quaternion.z !== q.z || quaternion.w !== q.w ||
    scale.x !== anim.radius;
  position.set(x, y, z);
  quaternion.set(q.x, q.y, q.z, q.w);
  scale.setScalar(anim.radius);
  return moved;
}

/** A length in CSS pixels as whole device pixels, as a canvas counts them. */
function devicePixels(css: number, dpr: number): number {
  return Math.floor(css * dpr);
}

/** The pixel ratio a stage in `win` is drawn at: beyond 2 nobody sees the difference, and it is paid on every frame. */
export function stagePixelRatio(win: Window): number {
  return Math.min(2, win.devicePixelRatio || 1);
}

export class DiceRenderer {
  private readonly scene = new THREE.Scene();
  private readonly view = new StageCamera();
  private readonly shadow: StageShadow;
  /** Where the frames are shown; null where the document has no 2D canvas. */
  private readonly output: CanvasRenderingContext2D | null;
  private meshes: THREE.Mesh[] = [];
  private readonly trails: GhostTrail;
  private readonly sparks: Sparks;
  /** Who has landed already: the landing fires only once. */
  private landed: boolean[] = [];
  private lastTime: number | null = null;
  /** The canvas' size in CSS pixels and its pixel ratio. */
  private buffer = { width: 0, height: 0, dpr: 0 };
  /** What a frame draws, in device pixels: the canvas' bottom left corner. */
  private viewport = { width: 0, height: 0 };

  /** `canvas` is this stage's own, shown on its panel; `gpu` draws for every stage of its document. */
  constructor(private readonly gpu: DiceGpu, private readonly canvas: HTMLCanvasElement) {
    this.output = canvas.getContext('2d');
    this.scene.environment = gpu.environment;
    this.shadow = new StageShadow(gpu.renderer, this.scene, canvas);
    this.trails = new GhostTrail(this.scene);
    this.sparks = new Sparks(this.scene, FLOOR_Y + 0.02);
  }

  /**
   * One mesh per planned die; dice of the same kind share geometry and
   * material. Each gets a chain of ghosts, shorter the more dice there are
   * (`chainLengthFor`). A die with a tint (`#rrggbb`, by plan index) or a stage
   * in a look of its own (`look`) is painted with its own material (`dieVariantAssets`).
   */
  setPlan(bodies: readonly DieBody[], options: { tints?: ReadonlyArray<string | null | undefined>; look?: LookVariant | null } = {}): void {
    for (const mesh of this.meshes) this.scene.remove(mesh);
    this.trails.clear();
    this.landed = bodies.map(() => false);
    this.shadow.bodiesChanged();

    const chainLength = chainLengthFor(bodies.length);

    this.meshes = bodies.map((body, index) => {
      const assets = dieVariantAssets(body, options.look ?? null, options.tints?.[index] ?? null);
      const mesh = new THREE.Mesh(assets.geometry, assets.material);
      mesh.castShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);
      this.trails.addChain(assets, chainLength);
      return mesh;
    });
  }

  /** The stage as the throw knows it: half width and half depth in world units. */
  stage(): readonly [number, number] {
    return this.view.stage();
  }

  /**
   * Sizes the canvas to exactly this and fits the camera: to `halfWidth` world
   * units either side of the centre, by default the whole stage the dice bounce
   * around in.
   */
  setSize(width: number, height: number, dpr: number, focus = 0.5, halfWidth?: number): void {
    this.allocate(width, height, dpr);
    this.fitView(width, height, focus, halfWidth);
  }

  /**
   * `setSize` for a stage on a panel: draws at this size in the bottom left
   * corner of a canvas that is at least as large, and keeps the canvas.
   *
   * Making drawing buffers takes milliseconds, and a panel asked for them at
   * the two moments that have none to spare: when its roll arrives, and when
   * the next roll shrinks it to a row. So a canvas only ever grows; the stage
   * holds it by that corner and clips the rest (`.atlas-dice-roll__stage`).
   */
  setView(width: number, height: number, dpr: number, focus = 0.5, halfWidth?: number): void {
    const { buffer } = this;
    // Another pixel ratio makes new buffers whatever their size, so they start at this one.
    if (dpr !== buffer.dpr) this.allocate(width, height, dpr);
    else this.allocate(Math.max(width, buffer.width), Math.max(height, buffer.height), dpr);
    this.fitView(width, height, focus, halfWidth);
  }

  /** Gives the canvas this size, as an element and in pixels, unless it has it. */
  private allocate(width: number, height: number, dpr: number): void {
    const { buffer, canvas } = this;
    if (width === buffer.width && height === buffer.height && dpr === buffer.dpr) return;
    this.buffer = { width, height, dpr };
    canvas.width = devicePixels(width, dpr);
    canvas.height = devicePixels(height, dpr);
    // The stylesheet leaves the element's size to the stage.
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  /**
   * Draws at this size in the canvas' bottom left corner and fits the camera,
   * the key light and its shadow frame to it.
   */
  private fitView(width: number, height: number, focus: number, halfWidth: number | undefined): void {
    const { dpr } = this.buffer;
    this.viewport = { width: devicePixels(width, dpr), height: devicePixels(height, dpr) };
    this.view.setAspect(width / height);
    this.view.fit(focus, halfWidth);
    const [halfX, halfZ] = this.view.stage();
    this.shadow.fit(this.view.reach, this.view.focusZ, halfX, halfZ);
    // Sparks are sized in pixels, not world units; the conversion depends on
    // exactly this height.
    this.sparks.setViewport(height * this.buffer.dpr, STAGE_FOV);
  }

  /** One frame: take the poses from the simulation and draw. */
  render(dice: StageDie[], emphasis: number, crit: Crit = null): void {
    const now = performance.now() / 1000;
    const dt = this.lastTime === null ? 0 : Math.min(0.05, now - this.lastTime);
    this.lastTime = now;

    let moved = false;
    for (let i = 0; i < this.meshes.length; i++) {
      const die = dice[i];
      const mesh = this.meshes[i]!;
      if (die === undefined) continue;
      const anim = die.anim;
      // The waiting die lies visibly in place; the delay hides nothing any
      // more, it is the stillness before the push. Only a die rolled for an
      // explosion is not there yet: it exists once the die before it burst.
      const visible = !(die.waits === true && anim.phase === 'throw' && anim.delay > 0);
      if (mesh.visible !== visible) moved = true;
      mesh.visible = visible;
      if (!visible) continue;
      if (place(mesh, anim)) moved = true;

      const hit = wallSparks(anim);
      if (hit !== null) this.sparks.emit(hit);
      if (anim.impact?.kind === 'settle' && !this.landed[i]) {
        this.landed[i] = true;
        this.sparks.emit(landingSparks(anim, die.burst ?? crit));
      } else if (anim.phase === 'throw' && anim.t < 0.2) {
        this.landed[i] = false;
      }

      this.trails.update(i, mesh, anim);
    }

    this.shadow.update(dice, emphasis, moved);

    this.placeCamera(dice, dt);
    this.sparks.step(dt);

    if (this.output) this.gpu.draw(this.scene, this.view.camera, this.viewport.width, this.viewport.height, this.output);
  }

  /**
   * Whether the next frame would show what the last one did, the dice being at
   * rest: no spark burns and the camera stands. The stage's clock stops there.
   */
  isStill(): boolean {
    return !this.sparks.burning && !this.view.shaking;
  }

  /** Shakes the camera by the strongest wall hit of this frame. */
  private placeCamera(dice: StageDie[], dt: number): void {
    let bang = 0;
    for (const die of dice) {
      if (die.anim.impact?.kind === 'wall') bang = Math.max(bang, die.anim.impact.strength);
    }
    this.view.place(bang, dt);
  }

  /**
   * **The stage is cleared, not torn down.**
   *
   * There once was a `dispose()` here that gave the WebGL context back with
   * `forceContextLoss()`, because every throw built its own stage. The idea was
   * right, the effect was not: an abandoned context **keeps counting** until
   * garbage collection gets round to it. Measured in WebKit, twenty throws in
   * a row: from the seventeenth on, every single one logged "There are too many
   * active WebGL contexts on this page, the oldest context will be lost". On a
   * phone the series does not end with a warning but with the system reloading
   * the page under memory pressure, mid-game.
   *
   * A stage now holds no context at all (`DiceGpu` is the document's), and it
   * is still cleared and handed on to the next throw (`stagePool.ts`): its
   * scene, shadow map and canvas are ready for it.
   */
  reset(): void {
    this.setPlan([]);
    this.sparks.clear();
    this.view.resetShake();
    this.lastTime = null;
    // What the canvas shows belonged to the previous throw. The borrowed
    // canvas starts empty, or its last frame flashes up briefly.
    this.output?.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
