/**
 * What the import dialog reads of the template besides the import's report:
 * how many parts it keeps for Fantasy Statblocks to show, which a layout
 * imported before has no report to say.
 */

import type { App } from 'obsidian';
import type { FsLayoutImport } from '../../fs/fsImport';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { flattenReadingOrder } from '../../model/treeQueries';

/** How many script blocks the template keeps for Fantasy Statblocks: parts Atlas shows only as the values they read. */
export function partsOnlyFsShows(app: App, imported: FsLayoutImport): number {
  if (imported.report) return imported.report.scripts.length;
  const template = TemplateLibrary.forApp(app).get(imported.id)?.template;
  if (!template) return 0;
  return flattenReadingOrder(template.layout.blocks).filter((block) => block.type === 'script').length;
}
