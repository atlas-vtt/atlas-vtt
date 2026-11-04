import type { App, TAbstractFile } from 'obsidian';
import { CampaignFiles, type CampaignStorage } from '../campaigns/CampaignFiles';
import { CampaignPlay } from '../campaigns/campaignPlay';
import { onPlayedCampaignChange } from '../campaigns/playedCampaign';
import { CampaignService } from '../campaigns/CampaignService';
import type { WorldMapGate } from '../online/gm/book/worldMapGate.ts';
import { MAX_BOOK_MAPS } from '../online/protocol/index.ts';
import { worldMapTree } from '../services/worldMapTree';

/**
 * The world map is the one of the campaign this device plays, with the scenes its pins lead into:
 * none while it plays none. It may be another whenever another campaign (or none) is played, a
 * campaign changes, the asset index or a scene's artwork changes, one of its scenes is saved (its
 * pins may lead elsewhere now), or a note its pins link is written (it may be a quest now, or have
 * its id).
 */
export function campaignWorldMapGate(
  app: App,
  play: () => CampaignPlay = () => CampaignPlay.forApp(app),
  storage: () => CampaignStorage | undefined = () => CampaignFiles.forApp(app),
): WorldMapGate {
  /** The scene files the world map was last read from, and the notes its pins link. */
  let scenes = new Set<string>();
  let notes = new Set<string>();
  return {
    worldMap: async () => {
      const campaigns = storage();
      const playing = play().playing();
      const assetId = campaigns === undefined || playing === null ? undefined : new CampaignService(campaigns).get(playing)?.worldMap;
      const read = assetId === undefined ? null : await worldMapTree(app, assetId, MAX_BOOK_MAPS);
      scenes = new Set(read?.scenePaths ?? []);
      notes = new Set(read?.notePaths ?? []);
      return read?.tree ?? null;
    },
    onChange: (listener) => {
      const sceneChanged = (file: TAbstractFile, oldPath?: string): void => {
        if (scenes.has(file.path) || (oldPath !== undefined && scenes.has(oldPath))) listener();
      };
      // A map's or scene's artwork may be another once the asset index changed or a scene was saved.
      const refs = [app.workspace.on('atlas-vtt:refresh-assets', () => listener()), app.workspace.on('atlas-vtt:scene-thumbnail-updated', () => listener())];
      const fileRefs = [
        app.vault.on('modify', (file) => sceneChanged(file)),
        app.vault.on('rename', (file, oldPath) => sceneChanged(file, oldPath)),
        app.vault.on('delete', (file) => sceneChanged(file)),
      ];
      // A linked note may have become a quest, or been given its id.
      const noteRef = app.metadataCache.on('changed', (file) => {
        if (notes.has(file.path)) listener();
      });
      const stopCampaigns = onPlayedCampaignChange(app, listener, play, storage);
      return () => {
        stopCampaigns();
        app.metadataCache.offref(noteRef);
        for (const ref of refs) app.workspace.offref(ref);
        for (const ref of fileRefs) app.vault.offref(ref);
      };
    },
  };
}
