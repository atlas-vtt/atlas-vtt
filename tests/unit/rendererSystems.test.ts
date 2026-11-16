import { AbstractRenderer, type SharedRendererOptions } from 'pixi.js';
import { afterEach, describe, expect, it } from 'vitest';
import { addRendererSystemsByEntry } from '../../src/app/pixi/utils/rendererSystems';

class ProbeSystem {
  destroy(): void {}
}

class ProbeRenderer extends AbstractRenderer<object, SharedRendererOptions, HTMLCanvasElement> {
  constructor() {
    super({ type: 0b0001, name: 'probe', systems: [{ name: 'probe', value: ProbeSystem }], renderPipes: [], renderPipeAdaptors: [] });
  }
}

declare global {
  interface Array<T> {
    /** What a plugin of the vault adds by plain assignment (DnD Beyond Importer for Atlas: `Array.prototype.sum = …`). */
    atlasTestSum?: () => number;
  }
}

function addEnumerableArrayMember(): void {
  Array.prototype.atlasTestSum = function (): number { return 0; };
}

describe('addRendererSystemsByEntry', () => {
  afterEach(() => {
    delete Array.prototype.atlasTestSum;
  });

  it('starts a renderer while another plugin has put an enumerable member on Array.prototype', async () => {
    addEnumerableArrayMember();
    addRendererSystemsByEntry();
    const renderer = new ProbeRenderer();

    await renderer.init({ skipExtensionImports: true });

    expect(Reflect.get(renderer, 'probe')).toBeInstanceOf(ProbeSystem);
  });
});
