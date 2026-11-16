import { EventEmitter } from 'events';
import { describe, expect, it } from 'vitest';
import { followLightingTool } from '../../src/app/pixi/lighting/followLightingTool';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';

function heard(): { bus: EventEmitter; events: [string, unknown][] } {
  const bus = new EventEmitter();
  const events: [string, unknown][] = [];
  for (const name of ['wall-mode-changed', 'wall-submode-changed', 'lighting-preset-changed']) bus.on(name, (value: unknown) => events.push([name, value]));
  return { bus, events };
}

describe('followLightingTool', () => {
  it('tells editors built after the GM chose a mode what the store holds, then every change', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, `follow-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setLightingTool({ mode: 'rooms', drawMode: 'freeform' });
    const { bus, events } = heard();
    const stop = followLightingTool(store, bus);
    expect(events).toEqual([['wall-mode-changed', 'freeform'], ['wall-submode-changed', 'rooms']]);

    events.length = 0;
    store.getState().setLightingTool({ lightPreset: 'lantern' });
    expect(events).toEqual([['lighting-preset-changed', 'lantern']]);
    events.length = 0;
    store.getState().setLightingTool({ mode: 'place-light' });
    expect(events).toEqual([['wall-submode-changed', 'place-light']]);

    stop();
    events.length = 0;
    store.getState().setLightingTool({ mode: 'draw' });
    expect(events).toEqual([]);
  });
});
