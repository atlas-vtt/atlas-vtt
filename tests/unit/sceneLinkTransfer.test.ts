import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { transferAssets } from '../../src/app/services/assetTransfer/assetTransfer';
import { linkedScenesFor, scenesToBringAlong } from '../../src/app/services/assetTransfer/linkedScenes';
import type { TransferMode } from '../../src/app/services/assetTransfer/transferPlan';
import { mayLinkFromScene, sceneLinkTarget } from '../../src/app/services/sceneLinks';
import { createSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';


const SOURCE = 'atlas-vtt/collections/source';
const TARGET = 'atlas-vtt/collections/target';
const scenePath = (collection: string, name: string): string => `${collection}/scenes/${name}.atlasmap`;
const NOTE = 'Notes/Tavern.md';

/** Hub → Cave → Lair, Tower → Hub; every scene also has a pin to a note. */
const LINKS: Record<string, string[]> = { Hub: ['Cave'], Cave: ['Lair'], Lair: [], Tower: ['Hub'] };

const mapFile = (links: readonly string[]): string => {
  const pins: Record<string, unknown> = { note: { id: 'note', kind: 'pin', x: 0, y: 0, notePath: NOTE } };
  for (const name of links) pins[name] = { id: name, kind: 'pin', x: 0, y: 0, notePath: scenePath(SOURCE, name) };
  return JSON.stringify({
    version: 4,
    state: { schema: 'atlas-vtt', version: 4, background: null, grid: null, camera: { x: 0, y: 0, scale: 1 }, objects: { tokens: {}, pins, fog: {}, texts: {}, drawings: {}, walls: {}, lights: {} } },
  }, null, 2);
};

interface Vault { vault: InMemoryApp; assets: AssetService; ids: Record<string, string> }

async function linkedVault(): Promise<Vault> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.createCollection('target');
  const ids: Record<string, string> = {};
  for (const [name, links] of Object.entries(LINKS)) {
    await vault.app.vault.create(scenePath(SOURCE, name), mapFile(links));
    ids[name] = (await assets.addAsset({ type: 'scene', name, collection: 'source', tags: [], data: { mapPath: scenePath(SOURCE, name) } })).id;
  }
  return { vault, assets, ids };
}

const transfer = (vault: Vault, names: string[], mode: TransferMode): Promise<unknown> =>
  transferAssets(vault.vault.app, vault.assets, { assetIds: names.map((name) => vault.ids[name]!), targetCollectionId: 'target', mode });

const pinLinks = (vault: Vault, path: string): string[] => {
  const { state } = JSON.parse(vault.vault.files.get(path)!) as { state: { objects: { pins: Record<string, { notePath: string }> } } };
  return Object.values(state.objects.pins).map((pin) => pin.notePath);
};

const offered = async (vault: Vault, names: string[], mode: TransferMode): Promise<string[]> =>
  (await linkedScenesFor(vault.vault.app, vault.assets, names.map((name) => vault.ids[name]!), 'target', mode)).map((scene) => scene.name).sort();

beforeEach(() => { AssetService.resetInstance(); });

describe('scene links between collections', () => {
  it('allows links to notes anywhere and to scenes of the same collection only', () => {
    const map = scenePath(SOURCE, 'Hub');
    expect(mayLinkFromScene(map, `${NOTE}#Cellar`)).toBe(true);
    expect(mayLinkFromScene(map, scenePath(SOURCE, 'Cave'))).toBe(true);
    expect(mayLinkFromScene(map, scenePath(TARGET, 'Cave'))).toBe(false);
  });

  it('follows an older link into another collection to the same place in its own', () => {
    expect(sceneLinkTarget(scenePath(TARGET, 'Hub'), scenePath(SOURCE, 'Cave'))).toBe(scenePath(TARGET, 'Cave'));
    expect(sceneLinkTarget(scenePath(TARGET, 'Hub'), scenePath(TARGET, 'Cave'))).toBe(scenePath(TARGET, 'Cave'));
    expect(sceneLinkTarget('Maps/Old.atlasmap', scenePath(SOURCE, 'Cave'))).toBeNull();
  });

  it('brings along what copies link to, and on a move also what links to the moved scenes', () => {
    const graph = new Map(Object.entries(LINKS).map(([name, links]) => [name, new Set(links)]));
    expect(scenesToBringAlong(graph, ['Hub'], 'copy').sort()).toEqual(['Cave', 'Lair']);
    expect(scenesToBringAlong(graph, ['Lair'], 'copy')).toEqual([]);
    expect(scenesToBringAlong(graph, ['Lair'], 'move').sort()).toEqual(['Cave', 'Hub', 'Tower']);
  });

  it('offers the linked scenes of the source collection', async () => {
    const vault = await linkedVault();
    expect(await offered(vault, ['Hub'], 'copy')).toEqual(['Cave', 'Lair']);
    expect(await offered(vault, ['Hub', 'Cave'], 'copy')).toEqual(['Lair']);
    expect(await offered(vault, ['Cave'], 'move')).toEqual(['Hub', 'Lair', 'Tower']);
  });

  it('keeps the links of scenes copied together, pointing at the copies', async () => {
    const vault = await linkedVault();

    await transfer(vault, ['Hub', 'Cave', 'Lair'], 'copy');

    expect(pinLinks(vault, scenePath(TARGET, 'Hub'))).toEqual([NOTE, scenePath(TARGET, 'Cave')]);
    expect(pinLinks(vault, scenePath(TARGET, 'Cave'))).toEqual([NOTE, scenePath(TARGET, 'Lair')]);
    expect(pinLinks(vault, scenePath(SOURCE, 'Hub'))).toEqual([NOTE, scenePath(SOURCE, 'Cave')]);
  });

  it('removes the links of a copy to scenes that stay behind, in its map and snapshots', async () => {
    const vault = await linkedVault();
    const snapshot = createSnapshot(JSON.parse(mapFile(['Cave'])) as never, 'snap1', 'Start', 1000);
    await vault.vault.app.vault.create(`${sceneSnapshotFolder('source', vault.ids.Hub!)}/snap1.json`, JSON.stringify(snapshot));

    await transfer(vault, ['Hub'], 'copy');

    const copy = (await vault.assets.getAssets('target', 'scene'))[0]!;
    expect(pinLinks(vault, scenePath(TARGET, 'Hub'))).toEqual([NOTE]);
    expect(pinLinks(vault, `${sceneSnapshotFolder('target', copy.id)}/snap1.json`)).toEqual([NOTE]);
    expect(pinLinks(vault, `${sceneSnapshotFolder('source', vault.ids.Hub!)}/snap1.json`)).toEqual([NOTE, scenePath(SOURCE, 'Cave')]);
    expect(pinLinks(vault, scenePath(SOURCE, 'Hub'))).toEqual([NOTE, scenePath(SOURCE, 'Cave')]);
  });

  it('removes the links between a moved scene and the scenes staying behind', async () => {
    const vault = await linkedVault();
    const snapshot = createSnapshot(JSON.parse(mapFile(['Cave'])) as never, 'snap1', 'Start', 1000);
    await vault.vault.app.vault.create(`${sceneSnapshotFolder('source', vault.ids.Hub!)}/snap1.json`, JSON.stringify(snapshot));
    await vault.vault.app.vault.create(`${sceneSnapshotFolder('source', vault.ids.Cave!)}/snap2.json`, JSON.stringify({ ...snapshot, id: 'snap2' }));

    await transfer(vault, ['Cave'], 'move');

    expect(pinLinks(vault, scenePath(TARGET, 'Cave'))).toEqual([NOTE]);
    expect(pinLinks(vault, scenePath(SOURCE, 'Hub'))).toEqual([NOTE]);
    expect(pinLinks(vault, `${sceneSnapshotFolder('source', vault.ids.Hub!)}/snap1.json`)).toEqual([NOTE]);
    // The moved scene's own snapshot went along with it, under the same id.
    expect(vault.vault.files.has(`${sceneSnapshotFolder('target', vault.ids.Cave!)}/snap2.json`)).toBe(true);
    expect(pinLinks(vault, scenePath(SOURCE, 'Tower'))).toEqual([NOTE, scenePath(SOURCE, 'Hub')]);
  });
});
