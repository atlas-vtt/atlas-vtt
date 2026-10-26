import { type App } from 'obsidian';
import { IMAGE_PRESETS, optimizeImage } from '../../imageProcessing/imageProcessing';
import type { AssetService } from '../../services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../services/AssetThumbnailService';
import { importUvttFile, type UvttImportDeps, type UvttImported } from './importUvttFile';
import { showNotice } from '../../ui/notice';

/** A refusal stays long enough to read its reason. */
const PROBLEM_NOTICE_MS = 12_000;

const counted = (count: number, one: string): string => `${count.toLocaleString('en-US')} ${one}${count === 1 ? '' : 's'}`;

/** What an import brought, for its notice: `Imported "Crypt": 412 walls, 9 doors, 14 lights.` */
export function uvttImportSummary({ name, counts, lightsOff, scaledDown }: UvttImported): string {
  const parts = [`Imported "${name}": ${counted(counts.walls, 'wall')}, ${counted(counts.doors, 'door')}, ${counted(counts.lights, 'light')}.`];
  if (lightsOff) parts.push('The lights are switched off, because the image already shows their glow.');
  if (scaledDown) parts.push(`The image was scaled down to ${scaledDown.to.width} × ${scaledDown.to.height} pixels.`);
  return parts.join(' ');
}

function importDeps(app: App, assetService: AssetService): UvttImportDeps {
  return {
    app,
    assetService,
    convertImage: (image) => optimizeImage(image, IMAGE_PRESETS.map, { thumbnail: THUMBNAIL_SPEC }),
    thumbnails: AssetThumbnailService.getInstance(app, assetService),
  };
}

/**
 * Imports Universal VTT files into a collection, one after the other, each with a notice while
 * it runs and one for its result: what it brought, or why it was refused. Returns the imports
 * that arrived.
 */
export async function runUvttImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string): Promise<UvttImported[]> {
  const deps = importDeps(app, assetService);
  const imported: UvttImported[] = [];
  for (const file of files) {
    const progress = showNotice(`Importing ${file.name}…`, 0);
    const result = await importUvttFile(deps, file, collectionId);
    progress.hide();
    if (result.ok) {
      imported.push(result);
      showNotice(uvttImportSummary(result));
    } else {
      showNotice(`Could not import ${file.name}. ${result.problem}`, PROBLEM_NOTICE_MS);
    }
  }
  if (imported.length > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
  return imported;
}
