/**
 * The gallery's "From Fantasy Statblocks" (§7.9): every layout the plugin
 * holds as a card, drawn by the template the layout would import as. The
 * cards are converted for showing only; nothing is written until one is used.
 */

import type { App } from 'obsidian';
import { allLayouts } from '../../../services/FantasyStatblocksService';
import { pluginLayoutResolver } from '../../fs/fsImport';
import { fsLayoutToTemplate } from '../../fs/fsLayoutToTemplate';
import type { FsLayout } from '../../fs/fsLayoutTypes';
import { withTracksInPlace } from '../../fs/fsTrackReplacement';
import type { GridItem } from '../gallery/TemplateGrid';

/** A card of the source, with the layout it imports. */
export interface FsLayoutItem extends GridItem {
  layout: FsLayout;
}

/** The id the cards are drawn under; the import gives the template its own. */
const PREVIEW_ID = 'fantasy-statblocks-preview';

/** Whether the gallery offers the source: the plugin's layouts can be read. */
export function offersFsLayouts(app: App): boolean {
  return allLayouts(app) !== null;
}

/** One card per layout of the plugin, in the plugin's order. */
export function fsLayoutItems(app: App): FsLayoutItem[] {
  const resolveLayout = pluginLayoutResolver(app);
  return (allLayouts(app) ?? []).map((layout, index): FsLayoutItem => ({
    id: `fs:${layout.id || index}`,
    name: layout.name,
    look: { kind: 'template', template: withTracksInPlace(fsLayoutToTemplate(layout, { id: PREVIEW_ID, resolveLayout })).template },
    layout,
  }));
}
