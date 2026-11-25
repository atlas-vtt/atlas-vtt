import { TFile, type App } from 'obsidian';
import { campaignFolderOf } from '../../../campaigns/campaignPaths';
import { CampaignFiles } from '../../../campaigns/CampaignFiles';
import { currentMapPath, floorMemoryFolder, trashPlayerMemories } from '../../../campaigns/exploredFolders';
import type { MemoryFloor, MemoryPng, MemoryStore } from './memoryPorts.ts';
import { readMemoryFile, removeMemoryFile, writeMemoryFile } from './vaultMemoryFiles.ts';

/** A player id as the campaign's players file names them, which makes a file name. */
const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Players' explored memories in the played campaign's folder, beside its `players.json` (`floorMemoryFolder`).
 * The files follow the campaign's folder and the map's path when either is renamed, go with the campaign or
 * the scene when it is deleted, and sync like the campaign's other files. A campaign without a folder keeps nothing,
 * and nothing is written for a player who is no longer one of its players (`isPlayer`): their files went with them.
 */
export class VaultMemoryStore implements MemoryStore {
  constructor(private readonly app: App, private readonly campaignId: string, private readonly isPlayer: (player: string) => boolean) {}

  read(floor: MemoryFloor, player: string): Promise<MemoryPng | null> {
    const path = this.pathOf(floor, player);
    return path === null ? Promise.resolve(null) : readMemoryFile(this.app, path);
  }

  async write(floor: MemoryFloor, player: string, png: MemoryPng): Promise<void> {
    const path = this.pathOf(floor, player);
    if (path !== null && this.isPlayer(player)) await writeMemoryFile(this.app, path, png);
  }

  players(floor: MemoryFloor): Promise<readonly string[]> {
    const folder = this.folderOf(floor);
    const children = folder === null ? [] : this.app.vault.getFolderByPath(folder)?.children ?? [];
    return Promise.resolve(children.flatMap((child) => (child instanceof TFile && child.extension === 'png' && PLAYER_ID.test(child.basename) ? [child.basename] : [])));
  }

  async remove(floor: MemoryFloor, player: string): Promise<void> {
    const path = this.pathOf(floor, player);
    if (path !== null) await removeMemoryFile(this.app, path);
  }

  /** Trashes everything `player` explored, of every map, in the campaign: they were removed from it. */
  async forget(player: string): Promise<void> {
    const campaign = this.campaignFolder();
    if (campaign !== null && PLAYER_ID.test(player)) await trashPlayerMemories(this.app, campaign, player);
  }

  /** The folder of `floor`'s memories in the campaign's folder; null while the campaign has none. */
  private folderOf(floor: MemoryFloor): string | null {
    const campaign = this.campaignFolder();
    return campaign === null ? null : floorMemoryFolder(campaign, currentMapPath(this.app, floor.mapPath), floor.level);
  }

  private campaignFolder(): string | null {
    const campaignFile = CampaignFiles.forApp(this.app)?.pathOf(this.campaignId);
    return campaignFile == null ? null : campaignFolderOf(campaignFile);
  }

  private pathOf(floor: MemoryFloor, player: string): string | null {
    const folder = this.folderOf(floor);
    return folder === null || !PLAYER_ID.test(player) ? null : `${folder}/${player}.png`;
  }
}
