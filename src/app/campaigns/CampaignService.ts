import { t } from '../i18n';
import type { CampaignStorage } from './CampaignFiles';
import type { Campaign, CampaignChanges, StoredCampaign } from './campaignTypes';
import { withScenePlayed } from './campaignUsage';
import { campaignName, MAX_CAMPAIGN_DESCRIPTION, parseCampaign } from './campaignValidation';
import { isAssetId } from './campaignValues';
import { campaignFolderOf } from './campaignPaths';
import { readCampaignSystem, withSystemChanges } from './campaignSystem';

/** The most recently played first, then the newest. */
const byRecency = (a: Campaign, b: Campaign): number => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || b.createdAt - a.createdAt || a.name.localeCompare(b.name);

/**
 * The vault's campaigns: read from their files, created, renamed, edited and deleted. Edits change
 * only the fields they own, so data a newer Atlas added survives; a campaign a newer Atlas wrote
 * (`readOnly`) is never changed here.
 */
export class CampaignService {
  constructor(private readonly storage: CampaignStorage) {}

  /** Every campaign, the most recently played first. */
  list(): Campaign[] {
    return this.storage.entries().flatMap((stored) => parseCampaign(stored) ?? []).sort(byRecency);
  }

  get(id: string): Campaign | undefined {
    return this.list().find((campaign) => campaign.id === id);
  }

  /** Why `name` cannot name a campaign, or null when it can. `exceptId` is the campaign being renamed. */
  nameError(name: string, exceptId?: string): string | null {
    const kept = campaignName(name);
    if (kept === null) return name.trim() === '' ? t('names.enter') : t('campaign.nameTooLong');
    const key = kept.toLowerCase();
    return this.list().some((campaign) => campaign.id !== exceptId && campaign.name.toLowerCase() === key) ? t('campaign.nameTaken') : null;
  }

  create(name: string, now: number = Date.now()): Campaign {
    this.assertName(name);
    const stored: StoredCampaign = { id: crypto.randomUUID(), name: name.trim(), createdAt: now };
    this.storage.create(stored);
    return parseCampaign(stored) as Campaign;
  }

  rename(id: string, name: string): void {
    this.assertName(name, id);
    this.modify(id, (stored) => ({ ...stored, name: name.trim() }));
  }

  /**
   * Sets the campaign's settings; a field given as undefined is removed. `system` is changed field
   * by field, and must leave a system Atlas can read (`readCampaignSystem`).
   */
  update(id: string, changes: CampaignChanges): void {
    if (changes.description !== undefined && changes.description.length > MAX_CAMPAIGN_DESCRIPTION) throw new Error('The description is too long.');
    const { system, ...rest } = changes;
    const before = this.storage.entries().find((entry) => entry.id === id);
    if (system !== undefined && readCampaignSystem(withSystemChanges(before?.system, system)) === undefined) throw new Error('Not a game system.');
    this.modify(id, (stored) => {
      const next: StoredCampaign = { ...stored };
      for (const [key, value] of Object.entries(rest)) {
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
      }
      if (system !== undefined) next.system = withSystemChanges(stored.system, system);
      else if ('system' in changes) delete next.system;
      return next;
    });
  }

  /**
   * Records that the scene `sceneId` (its asset id) was played in the campaign at `at`. Returns
   * whether it was recorded: a campaign that is gone, or that a newer Atlas wrote, is left alone.
   */
  recordScene(id: string, sceneId: string, at: number = Date.now()): boolean {
    const campaign = this.get(id);
    if (campaign === undefined || campaign.readOnly === true || !isAssetId(sceneId)) return false;
    this.storage.update(id, (stored) => withScenePlayed(stored, sceneId, at));
    return true;
  }

  /** Deletes the campaign and everything it keeps; the assets it used stay where they are. */
  delete(id: string): void {
    if (this.get(id)?.readOnly !== true) this.storage.remove(id);
  }

  /** The campaign's folder, where what it keeps lies; null for a campaign without a file. */
  folderOf(id: string): string | null {
    const path = this.storage.pathOf(id);
    return path === null ? null : campaignFolderOf(path);
  }

  /** Calls `listener` whenever a campaign changes, here or on another device. */
  onChange(listener: () => void): () => void {
    return this.storage.onChange(listener);
  }

  private modify(id: string, change: (stored: StoredCampaign) => StoredCampaign): void {
    const campaign = this.get(id);
    if (campaign === undefined) throw new Error(`No campaign with id ${id}`);
    if (campaign.readOnly === true) throw new Error(t('campaign.newerVersion'));
    this.storage.update(id, change);
  }

  private assertName(name: string, exceptId?: string): void {
    const error = this.nameError(name, exceptId);
    if (error) throw new Error(error);
  }
}
