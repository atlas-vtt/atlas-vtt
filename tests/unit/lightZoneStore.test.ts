import { describe, expect, it } from 'vitest';
import { MAX_ZONE_CORNERS, lightZoneList } from '../../src/app/lighting/lightZones';
import { areaHandlePoint as zoneHandlePoint } from '../../src/app/vision/polygonArea';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { LightZone } from '../../src/app/types/lightingTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];

function setup(): { store: ViewAtlasStore; steps: () => number; undo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `light-zones-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/zones.atlasmap');
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return { store, steps: () => history.getState().pastStates.length, undo: () => history.getState().undo() };
}

describe('light zones in the store', () => {
  it('are map geometry: added, changed and deleted with one undo step each', () => {
    const { store, steps, undo } = setup();
    expect(store.getState().objects.lightZones).toBeUndefined();
    const id = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
    expect(store.getState().objects.lightZones![id]).toEqual({ id, kind: 'light-zone', polygon: SQUARE, ambient: 0 });
    expect(steps()).toBe(1);
    store.getState().updateLightZone(id, { ambient: 0.5, name: 'Cave' });
    expect(store.getState().objects.lightZones![id]).toMatchObject({ ambient: 0.5, name: 'Cave' });
    expect(steps()).toBe(2);
    store.getState().deleteLightZone(id);
    expect(lightZoneList(store.getState().objects.lightZones)).toEqual([]);
    expect(steps()).toBe(3);
    undo();
    expect(lightZoneList(store.getState().objects.lightZones)).toHaveLength(1);
  });

  it('keep the order they were drawn in, later zones over earlier ones', () => {
    const { store } = setup();
    const first = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
    const second = store.getState().addLightZone({ polygon: SQUARE, ambient: 1 });
    expect(lightZoneList(store.getState().objects.lightZones).map((zone) => zone.id)).toEqual([first, second]);
  });

  it('close the zone popover when its zone goes, and with the light popover open only one of the two shows', () => {
    const { store } = setup();
    const id = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
    store.getState().openLightZonePopover(id);
    expect(store.getState().lightZonePopover).toBe(id);
    store.getState().deleteLightZone(id);
    expect(store.getState().lightZonePopover).toBeNull();
    const light = store.getState().addLight({ x: 0, y: 0, emission: { bright: 1, dim: 2, color: '#ffffff', intensity: 1, animation: 'none' } });
    store.getState().openLightPopover(light);
    store.getState().openLightZonePopover(store.getState().addLightZone({ polygon: SQUARE, ambient: 0 }));
    expect(store.getState().lightPopover).toBeNull();
  });
});

describe('light zones as read from a map file', () => {
  const zone = (overrides: Partial<LightZone>): LightZone => ({ id: 'z', kind: 'light-zone', polygon: SQUARE, ambient: 0.5, ...overrides });

  it('are none in a file from before zones, and survive a load', () => {
    expect(migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {} } }).objects.lightZones).toBeUndefined();
    const loaded = migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, lightZones: { z: zone({}) } } });
    expect(lightZoneList(loaded.objects.lightZones)).toEqual([zone({})]);
  });

  it('drop a zone that is no area, and bring a level and a colour a hand edit broke back into range', () => {
    const zones = {
      line: zone({ id: 'line', polygon: SQUARE.slice(0, 2) }),
      broken: zone({ id: 'broken', polygon: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }] }),
      bright: zone({ id: 'bright', ambient: 7, ambientColor: 'red' }),
      odd: zone({ id: 'odd', ambient: 'dusk' as never }),
    };
    expect(lightZoneList(zones)).toEqual([zone({ id: 'bright', ambient: 1 })]);
    expect(lightZoneList(undefined)).toEqual([]);
    expect(lightZoneList('zones' as never)).toEqual([]);
  });

  it('drop a zone with more corners than the engine reads: its outline is a list of 64', () => {
    const round = (corners: number): { x: number; y: number }[] => Array.from({ length: corners }, (_, i) => ({ x: Math.cos((i / corners) * Math.PI * 2) * 100, y: Math.sin((i / corners) * Math.PI * 2) * 100 }));
    expect(MAX_ZONE_CORNERS).toBe(64);
    const zones = { most: zone({ id: 'most', polygon: round(64) }), more: zone({ id: 'more', polygon: round(65) }), many: zone({ id: 'many', polygon: round(500) }) };
    expect(lightZoneList(zones).map(({ id }) => id)).toEqual(['most']);
  });

  it('are the same list while the record is the same', () => {
    const zones = { z: zone({}) };
    expect(lightZoneList(zones)).toBe(lightZoneList(zones));
  });
});

describe('a zone\'s handle', () => {
  it('sits in the middle of the zone, and inside it when the zone bends around its middle', () => {
    expect(zoneHandlePoint(SQUARE)).toEqual({ x: 50, y: 50 });
    // An L: its centroid (100/3 …) lies inside; a U's does not.
    const u = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 90 }, { x: 70, y: 90 }, { x: 70, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    const handle = zoneHandlePoint(u);
    expect(handle.x < 30 || handle.x > 70 || handle.y > 90).toBe(true);
  });
});
