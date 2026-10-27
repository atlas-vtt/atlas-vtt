import type { App } from 'obsidian';
import { t } from '../../i18n';
import { renderThumbnail } from '../../imageProcessing/imageProcessing';
import { videoPosterBlob } from '../../pixi/mapImage/video/videoPoster';
import type { AssetService } from '../../services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../services/AssetThumbnailService';
import { showNotice } from '../../ui/notice';
import { importVideoMap, type VideoMapImportDeps } from './importVideoMap';

/** A refusal stays long enough to read its reason. */
const PROBLEM_NOTICE_MS = 12_000;

function importDeps(app: App, assetService: AssetService): VideoMapImportDeps {
  return {
    app,
    assetService,
    thumbnails: AssetThumbnailService.getInstance(app, assetService),
    poster: videoPosterBlob,
    thumbnail: async (poster) => new Blob([await renderThumbnail(poster, THUMBNAIL_SPEC)], { type: 'image/webp' }),
  };
}

/**
 * Adds videos to a collection as animated maps, one after the other, each with a notice while it
 * runs and one for its result. Returns how many were added.
 */
export async function runVideoMapImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string): Promise<number> {
  const deps = importDeps(app, assetService);
  let added = 0;
  for (const file of files) {
    const progress = showNotice(t('videoMap.importing', { file: file.name }), 0);
    const result = await importVideoMap(deps, file, collectionId);
    progress.hide();
    if (result.ok) {
      added++;
      showNotice(t('videoMap.imported', { name: result.name }));
    } else {
      showNotice(t('videoMap.failed', { file: file.name, problem: result.problem }), PROBLEM_NOTICE_MS);
    }
  }
  if (added > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
  return added;
}
