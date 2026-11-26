/**
 * **One WebGL context draws every stage of a document.**
 *
 * Each roll panel once had a context of its own. A context keeps its own copy
 * of everything it draws with: the face atlases of all six bodies (albedo and
 * relief, with their mipmaps, some 54 MB), the mirror world, the compiled
 * shaders. Four panels' worth were built ahead (`stagePool.ts`), so an idle map
 * held some 400 MB of graphics memory for dice nobody had thrown.
 *
 * Now the context is the document's and a stage is only a scene, a camera and
 * the canvas it is shown on (`DiceRenderer`). A stage draws into the bottom
 * left corner of this context's canvas and copies that corner onto its own
 * canvas in the same task, before the drawing buffer is handed on: the copy is
 * the picture, pixel for pixel, and the panel keeps its own element in the page
 * with the clipping and stacking it always had.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { refreshDieArtwork } from './dieMesh';
import { prepareShadowMap } from './stageShadow';

/**
 * How large the mirror world is baked, per face. The dice are matte paper
 * (roughness 0.92, a fifth of the room's light): they read only its blurriest
 * level, which 64 pixels hold as well as 256, in a fraction of the time.
 */
const ENVIRONMENT_SIZE = 64;

/**
 * The mirror world, baked. The room it comes from has nothing left to do and
 * gives its meshes back right away.
 */
function bakeEnvironment(pmrem: THREE.PMREMGenerator): THREE.WebGLRenderTarget {
  const room = new RoomEnvironment();
  const baked = pmrem.fromScene(room, 0.04, 0.1, 100, { size: ENVIRONMENT_SIZE });
  room.dispose();
  return baked;
}

export class DiceGpu {
  readonly renderer: THREE.WebGLRenderer;
  private readonly pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget;
  /**
   * The drawing buffer in device pixels. It only grows: making drawing buffers
   * takes milliseconds, and a stage asks for its size at the moments that have
   * none to spare (a roll arriving, a roll shrinking to a row).
   */
  private size = { width: 0, height: 0 };

  /** Throws where the document has no WebGL. */
  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Stages count in device pixels themselves (`DiceRenderer`).
    this.renderer.setPixelRatio(1);
    prepareShadowMap(this.renderer);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    // Baked **once**, unless the context is lost with it.
    this.envRT = bakeEnvironment(this.pmrem);
    // After three's own handler, which came with the renderer.
    canvas.addEventListener('webglcontextrestored', () => this.restored());
  }

  /** The baked reflection every stage's scene takes as its environment. */
  get environment(): THREE.Texture {
    return this.envRT.texture;
  }

  /** The context is back after the GPU process died, without anything that lived in it. */
  private restored(): void {
    // Chromium hands a 2D canvas nothing of a restored context's drawing buffer
    // until that buffer is made anew: the next draw sizes it again.
    this.size = { width: 0, height: 0 };
    this.envRT.dispose();
    this.envRT = bakeEnvironment(this.pmrem);
    // three uploads the faces again from their atlases, canvases whose pixels the GPU process held
    // and handed back blank. Drawn anew, once: kept in main memory instead, a die's first roll in a
    // new colour started some 90 ms later.
    refreshDieArtwork();
  }

  /**
   * Draws `scene` into the bottom left `width` × `height` device pixels and
   * copies them into the bottom left corner of `target`, which is cleared
   * first: whatever a larger view left there is not part of this frame.
   */
  draw(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number, target: CanvasRenderingContext2D): void {
    if (width <= 0 || height <= 0) return;
    this.reserve(width, height);
    this.renderer.setViewport(0, 0, width, height);
    // A stage made before the context was lost holds the bake that went with it.
    scene.environment = this.environment;
    this.renderer.render(scene, camera);
    const out = target.canvas;
    target.clearRect(0, 0, out.width, out.height);
    target.drawImage(this.canvas, 0, this.size.height - height, width, height, 0, out.height - height, width, height);
  }

  /** Gives the context back; the stages drawing with it draw nothing from then on. */
  dispose(): void {
    this.envRT.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private reserve(width: number, height: number): void {
    if (width <= this.size.width && height <= this.size.height) return;
    this.size = { width: Math.max(width, this.size.width), height: Math.max(height, this.size.height) };
    // The canvas is never in the page, so it needs no CSS size.
    this.renderer.setSize(this.size.width, this.size.height, false);
  }
}
