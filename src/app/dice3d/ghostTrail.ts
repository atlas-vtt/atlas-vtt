/**
 * **Motion blur.**
 *
 * The smear is made of copies of the same pose, a few milliseconds earlier.
 * The spacing between them must **not** be measured in milliseconds: at
 * 60 rad/s twelve milliseconds are a good 40 degrees apart, and five such
 * copies are not a smear but a stack of prints. So it is measured in **angle**:
 * the chain always sweeps the same arc however fast the die spins, and only
 * gets denser.
 */

import * as THREE from 'three';

import type { DieAssets } from './dieMesh';
import type { DieAnim } from './dieMotion';

const GHOSTS = 8;
/** The arc the whole chain sweeps (rad). A good hand's breadth of smear. */
const SMEAR_ARC = 1.15;
/** Spin speed (rad/s) from which the smear begins. */
const BLUR_FROM = 9;
/**
 * **The shadow smears too.**
 *
 * The ghosts used to cast none; only the body did, so a blurred die sat over a
 * razor-sharp shadow. That is not merely untidy, it is backwards: the shadow is
 * the image of the body on the table, and the image of something blurred is
 * blurred.
 *
 * But **not all eight** need to cast it. A shadow pass knows no translucency,
 * it is there or not, so the result is the union of the outlines. The ghosts
 * lie so close together (hundredths of a world unit) and are so large (nearly
 * two) that three copies spread over the chain give the same union as eight.
 * Three cost the shadow pass a sixth of what eight would.
 */
const SHADOW_GHOSTS = 3;
const GHOST_AXIS = new THREE.Vector3();
const GHOST_TURN = new THREE.Quaternion();

/**
 * **The chain gets shorter the fuller the hand.** Eight ghosts per die are a
 * smear for one die and, for twenty, a household of 180 meshes of which 80 go
 * into the shadow pass. A die shrunk to a fifth flying over the stage only
 * smears over a few pixels anyway: what the chain gains there in softness
 * nobody sees, and the phone pays for it all the same.
 */
export function chainLengthFor(dieCount: number): number {
  return dieCount > 6 ? 3 : GHOSTS;
}

/** A translucent copy of a die's material: the same face, drawn as a trace. */
function ghostMaterial(source: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterial {
  const mat = source.clone();
  mat.transparent = true;
  mat.depthWrite = false;
  return mat;
}

/** One chain of ghosts per die: the motion blur of the spin. */
export class GhostTrail {
  private chains: THREE.Mesh[][] = [];
  private materials: THREE.MeshPhysicalMaterial[][] = [];
  /**
   * **Ghost materials wait here between throws, they are not thrown away.**
   *
   * A ghost's material is a copy of its die's, and translucent, which makes
   * it a shader program of its own. When the last material using a program is
   * disposed, the program goes with it, and that is what every throw's end
   * did. The next throw then compiled it again on its first frame: seven
   * milliseconds, at 120 frames a second a frame lost at the very moment the
   * dice leave the hand. Kept by the die material they were copied from, the
   * copies and their program stay.
   */
  private readonly spare = new Map<THREE.Material, THREE.MeshPhysicalMaterial[]>();

  constructor(private readonly scene: THREE.Scene) {}

  clear(): void {
    for (const chain of this.chains) {
      for (const ghost of chain) {
        this.scene.remove(ghost);
        const source = ghost.userData.source as THREE.Material;
        let waiting = this.spare.get(source);
        if (!waiting) {
          waiting = [];
          this.spare.set(source, waiting);
          // A die material given back (a body in a die's colour, `dieVariantAssets`) takes its waiting copies along.
          source.addEventListener('dispose', () => {
            for (const copy of this.spare.get(source) ?? []) copy.dispose();
            this.spare.delete(source);
          });
        }
        waiting.push(ghost.material as THREE.MeshPhysicalMaterial);
      }
    }
    this.chains = [];
    this.materials = [];
  }

  /** Adds the chain of the next die. Ghosts share mesh and textures, not opacity. */
  addChain(assets: DieAssets, length: number): void {
    const chain: THREE.Mesh[] = [];
    const mats: THREE.MeshPhysicalMaterial[] = [];
    for (let g = 0; g < length; g++) {
      const mat = this.spare.get(assets.material)?.pop() ?? ghostMaterial(assets.material);
      mat.opacity = 0;
      const ghost = new THREE.Mesh(assets.geometry, mat);
      ghost.userData.source = assets.material;
      ghost.visible = false;
      // Spread over the chain, not the first three: the shadow should sweep
      // the whole smear, not its start.
      ghost.castShadow = g % Math.ceil(length / SHADOW_GHOSTS) === 0;
      this.scene.add(ghost);
      chain.push(ghost);
      mats.push(mat);
    }
    this.chains.push(chain);
    this.materials.push(mats);
  }

  /** The same pose a little rotation earlier. The spacing is an angle, not a time (see `SMEAR_ARC`). */
  update(index: number, body: THREE.Mesh, anim: DieAnim): void {
    const w = anim.w;
    const speed = Math.hypot(w[0], w[1], w[2]);
    // The chain is as long as it was built (see `chainLengthFor`): the arc
    // spreads over the copies that exist, not over eight imagined ones of
    // which five are missing.
    const chainLength = this.chains[index]?.length ?? 0;
    const trail = speed > BLUR_FROM ? Math.min(chainLength, Math.round(speed / BLUR_FROM) + 2) : 0;
    const step = trail > 0 ? SMEAR_ARC / (trail * speed) : 0;
    for (let g = 0; g < chainLength; g++) {
      const ghost = this.chains[index]?.[g];
      const mat = this.materials[index]?.[g];
      if (ghost === undefined || mat === undefined) continue;
      if (g >= trail) {
        ghost.visible = false;
        continue;
      }
      const back = (g + 1) * step;
      ghost.visible = true;
      GHOST_AXIS.set(w[0] / speed, w[1] / speed, w[2] / speed);
      GHOST_TURN.setFromAxisAngle(GHOST_AXIS, -speed * back);
      ghost.quaternion.copy(GHOST_TURN).multiply(body.quaternion);
      ghost.position.set(anim.p[0] - anim.v[0] * back, anim.p[1] - anim.v[1] * back, anim.p[2] - anim.v[2] * back);
      // The ghosts swell a touch: the smear turns soft instead of looking
      // like stacked prints.
      ghost.scale.setScalar(anim.radius * (1 + (g + 1) * 0.012));
      // The smear fades out instead of breaking off: at the back almost
      // nothing is left.
      mat.opacity = 0.62 * (1 - (g + 1) / (trail + 1)) ** 1.35;
    }
  }
}
