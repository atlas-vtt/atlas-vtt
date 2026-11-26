import { GlTextureSystem } from 'pixi.js';

const pixiContextChange: unknown = Reflect.get(GlTextureSystem.prototype, 'contextChange');

/**
 * PIXI (8.23) forgets which texture each unit holds only for units 0 to 15 when it takes a restored
 * context, but a batch binds up to `maxBatchableTextures` units, 32 on many graphics chips. A unit above
 * 15 still names the texture it held on the lost context, so a batch that binds that texture there again
 * skips the bind: the texture is never uploaded to the new context and the unit draws black. After
 * Obsidian's graphics process died, the map tiles a batch put on those units stayed black until the map
 * was opened again.
 */
function contextChange(this: object, gl: unknown): void {
  Reflect.set(this, '_boundTextures', []);
  if (typeof pixiContextChange === 'function') Reflect.apply(pixiContextChange, this, [gl]);
}

/** A restored context gets every texture a batch draws bound and uploaded anew. Call before a renderer is created. */
export function forgetTextureBindingsWithContext(): void {
  if (Reflect.get(GlTextureSystem.prototype, 'contextChange') === contextChange) return;
  Reflect.set(GlTextureSystem.prototype, 'contextChange', contextChange);
}
