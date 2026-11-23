import type { Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import type { FogEdgeStyle } from '../fog/fogEdge';
import type { DiceFont } from '../dice3d/diceLook';
import type { LookService } from './lookService';

/** Atlas' two looks: the mediaeval module page and the clean sci-fi one. */
export type AtlasLook = 'mediaeval' | 'scifi';

/** The fog's edge each look switches to: a crackled module page, a soft clean screen. */
export const LOOK_FOG_EDGE_STYLE: Record<AtlasLook, FogEdgeStyle> = { mediaeval: 'crackle', scifi: 'soft' };

/** The dice numerals each look switches to: drawn by hand, or Oxanium. */
export const LOOK_DICE_FONT: Record<AtlasLook, DiceFont> = { mediaeval: 'medieval', scifi: 'scifi' };

/** On `body` while one of Atlas' looks is on. */
export const LOOK_CLASS = 'atlas-look';

/** On `body` while the Sci-fi look is on, beside `LOOK_CLASS`. */
export const SCIFI_LOOK_CLASS = 'atlas-look-scifi';

/** The companion theme's name in its manifest, which drew the looks before Atlas did. */
export const RETIRED_THEME_NAME = 'Atlas VTT';

export function isAtlasLook(value: unknown): value is AtlasLook {
  return value === 'mediaeval' || value === 'scifi';
}

/**
 * Keeps every window's `body` in the look of this device, and takes the classes off when Atlas unloads. A switch of
 * look is announced as `css-change`, once every window shows it, since what reads the look's CSS (the ivy Atlas lends
 * its initiative trackers) follows that. A theme Obsidian switches to (its own `css-change`) ends an Atlas look.
 */
export function registerLookSync(plugin: Plugin, looks: LookService): void {
  const { app } = plugin;
  const documents = new Set<Document>();
  const apply = (doc: Document): void => {
    const look = looks.get();
    doc.body.toggleClass(LOOK_CLASS, isAtlasLook(look));
    doc.body.toggleClass(SCIFI_LOOK_CLASS, look === 'scifi');
  };
  inEveryDocument(plugin, (doc) => {
    documents.add(doc);
    apply(doc);
    return () => { documents.delete(doc); doc.body.removeClass(LOOK_CLASS, SCIFI_LOOK_CLASS); };
  });
  plugin.register(looks.onChange(() => {
    for (const doc of documents) apply(doc);
    app.workspace.trigger('css-change');
  }));
  plugin.registerEvent(app.workspace.on('css-change', () => looks.followThemeChange()));
}
