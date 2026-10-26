import type { App } from 'obsidian';
import { CampaignFiles } from '../../campaigns/CampaignFiles';
import { CampaignService } from '../../campaigns/CampaignService';
import type { Campaign } from '../../campaigns/campaignTypes';
import { CampaignPlayers } from '../../campaigns/players/CampaignPlayers';
import { resourceUrl, sceneThumbnailUrl } from '../../react/components/dashboard/libraryPictures';
import { campaignActivity } from '../../react/components/dashboard/relativeTime';
import { AssetService } from '../../services/AssetService';
import { fnv1a32 } from '../../utils/hashing';

/** A campaign a table can be started on, as the start menu shows it. */
export interface CampaignChoice {
  readonly id: string;
  readonly name: string;
  /** When it was last played, or made ("Played 3d ago"). */
  readonly activity: string;
  /** Its lasting players. */
  readonly players: number;
  /** Its world map's thumbnail as a URL; null for none, or while it is looked up. */
  readonly art: string | null;
  /** A hue of its own (0–359) for a campaign without a world map, as the dashboard tints it. */
  readonly hue: number;
}

/** The campaigns tables can be started on, and their changes. */
export interface CampaignChoices {
  /** Every campaign, the most recently played first; null while the campaigns are not read yet. */
  list(): readonly CampaignChoice[] | null;
  onChange(listener: () => void): () => void;
}

/** A world map's thumbnail: a map's own, or the one Atlas keeps of a scene. */
async function thumbnailOf(app: App, assetId: string): Promise<string | null> {
  const asset = await AssetService.getInstance(app).getAssetById(assetId);
  if (asset?.type === 'map') return resourceUrl(app, asset.thumbnailPath);
  if (asset?.type === 'scene' && asset.data?.mapPath) return sceneThumbnailUrl(app, asset.data.mapPath);
  return null;
}

/**
 * The vault's campaigns for the start menu: read from the campaigns and players files, with each
 * world map's thumbnail looked up once (again when the asset index or a scene's thumbnail changes).
 */
export function appCampaignChoices(app: App): CampaignChoices {
  /** Thumbnails by world map asset id; absent while looked up. */
  const art = new Map<string, string | null>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  const changed = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const artOf = (worldMap: string | undefined): string | null => {
    if (worldMap === undefined) return null;
    const known = art.get(worldMap);
    if (known !== undefined || pending.has(worldMap)) return known ?? null;
    pending.add(worldMap);
    void thumbnailOf(app, worldMap)
      .catch((error: unknown) => {
        console.error('[Atlas] Reading a campaign\'s world map failed:', error);
        return null;
      })
      .then((url) => {
        pending.delete(worldMap);
        art.set(worldMap, url);
        changed();
      });
    return null;
  };
  const choiceOf = (campaign: Campaign, players: CampaignPlayers | undefined): CampaignChoice => ({
    id: campaign.id,
    name: campaign.name,
    activity: campaignActivity(campaign),
    players: players?.of(campaign.id).players.length ?? 0,
    art: artOf(campaign.worldMap),
    hue: fnv1a32(campaign.id) % 360,
  });
  return {
    list: () => {
      const files = CampaignFiles.forApp(app);
      if (files === undefined || !files.isLoaded()) return null;
      const players = CampaignPlayers.forApp(app);
      return new CampaignService(files).list().map((campaign) => choiceOf(campaign, players));
    },
    onChange: (listener) => {
      listeners.add(listener);
      const forgetArt = (): void => {
        art.clear();
        listener();
      };
      const refs = [app.workspace.on('atlas-vtt:refresh-assets', forgetArt), app.workspace.on('atlas-vtt:scene-thumbnail-updated', forgetArt)];
      const stops = [
        CampaignFiles.forApp(app)?.onChange(listener),
        CampaignPlayers.forApp(app)?.onChange(listener),
      ];
      return () => {
        listeners.delete(listener);
        for (const ref of refs) app.workspace.offref(ref);
        for (const stop of stops) stop?.();
      };
    },
  };
}
