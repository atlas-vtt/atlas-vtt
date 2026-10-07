import { describe, expect, it } from 'vitest';
import { beamOf } from '../../src/app/lighting/lightBeam';
import { lightList, readLight, readWall } from '../../src/app/lighting/lightingObjects';
import { MAX_LIGHT_ZONES, MAX_ZONE_CORNERS, lightZoneList } from '../../src/app/lighting/lightZones';
import { activeLights, engineLight } from '../../src/app/vision/lightSources';
import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { wallList } from '../../src/app/vision/wallList';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const EMISSION = { bright: 20, dim: 40, color: '#ffffff', intensity: 1, animation: 'none' };
const SCALE = { unitDistance: 5, cellSize: 70 };
const zone = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'light-zone', polygon: SQUARE, ambient: 0.5, ...changes });
const light = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'light', x: 10, y: 10, emission: EMISSION, ...changes });
const door = (id: string, changes: Record<string, unknown> = {}): Record<string, unknown> => ({ id, kind: 'wall', type: 'door', closed: true, p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 }, ...changes });
const round = (corners: number): { x: number; y: number }[] => Array.from({ length: corners }, (_, i) => ({ x: Math.cos((i / corners) * Math.PI * 2) * 100, y: Math.sin((i / corners) * Math.PI * 2) * 100 }));

/** The objects of a map file with these in it, as a load brings them into the store. */
function load(objects: Record<string, unknown>): ReturnType<typeof migrateMapFile>['objects'] {
  return migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, ...objects } }).objects;
}

function storeWith(objects: ReturnType<typeof load>): ViewAtlasStore {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `lighting-from-file-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.setState({ objects });
  return store;
}

describe('light zones of a map file', () => {
  it('stay in the store as the file has them, so the next save writes them back: fields of a newer Atlas, surplus zones, zones this Atlas cannot draw', () => {
    const lightZones = {
      newer: zone('newer', { falloff: 'soft', schedule: { from: 'dusk' } }),
      wide: zone('wide', { polygon: round(MAX_ZONE_CORNERS + 1) }),
      line: zone('line', { polygon: SQUARE.slice(0, 2) }),
      text: 'a zone',
      'key-of-its-own': zone('another-id'),
      ...Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`z${i}`, zone(`z${i}`)])),
    };
    const copy = JSON.parse(JSON.stringify(lightZones)) as unknown;
    expect(load({ lightZones }).lightZones).toEqual(copy);
  });

  it('are read as the first that are zones, a level and an area each: the rest is passed over, not removed', () => {
    const lightZones = {
      line: zone('line', { polygon: SQUARE.slice(0, 2) }),
      broken: zone('broken', { polygon: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }] }),
      flat: zone('flat', { polygon: [{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }] }),
      dusk: zone('dusk', { ambient: 'dusk' }),
      wide: zone('wide', { polygon: round(MAX_ZONE_CORNERS + 1) }),
      text: 'a zone',
      bright: zone('bright', { ambient: 7, ambientColor: 'red', falloff: 'soft' }),
      ...Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`z${i}`, zone(`z${i}`)])),
    };
    const list = lightZoneList(load({ lightZones }).lightZones);
    expect(list).toHaveLength(MAX_LIGHT_ZONES);
    expect(list.map((z) => z.id).slice(0, 3)).toEqual(['bright', 'z0', 'z1']);
    expect(list[0]).toEqual({ id: 'bright', kind: 'light-zone', polygon: SQUARE, ambient: 1 });
  });

  it('are named by where they are in the record, which is how the store finds them', () => {
    const store = storeWith(load({ lightZones: { 'key-of-its-own': zone('another-id') } }));
    const [read] = lightZoneList(store.getState().objects.lightZones);
    expect(read!.id).toBe('key-of-its-own');
    store.getState().updateLightZone(read!.id, { ambient: 0.9 });
    expect(lightZoneList(store.getState().objects.lightZones)[0]!.ambient).toBe(0.9);
    store.getState().deleteLightZone(read!.id);
    expect(lightZoneList(store.getState().objects.lightZones)).toEqual([]);
  });

  it.each([['a text', 'text'], ['a number', 5], ['true', true], ['a list', [zone('z')]]])('are none when the file holds %s in their place, and a zone can be drawn afterwards', (_name, value) => {
    const objects = load({ lightZones: value });
    expect(objects.lightZones).toBeUndefined();
    const store = storeWith(objects);
    const id = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
    expect(lightZoneList(store.getState().objects.lightZones).map((z) => z.id)).toEqual([id]);
  });

  it('can be added to whatever the store holds in their place', () => {
    for (const strange of ['text', 5, [zone('z')]]) {
      const store = storeWith({ ...load({}), lightZones: strange as never });
      const id = store.getState().addLightZone({ polygon: SQUARE, ambient: 0 });
      expect(lightZoneList(store.getState().objects.lightZones).map((z) => z.id)).toEqual([id]);
    }
  });
});

describe('lights and walls of a map file', () => {
  const lights = {
    spun: light('spun', { rotation: 'abc', emission: { ...EMISSION, angle: 60 } }),
    odd: light('odd', { rotation: Number.NaN, emission: { ...EMISSION, priority: 'high', darkness: 'false', glow: 3 } }),
    endless: light('endless', { rotation: Infinity, emission: { ...EMISSION, priority: Number.NaN, darkness: 1 } }),
    good: light('good', { rotation: 90, activeBelowAmbient: 0.5, hidden: true, emission: { ...EMISSION, angle: 53, priority: 1, darkness: true, kind: 'darkness' } }),
  };

  it('stay in the store as the file has them', () => {
    const copy = JSON.parse(JSON.stringify(lights)) as Record<string, unknown>;
    // JSON has no NaN or Infinity; what a file can hold is what is compared.
    const loaded = JSON.parse(JSON.stringify(load({ lights: JSON.parse(JSON.stringify(lights)) }).lights)) as unknown;
    expect(loaded).toEqual(copy);
    const walls = { text: door('text', { locked: 'false' }), newer: door('newer', { hinge: 'left' }) };
    expect(load({ walls }).walls).toEqual(walls);
  });

  it('are read without a rotation, a priority or a darkness that is not a number, a number and true', () => {
    const loaded = load({ lights }).lights;
    expect(readLight(loaded.spun)).toEqual(light('spun', { emission: { ...EMISSION, angle: 60 } }));
    expect(readLight(loaded.odd)).toEqual(light('odd', { emission: { ...EMISSION, glow: 3 } }));
    expect(readLight(loaded.endless)).toEqual(light('endless'));
    // A light with nothing wrong is read as the object the store holds, and the same view each time otherwise.
    expect(readLight(loaded.good)).toBe(loaded.good);
    expect(readLight(loaded.odd)).toBe(readLight(loaded.odd));
    expect(lightList(loaded).map((read) => read.id)).toEqual(['spun', 'odd', 'endless', 'good']);
    expect(lightList(loaded)).toBe(lightList(loaded));
  });

  it('shine by what was read: a rotation of text faces up, a darkness of "false" is a light', () => {
    const loaded = load({ lights }).lights;
    const shining = activeLights(loaded, {}, 0);
    expect(beamOf(shining[0]!)?.facing).toBeCloseTo(-Math.PI / 2, 9);
    const odd = engineLight(shining[1]!, SCALE);
    expect(odd.darkness).toBeUndefined();
    expect(odd.priority).toBeUndefined();
    expect(engineLight({ key: 'good', x: 10, y: 10, emission: readLight(loaded.good)!.emission }, SCALE)).toMatchObject({ darkness: true, priority: 1 });
  });

  it('read the light a token carries the same way', () => {
    const { tokens } = load({ tokens: { t: { id: 't', kind: 'token', imagePath: 't.png', x: 0, y: 0, light: { ...EMISSION, priority: '1', darkness: 'false' } } } });
    expect(tokens.t!.light).toEqual({ ...EMISSION, priority: '1', darkness: 'false' });
    const [carried] = activeLights({}, tokens, 0);
    expect(engineLight(carried!, SCALE)).not.toHaveProperty('darkness');
    expect(engineLight(carried!, SCALE)).not.toHaveProperty('priority');
  });

  it('keep a door locked only where the file says true', () => {
    const { walls } = load({ walls: { text: door('text', { locked: 'false' }), one: door('one', { locked: 1 }), locked: door('locked', { locked: true }), plain: door('plain') } });
    expect(readWall(walls.text)).toEqual(door('text'));
    expect(readWall(walls.one)).toEqual(door('one'));
    expect(readWall(walls.locked)).toBe(walls.locked);
    expect(readWall(walls.plain)).toBe(walls.plain);
    expect(wallList(walls).map((wall) => !!wall.locked)).toEqual([false, false, true, false]);
    // The door the file locked with a text opens like any other.
    const store = storeWith(load({ walls: { text: door('text', { locked: 'false' }) } }));
    store.getState().toggleDoor('text');
    expect(store.getState().objects.walls.text!.closed).toBe(false);
  });

  it('are none when the file holds something else in their place', () => {
    expect(load({ lights: 'lights', walls: 7 })).toMatchObject({ lights: {}, walls: {} });
  });
});

