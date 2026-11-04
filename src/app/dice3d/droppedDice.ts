/**
 * Dice a roll did not keep (advantage's extra die, `2d20kh1`) fade once the
 * roll lies, so the eye finds the die that counts. A dropped die is drawn with
 * a translucent copy of its die's material, as a ghost is: the same shader
 * program, so fading compiles nothing, and copies wait for the next throw
 * instead of being thrown away (`GhostTrail.spare` says why).
 */

import type * as THREE from 'three';

import { isRetired } from './dieColours';

/** How opaque a dropped die ends: the table shows through, its number still reads. */
export const DROPPED_OPACITY = 0.32;

interface Dropped {
  mesh: THREE.Mesh;
  source: THREE.MeshPhysicalMaterial;
  copy: THREE.MeshPhysicalMaterial;
}

export class DroppedDice {
  private dropped: Dropped[] = [];
  private readonly spare = new Map<THREE.Material, THREE.MeshPhysicalMaterial[]>();
  private amount = 0;

  /** Draws the die of `mesh` with a copy of its material, which `dim` fades. */
  take(mesh: THREE.Mesh): void {
    const source = mesh.material as THREE.MeshPhysicalMaterial;
    const copy = this.spare.get(source)?.pop() ?? source.clone();
    copy.transparent = true;
    copy.opacity = 1;
    mesh.material = copy;
    this.dropped.push({ mesh, source, copy });
  }

  /** Fades the dropped dice: 0 as thrown, 1 dimmed. Returns whether that changed anything. */
  dim(amount: number): boolean {
    if (amount === this.amount || this.dropped.length === 0) return false;
    this.amount = amount;
    const opacity = 1 - amount * (1 - DROPPED_OPACITY);
    for (const { copy } of this.dropped) copy.opacity = opacity;
    return true;
  }

  /** Gives every die its own material back and keeps the copies for the next throw. */
  clear(): void {
    for (const { mesh, source, copy } of this.dropped) {
      mesh.material = source;
      const waiting = this.spare.get(source) ?? [];
      waiting.push(copy);
      this.spare.set(source, waiting);
    }
    this.dropped = [];
    this.amount = 0;
    // Copies of a coloured die that was let go would keep its atlas alive.
    for (const [source, copies] of this.spare) {
      if (!isRetired(source)) continue;
      for (const copy of copies) copy.dispose();
      this.spare.delete(source);
    }
  }
}
