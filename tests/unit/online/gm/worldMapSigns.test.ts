import { describe, expect, it } from 'vitest';
import { parseGmMessage, type GmMessage, type MapSign } from '../../../../src/app/online/protocol/index.ts';
import { NO_STRETCH } from '../../../../src/app/grid/mapStretch';
import type { WorldMapSign, WorldMapTree } from '../../../../src/app/online/gm/book/worldMapGate.ts';
import { worldMapOf } from '../../../../src/app/online/gm/book/worldMapLevels.ts';
import { WorldMapSigns } from '../../../../src/app/online/gm/book/worldMapSigns.ts';
import { TableLog } from '../../../../src/app/online/gm/log/TableLog.ts';
import { FoundShare } from '../../../../src/app/online/gm/pins/FoundShare.ts';
import { foundPinKey } from '../../../../src/app/online/gm/pins/foundPinKey.ts';
import { questVault } from '../../../mocks/questVault';
import { fakeStoring } from './fakeStoring.ts';
import { settled } from './settled.ts';

const ANA = 'a'.repeat(20);
const WORLD_SCENE = 'atlas-vtt/collections/Cairn/scenes/World.atlasmap';
const TOWN_SCENE = 'atlas-vtt/collections/Cairn/scenes/Lowmoor.atlasmap';
const ART = { hash: 'a'.repeat(64), size: 10, mime: 'image/webp', id: 'e'.repeat(64) };
const image = (width: number, height: number): { image: typeof ART; width: number; height: number } => ({ image: ART, width, height });

const KEEP: WorldMapSign = { x: 600, y: 300, map: WORLD_SCENE, pin: 'keep', link: 'Places/Keep.md', icon: 'castle' };
const WELL: WorldMapSign = { x: 100, y: 50, map: TOWN_SCENE, pin: 'well', link: 'Places/Well.md', icon: 'number', label: '2' };
const TREE: WorldMapTree = {
  root: 'world',
  levels: [
    { key: 'world', title: 'The Wide World', image: 'world.png', stretch: NO_STRETCH, entrances: [{ x: 10, y: 10, to: 'town' }], signs: [KEEP, { ...KEEP, pin: 'off', x: 5000 }] },
    { key: 'town', title: 'Lowmoor', image: 'town.png', stretch: { x: 2, y: 1 }, entrances: [], signs: [WELL] },
  ],
};
const IDS = new Map([['world', '0'.repeat(24)], ['town', '1'.repeat(24)]]);
const IMAGES = new Map([['world.png', image(1200, 600)], ['town.png', image(400, 100)]]);

let next = 0;
const randomId = (): string => (next++).toString(16).padStart(24, '0');

describe('the readable pins of the world map', () => {
  it('go to players as signs on their maps, by alias and with nothing of the pin or its note', () => {
    const file = worldMapOf(TREE, IDS, IMAGES);
    const signed = new WorldMapSigns(randomId).of(file, new Map())!;
    const [keep] = signed.map.signs ?? [];
    const [well] = signed.map.maps?.[0]?.signs ?? [];
    // The world map's pin at its middle; one off the image is no sign. Lowmoor's scene draws its map twice as wide.
    expect(keep).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), x: 0.5, y: 0.5, icon: 'castle', found: null });
    expect(well).toEqual({ id: expect.stringMatching(/^[0-9a-f]{24}$/), x: 0.125, y: 0.5, icon: 'number', label: '2', found: null });
    expect(signed.map.signs).toHaveLength(1);
    const text = JSON.stringify(signed.map);
    for (const secret of ['Keep', 'Well', 'keep"', 'well"', 'atlasmap']) expect(text).not.toContain(secret);
    const read = parseGmMessage({ t: 'book-map', worldMap: signed.map });
    expect(read?.t === 'book-map' ? read.worldMap : null).toEqual(signed.map);
  });

  it('keep their aliases while the table runs, show who found them, and are known only while handed out', () => {
    const signs = new WorldMapSigns(randomId);
    const file = worldMapOf(TREE, IDS, IMAGES);
    const first = signs.of(file, new Map())!.map.signs![0]!;
    const entry = 'f'.repeat(24);
    const again = signs.of(worldMapOf(TREE, IDS, IMAGES), new Map([[foundPinKey(WORLD_SCENE, 'keep'), entry]]))?.map.signs![0] as MapSign;
    expect(again).toEqual({ ...first, found: entry });
    expect(signs.sign(first.id)).toEqual(KEEP);
    expect(signs.sign('9'.repeat(24))).toBeNull();
    // Without a world map, none is known.
    expect(signs.of(null, new Map())).toBeNull();
    expect(signs.sign(first.id)).toBeNull();
  });

  it('are found by a player at the table as a pin of the table is: the log holds the note to read, and a second open finds the same entry', async () => {
    const vault = questVault({ 'Places/Keep.md': '---\nsecret: yes\n---\nThe keep stands on a hill. %% a trapdoor %%' });
    const sent: { body: GmMessage; to: string | undefined }[] = [];
    const log = new TableLog({
      send: (body, to) => void sent.push({ body, to }), clock: () => 1, now: () => 0, randomId,
      nameOf: (player) => (player === ANA ? 'Ana' : null), setTimer: () => 0, clearTimer: () => undefined, changed: () => undefined,
    });
    log.welcome([{ id: ANA, name: 'Ana' }]);
    const signs = new WorldMapSigns(randomId);
    const alias = signs.of(worldMapOf(TREE, IDS, IMAGES), new Map())!.map.signs![0]!.id;
    let told = 0;
    const found = new FoundShare(log, {
      app: vault.app, send: (body, to) => void sent.push({ body, to }), now: () => 0, nameOf: (player) => (player === ANA ? 'Ana' : null),
      stored: fakeStoring(), layers: () => null, sign: (id) => signs.sign(id), found: () => void told++,
    });
    found.start();
    expect(found.receive(ANA, { t: 'sign-found', sign: alias })).toBe(true);
    await settled();
    const entry = found.entryOf(WORLD_SCENE, 'keep');
    expect(entry).not.toBeNull();
    expect(found.foundPins()).toEqual(new Map([[foundPinKey(WORLD_SCENE, 'keep'), entry]]));
    expect(told).toBe(1);
    const logged = log.entries().find((each) => each.id === entry);
    expect(logged?.kind === 'found' ? logged.body : '').toContain('The keep stands on a hill.');
    expect(JSON.stringify(sent)).not.toContain('trapdoor');
    // A sign nobody was handed, and a stranger, find nothing.
    found.receive(ANA, { t: 'sign-found', sign: '9'.repeat(24) });
    found.receive('stranger', { t: 'sign-found', sign: alias });
    await settled();
    expect(log.entries().filter((each) => each.kind === 'found')).toHaveLength(1);
    found.stop();
  });
});
