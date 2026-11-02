import { type App } from 'obsidian';
import { formatList, t } from '../../i18n';
import type { AssetService } from '../../services/AssetService';
import { showNotice } from '../../ui/notice';
import { importUvttFloors, type UvttFloor, type UvttFloorsImported } from './importUvttFloors';
import { PROBLEM_NOTICE_MS, importDeps } from './runUvttImport';

/** What a floors import brought, for its notice: `Imported "Tavern" with 3 levels: 412 walls, 9 doors and 14 lights.` */
export function uvttFloorsSummary({ name, levels, counts, lightsOff, scaledDown }: UvttFloorsImported): string {
  const contents = formatList([
    t('uvttFloors.walls', { count: counts.walls }),
    t('uvttFloors.doors', { count: counts.doors }),
    t('uvttFloors.lights', { count: counts.lights }),
  ]);
  const parts = [t('uvttFloors.imported', { name, count: levels, contents })];
  if (lightsOff) parts.push(t('uvttFloors.lightsOff'));
  if (scaledDown.length > 0) parts.push(t('uvttFloors.scaledDown', { files: formatList(scaledDown) }));
  return parts.join(' ');
}

/**
 * Imports files as the floors of one scene named `sceneName`, with a notice while it runs and
 * one for its result: what it brought, or why it was refused. Returns the import, or null.
 */
export async function runUvttFloorsImport(app: App, assetService: AssetService, floors: readonly UvttFloor[], sceneName: string, collectionId: string): Promise<UvttFloorsImported | null> {
  const progress = showNotice(t('uvttFloors.importing', { name: sceneName, count: floors.length }), 0);
  const result = await importUvttFloors(importDeps(app, assetService), floors, sceneName, collectionId);
  progress.hide();
  if (!result.ok) {
    showNotice(t('uvttFloors.couldNot', { name: sceneName, problem: result.problem }), PROBLEM_NOTICE_MS);
    return null;
  }
  showNotice(uvttFloorsSummary(result));
  app.workspace.trigger('atlas-vtt:refresh-assets');
  return result;
}
