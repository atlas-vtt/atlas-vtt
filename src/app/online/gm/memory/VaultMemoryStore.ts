import { TFile, type App } from 'obsidian';
import { campaignFolderOf } from '../../../campaigns/campaignPaths';
import { CampaignFiles } from '../../../campaigns/CampaignFiles';
import { currentMapPath, floorMemoryFolder, trashPlayerMemories } from '../../../campaigns/exploredFolders';
import { ensureFolder } from '../../../plugin/vaultFolders';
import type { MemoryFloor, MemoryPng, MemoryStore } from './memoryPorts.ts';

/** A player id as the campaign's players file names them, which makes a file name. */
const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The bytes as a buffer of their own, which Obsidian writes whole. */
const ownBuffer = (png: MemoryPng): ArrayBuffer => (png.byteOffset === 0 && png.byteLength === png.buffer.byteLength ? png.buffer : png.slice().buffer);

/**
 * Players' explored memories in the played campaign's folder, beside its `players.json` (`floorMemoryFolder`).
 * The files follow the campaign's folder and the map's path when either is renamed, go with the campaign or
 * the scene when it is deleted, and sync like the campaign's other files. A campaign without a folder keeps nothing,
 * and nothing is written for a player who is no longer one of its players (`isPlayer`): their files went with them.
 */
export class VaultMemoryStore implements MemoryStore {
  constructor(private readonly app: App, private readonly campaignId: string, private readonly isPlayer: (player: string) => boolean) {}

  async read(floor: MemoryFloor, player: string): Promise<MemoryPng | null> {
    const file = this.fileOf(floor, player);
    if (file === null) return null;
    try {
      return new Uint8Array(await this.app.vault.readBinary(file));
    } catch {
      return null;
    }
  }

  async write(floor: MemoryFloor, player: string, png: MemoryPng): Promise<void> {
    const folder = this.folderOf(floor);
    if (folder === null || !PLAYER_ID.test(player) || !this.isPlayer(player)) return;
    const file = this.fileOf(floor, player);
    if (file !== null) return this.app.vault.modifyBinary(file, ownBuffer(png));
    await ensureFolder(this.app, folder);
    await this.app.vault.createBinary(`${folder}/${player}.png`, ownBuffer(png));
  }

  players(floor: MemoryFloor): Promise<readonly string[]> {
    const folder = this.folderOf(floor);
    const children = folder === null ? [] : this.app.vault.getFolderByPath(folder)?.children ?? [];
    return Promise.resolve(children.flatMap((child) => (child instanceof TFile && child.extension === 'png' && PLAYER_ID.test(child.basename) ? [child.basename] : [])));
  }

  async remove(floor: MemoryFloor, player: string): Promise<void> {
    const file = this.fileOf(floor, player);
    if (file !== null) await this.app.fileManager.trashFile(file);
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

  private fileOf(floor: MemoryFloor, player: string): TFile | null {
    const folder = this.folderOf(floor);
    return folder === null || !PLAYER_ID.test(player) ? null : this.app.vault.getFileByPath(`${folder}/${player}.png`);
  }
}
