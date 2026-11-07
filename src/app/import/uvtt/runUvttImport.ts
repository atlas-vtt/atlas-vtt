import { type App } from 'obsidian';
import { IMAGE_PRESETS, optimizeImage } from '../../imageProcessing/imageProcessing';
import type { AssetService } from '../../services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../services/AssetThumbnailService';
import { importUvttFile, importUvttSource, type UvttImportDeps, type UvttImportResult, type UvttImported } from './importUvttFile';
import { showNotice } from '../../ui/notice';
import { t } from '../../i18n';
import type { UvttSource } from './uvttSource';

/** A refusal stays long enough to read its reason. */
export const PROBLEM_NOTICE_MS = 12_000;

const counted = (count: number, one: string): string => `${count.toLocaleString('en-US')} ${one}${count === 1 ? '' : 's'}`;

/** What an import brought, for its notice: `Imported "Crypt": 412 walls, 9 doors, 14 lights.` */
export function uvttImportSummary({ name, counts, lightsOff, scaledDown }: UvttImported): string {
  const parts = [`Imported "${name}": ${counted(counts.walls, 'wall')}, ${counted(counts.doors, 'door')}, ${counted(counts.lights, 'light')}.`];
  if (lightsOff) parts.push('The lights are switched off, because the image already shows their glow.');
  if (scaledDown) parts.push(`The image was scaled down to ${scaledDown.to.width} × ${scaledDown.to.height} pixels.`);
  return parts.join(' ');
}

export function importDeps(app: App, assetService: AssetService): UvttImportDeps {
  return {
    app,
    assetService,
    convertImage: (image) => optimizeImage(image, IMAGE_PRESETS.map, { thumbnail: THUMBNAIL_SPEC }),
    thumbnails: AssetThumbnailService.getInstance(app, assetService),
  };
}

/** Imports `items` one after the other, each with a notice while it runs and one for its result. */
async function runEach<T>(app: App, items: readonly T[], nameOf: (item: T) => string, importOne: (item: T) => Promise<UvttImportResult>): Promise<UvttImported[]> {
  const imported: UvttImported[] = [];
  for (const item of items) {
    const progress = showNotice(t('uvtt.importing', { file: nameOf(item) }), 0);
    const result = await importOne(item);
    progress.hide();
    if (result.ok) {
      imported.push(result);
      showNotice(uvttImportSummary(result));
    } else {
      showNotice(t('uvtt.couldNot', { file: nameOf(item), problem: result.problem }), PROBLEM_NOTICE_MS);
    }
  }
  if (imported.length > 0) app.workspace.trigger('atlas-vtt:refresh-assets');
  return imported;
}

/**
 * Imports Universal VTT files into a collection, one after the other, each with a notice while
 * it runs and one for its result: what it brought, or why it was refused. Returns the imports
 * that arrived.
 */
export async function runUvttImport(app: App, assetService: AssetService, files: readonly File[], collectionId: string): Promise<UvttImported[]> {
  const deps = importDeps(app, assetService);
  return runEach(app, files, (file) => file.name, (file) => importUvttFile(deps, file, collectionId));
}

/** Imports files already read (`readUvttSource`) as `runUvttImport` imports files: each a scene of its own. */
export async function runUvttSourcesImport(app: App, assetService: AssetService, sources: readonly UvttSource[], collectionId: string): Promise<UvttImported[]> {
  const deps = importDeps(app, assetService);
  return runEach(app, sources, (source) => source.fileName, (source) => importUvttSource(deps, source, collectionId));
}
