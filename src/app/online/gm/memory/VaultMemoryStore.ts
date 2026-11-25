import { TFile, type App } from 'obsidian';
import { campaignFolderOf } from '../../../campaigns/campaignPaths';
import { CampaignFiles } from '../../../campaigns/CampaignFiles';
import { currentMapPath, floorMemoryFolder } from '../../../campaigns/exploredFolders';
import { ensureFolder } from '../../../plugin/vaultFolders';
import type { MemoryFloor, MemoryPng, MemoryStore } from './memoryPorts.ts';

/** A player id as the campaign's players file names them, which makes a file name. */
const PLAYER_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The bytes as a buffer of their own, which Obsidian writes whole. */
const ownBuffer = (png: MemoryPng): ArrayBuffer => (png.byteOffset === 0 && png.byteLength === png.buffer.byteLength ? png.buffer : png.slice().buffer);

/**
 * Players' explored memories in the played campaign's folder, beside its `players.json` (`floorMemoryFolder`).
 * The files follow the campaign's folder and the map's path when either is renamed, go with the campaign or
 * the scene when it is deleted, and sync like the campaign's other files. A campaign without a folder keeps nothing.
 */
export class VaultMemoryStore implements MemoryStore {
  constructor(private readonly app: App, private readonly campaignId: string) {}

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
    if (folder === null || !PLAYER_ID.test(player)) return;
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

  /** The folder of `floor`'s memories in the campaign's folder; null while the campaign has none. */
  private folderOf(floor: MemoryFloor): string | null {
    const campaignFile = CampaignFiles.forApp(this.app)?.pathOf(this.campaignId);
    return campaignFile == null ? null : floorMemoryFolder(campaignFolderOf(campaignFile), currentMapPath(this.app, floor.mapPath), floor.level);
  }

  private fileOf(floor: MemoryFloor, player: string): TFile | null {
    const folder = this.folderOf(floor);
    return folder === null || !PLAYER_ID.test(player) ? null : this.app.vault.getFileByPath(`${folder}/${player}.png`);
  }
}
