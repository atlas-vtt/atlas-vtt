import { describe, expect, it } from 'vitest';
import { TFile, TFolder, type App, type TAbstractFile } from 'obsidian';
import { CAMPAIGNS_FOLDER } from '../../src/app/campaigns/campaignPaths';
import { currentMapPath, floorMemoryFolder, followMapMemories, mapMemoryFolder, trashMapMemories, trashPlayerMemories } from '../../src/app/campaigns/exploredFolders';

const ANA = 'a'.repeat(20);
const BEN = 'b'.repeat(20);
const WEST = `${CAMPAIGNS_FOLDER}/West Marches`;
const CURSE = `${CAMPAIGNS_FOLDER}/Curse`;

/** A vault of paths: every folder and file, which renames and the trash change; `trashed` lists what went to the trash. */
function vault(files: readonly string[]): { readonly app: App; readonly files: () => string[]; readonly trashed: string[] } {
  const paths = new Set<string>();
  const add = (path: string): void => {
    for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) paths.add(`${path.slice(0, at)}/`);
    paths.add(path);
  };
  files.forEach(add);
  const trashed: string[] = [];
  const isFolder = (path: string): boolean => paths.has(`${path}/`);
  const item = (path: string): TAbstractFile | null => {
    if (isFolder(path)) {
      const folder = new TFolder(path);
      const rest = (other: string): string => other.slice(path.length + 1).replace(/\/$/, '');
      folder.children = [...paths].filter((other) => other.startsWith(`${path}/`) && rest(other) !== '' && !rest(other).includes('/')).map((child) => item(child.replace(/\/$/, ''))!);
      return folder;
    }
    return paths.has(path) ? new TFile(path) : null;
  };
  const under = (path: string): string[] => [...paths].filter((other) => other === path || other.startsWith(`${path}/`));
  const app = {
    vault: {
      getAbstractFileByPath: item,
      getFolderByPath: (path: string) => (isFolder(path) ? item(path) : null),
      adapter: { exists: (path: string) => Promise.resolve(paths.has(path) || isFolder(path)) },
    },
    fileManager: {
      renameFile: (from: TAbstractFile, to: string) => {
        for (const path of under(from.path)) {
          paths.delete(path);
          add(to + path.slice(from.path.length));
        }
        return Promise.resolve();
      },
      trashFile: (target: TAbstractFile) => {
        trashed.push(target.path);
        for (const path of under(target.path)) paths.delete(path);
        return Promise.resolve();
      },
    },
  } as unknown as App;
  return { app, files: () => [...paths].filter((path) => !path.endsWith('/')).sort(), trashed };
}

const memory = (campaign: string, mapPath: string, level: string | null, player: string): string => `${floorMemoryFolder(campaign, mapPath, level)}/${player}.png`;

describe('what players explored of a map, in the campaigns\' folders', () => {
  it('follows the map renamed or moved, every floor of it, in every campaign that keeps any', async () => {
    const kept = [memory(WEST, 'Scenes/Cave.atlasmap', null, ANA), memory(WEST, 'Scenes/Tower.atlasmap', 'top', ANA), memory(WEST, 'Scenes/Tower.atlasmap', 'cellar', BEN), memory(CURSE, 'Scenes/Tower.atlasmap', 'top', BEN)];
    const { app, files } = vault([`${WEST}/campaign.json`, `${CURSE}/campaign.json`, ...kept]);
    await followMapMemories(app, [{ from: 'Scenes/Tower.atlasmap', to: 'Old/Spire.atlasmap' }]);
    expect(files()).toEqual([
      `${WEST}/campaign.json`, `${CURSE}/campaign.json`,
      memory(WEST, 'Scenes/Cave.atlasmap', null, ANA), memory(WEST, 'Old/Spire.atlasmap', 'top', ANA), memory(WEST, 'Old/Spire.atlasmap', 'cellar', BEN), memory(CURSE, 'Old/Spire.atlasmap', 'top', BEN),
    ].sort());
  });

  it('sends a memory written later for the path the map left to where it went, and keeps that one where both were written', async () => {
    const { app, files, trashed } = vault([`${WEST}/campaign.json`, memory(WEST, 'Scenes/Cave.atlasmap', null, ANA), memory(WEST, 'Scenes/Cave.atlasmap', null, BEN)]);
    const following = followMapMemories(app, [{ from: 'Scenes/Cave.atlasmap', to: 'Scenes/Grotto.atlasmap' }]);
    // A running table writes Ana's memory meanwhile: it is kept where the map is now.
    expect(currentMapPath(app, 'Scenes/Cave.atlasmap')).toBe('Scenes/Grotto.atlasmap');
    await following;
    expect(currentMapPath(app, 'Scenes/Elsewhere.atlasmap')).toBe('Scenes/Elsewhere.atlasmap');
    expect(files()).toEqual([`${WEST}/campaign.json`, memory(WEST, 'Scenes/Grotto.atlasmap', null, ANA), memory(WEST, 'Scenes/Grotto.atlasmap', null, BEN)].sort());
    const merged = vault([`${WEST}/campaign.json`, memory(WEST, 'Scenes/Cave.atlasmap', null, ANA), memory(WEST, 'Scenes/Cave.atlasmap', null, BEN), memory(WEST, 'Scenes/Grotto.atlasmap', null, ANA)]);
    await followMapMemories(merged.app, [{ from: 'Scenes/Cave.atlasmap', to: 'Scenes/Grotto.atlasmap' }]);
    expect(merged.files()).toEqual([`${WEST}/campaign.json`, memory(WEST, 'Scenes/Grotto.atlasmap', null, ANA), memory(WEST, 'Scenes/Grotto.atlasmap', null, BEN)].sort());
    // The older of Ana's two goes to the trash, and the folders the move emptied.
    expect(merged.trashed[0]).toBe(memory(WEST, 'Scenes/Cave.atlasmap', null, ANA));
    expect(merged.trashed.at(-1)).toBe(mapMemoryFolder(WEST, 'Scenes/Cave.atlasmap'));
    expect(merged.trashed.some((path) => path.startsWith(mapMemoryFolder(WEST, 'Scenes/Grotto.atlasmap')))).toBe(false);
    expect(trashed).toEqual([]);
  });

  it('follows a map renamed back to where it was', async () => {
    const { app } = vault([`${WEST}/campaign.json`]);
    await followMapMemories(app, [{ from: 'A.atlasmap', to: 'B.atlasmap' }]);
    await followMapMemories(app, [{ from: 'B.atlasmap', to: 'A.atlasmap' }]);
    expect(currentMapPath(app, 'A.atlasmap')).toBe('A.atlasmap');
    expect(currentMapPath(app, 'B.atlasmap')).toBe('A.atlasmap');
  });

  it('goes to the trash with a deleted scene, in every campaign, and a player\'s with the player', async () => {
    const { app, files, trashed } = vault([memory(WEST, 'Scenes/Cave.atlasmap', null, ANA), memory(CURSE, 'Scenes/Cave.atlasmap', null, ANA), memory(WEST, 'Scenes/Tower.atlasmap', 'top', ANA), memory(WEST, 'Scenes/Tower.atlasmap', 'top', BEN)]);
    await trashMapMemories(app, 'Scenes/Cave.atlasmap');
    expect(trashed).toEqual([mapMemoryFolder(WEST, 'Scenes/Cave.atlasmap'), mapMemoryFolder(CURSE, 'Scenes/Cave.atlasmap')]);
    await trashPlayerMemories(app, WEST, ANA);
    expect(files()).toEqual([memory(WEST, 'Scenes/Tower.atlasmap', 'top', BEN)]);
  });
});
