import { AbstractRenderer } from 'pixi.js';

/** One entry of a renderer's system list, as PIXI's extension registry builds it. */
interface SystemEntry {
  name: string;
  value: new (renderer: unknown) => unknown;
}

interface SystemAdder {
  _addSystem(ClassRef: SystemEntry['value'], name: string): unknown;
}

function addSystems(this: SystemAdder, systems: readonly SystemEntry[]): void {
  for (const { value, name } of systems) this._addSystem(value, name);
}

/**
 * PIXI starts a renderer's systems with `for…in` over their list (`AbstractRenderer._addSystems`, up to 8.22),
 * which also visits every enumerable member something put on `Array.prototype`. A plugin of the vault that
 * adds one by plain assignment (`Array.prototype.sum = …`) therefore made every renderer, WebGL and Canvas
 * alike, fail with "ClassRef is not a constructor", and no map could open until Obsidian restarted.
 * This makes PIXI read the list's entries only. Call it before a renderer is created.
 */
export function addRendererSystemsByEntry(): void {
  if (Reflect.get(AbstractRenderer.prototype, '_addSystems') === addSystems) return;
  Reflect.set(AbstractRenderer.prototype, '_addSystems', addSystems);
}
