import { GlUniformGroupSystem } from 'pixi.js';

const pixiContextChange: unknown = Reflect.get(GlUniformGroupSystem.prototype, 'contextChange');

/**
 * PIXI (8.23) keeps the uniform upload function it made for each program across a restored context
 * (`_uniformGroupSyncHash`, keyed by the program), though it links every program anew on that context.
 * A function made from a program linked while the context died uploads nothing: Chromium reports a
 * context whose graphics process died as lost only about half a second later, every link meanwhile
 * fails, and PIXI reads no uniforms from a failed one. Kept, such functions leave the map's draws
 * without projection, colour or textures after the restore: the view is black until the map is opened again.
 */
function contextChange(this: object, gl: unknown): void {
  if (typeof pixiContextChange === 'function') Reflect.apply(pixiContextChange, this, [gl]);
  Reflect.set(this, '_uniformGroupSyncHash', {});
}

/** A restored context gets uniform upload functions made from its own programs. Call before a renderer is created. */
export function forgetUniformUploadsWithContext(): void {
  if (Reflect.get(GlUniformGroupSystem.prototype, 'contextChange') === contextChange) return;
  Reflect.set(GlUniformGroupSystem.prototype, 'contextChange', contextChange);
}
