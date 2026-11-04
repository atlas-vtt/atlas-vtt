import { addArtIcon, addRevealImage, AtlasLinkEmbed, type EmbedCardContent } from './AtlasLinkEmbed';
import { findSnapshot, sceneOfMapFile, snapshotsOfMap } from './atlasLinkAssets';
import { snapshotNameOfSubpath } from './atlasLinkTargets';
import { openSceneLink } from './openAtlasLink';
import { resourceUrl } from '../packages/components/asset-manager/utils/assetFormatters';
import { mapThumbnailPath } from '../utils/dataFileMigration';
import { t } from '../i18n';

const SCENE_ICON = 'clapperboard';

/** An embedded scene (`![[Tavern.atlasmap]]`), or one of its snapshots (`![[Tavern.atlasmap#Before the fight]]`). */
export class SceneEmbed extends AtlasLinkEmbed {
  protected async content(): Promise<EmbedCardContent> {
    const { app } = this.ctx;
    const scene = await sceneOfMapFile(app, this.file.path);
    const sceneName = scene?.name ?? this.file.basename;
    const action = {
      label: t('atlasLinks.openWithAtlas'),
      icon: 'map',
      run: () => openSceneLink(app, this.file, this.subpath),
      failure: t('atlasLinks.openFailed'),
    };
    const sceneArt = resourceUrl(app, mapThumbnailPath(this.file.path));

    const snapshotName = snapshotNameOfSubpath(this.subpath);
    if (snapshotName) {
      const { service, entries } = await snapshotsOfMap(app, this.file.path);
      const entry = findSnapshot(entries, snapshotName);
      const art = entry ? service.thumbnailUrl(entry) : null;
      return {
        title: entry?.snapshot.name ?? sceneName,
        meta: entry ? t('atlasLinks.snapshotOf', { scene: sceneName }) : t('atlasLinks.snapshotMissing', { name: snapshotName }),
        art: (artEl) => art ? addRevealImage(artEl, art, entry?.snapshot.name ?? '', SCENE_ICON) : addArtIcon(artEl, SCENE_ICON),
        action,
      };
    }

    return {
      title: sceneName,
      ...(scene ? { meta: scene.collection } : {}),
      art: (artEl) => sceneArt ? addRevealImage(artEl, sceneArt, sceneName, SCENE_ICON) : addArtIcon(artEl, SCENE_ICON),
      action,
    };
  }
}
