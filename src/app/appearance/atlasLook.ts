import type { Plugin } from 'obsidian';
import { inEveryDocument } from '../platform/atlasDocuments';
import type { FogEdgeStyle } from '../fog/fogEdge';
import type { DiceFont } from '../dice3d/diceLook';
import type { LookService } from './lookService';
import { customAccent, onAccentChange } from './accentColour';
import { paintIvy, untilStylesheetAdded } from './paintedIvy';

/** Atlas' two looks: the mediaeval module page and the clean sci-fi one. */
export type AtlasLook = 'mediaeval' | 'scifi';

/** The fog's edge each look switches to: a crackled module page, a soft clean screen. */
export const LOOK_FOG_EDGE_STYLE: Record<AtlasLook, FogEdgeStyle> = { mediaeval: 'crackle', scifi: 'soft' };

/** The dice numerals each look switches to: drawn by hand, or Oxanium. */
export const LOOK_DICE_FONT: Record<AtlasLook, DiceFont> = { mediaeval: 'medieval', scifi: 'scifi' };

/** Whether each look lets the map show through what stands on it (bars, widgets, dice) until the GM switches it. */
export const LOOK_GLASS: Record<AtlasLook, boolean> = { mediaeval: false, scifi: true };

/** On `body` while one of Atlas' looks is on. */
export const LOOK_CLASS = 'atlas-look';

/** On `body` while the Sci-fi look is on, beside `LOOK_CLASS`. */
export const SCIFI_LOOK_CLASS = 'atlas-look-scifi';

/** On `body` while the Atlas look on lets the map show through (`LookService.glass`), beside `LOOK_CLASS`. */
export const GLASS_LOOK_CLASS = 'atlas-look-glass';

/** On `body` while the GM wants no rounded corners in Atlas (`LookService.squareCorners`), under any look. */
export const SQUARE_CORNERS_CLASS = 'atlas-square-corners';

/** On `body` while an Atlas look is on and the GM picked an accent colour, which the look then takes instead of its own. */
export const CUSTOM_ACCENT_CLASS = 'atlas-accent-custom';

export function isAtlasLook(value: unknown): value is AtlasLook {
  return value === 'mediaeval' || value === 'scifi';
}

/**
 * Keeps every window's `body` in the look of this device, and takes the classes off when Atlas unloads. A switch of
 * look is announced as `css-change`, once every window shows it, since what reads the look's CSS (the ivy Atlas lends
 * its initiative trackers) follows that. A theme Obsidian switches to (its own `css-change`) ends an Atlas look.
 * An accent colour picked here or in Obsidian's settings marks every window too while an Atlas look is on, as Obsidian
 * copies its colour into each, and is announced as `css-change`, which Obsidian leaves out for the accent. The Medieval look's ivy is painted in the GM's ivy colour in every window; a change of
 * it is announced as `css-change` like a switch of look, so the ivy Atlas lends follows.
 */
export function registerLookSync(plugin: Plugin, looks: LookService): void {
  const { app } = plugin;
  const documents = new Set<Document>();
  /** Documents waiting for Atlas' stylesheet before their ivy can be painted, with what stops the wait. */
  const waiting = new Map<Document, () => void>();
  const paint = (doc: Document): boolean => paintIvy(doc, looks.get() === 'mediaeval' ? looks.ivyColour() : '');
  const apply = (doc: Document): void => {
    const look = looks.get();
    doc.body.toggleClass(LOOK_CLASS, isAtlasLook(look));
    doc.body.toggleClass(SCIFI_LOOK_CLASS, look === 'scifi');
    doc.body.toggleClass(GLASS_LOOK_CLASS, looks.glass());
    doc.body.toggleClass(SQUARE_CORNERS_CLASS, looks.squareCorners());
    doc.body.toggleClass(CUSTOM_ACCENT_CLASS, isAtlasLook(look) && customAccent(app) !== '');
    waiting.get(doc)?.();
    waiting.delete(doc);
    if (paint(doc)) return;
    // At start the drawings are not readable yet: Obsidian adds Atlas' stylesheet after onload.
    waiting.set(doc, untilStylesheetAdded(doc, () => {
      const painted = paint(doc);
      if (painted) waiting.delete(doc);
      return painted;
    }));
  };
  inEveryDocument(plugin, (doc) => {
    documents.add(doc);
    apply(doc);
    return () => {
      documents.delete(doc);
      waiting.get(doc)?.();
      waiting.delete(doc);
      paintIvy(doc, '');
      doc.body.removeClass(LOOK_CLASS, SCIFI_LOOK_CLASS, GLASS_LOOK_CLASS, SQUARE_CORNERS_CLASS, CUSTOM_ACCENT_CLASS);
    };
  });
  plugin.register(looks.onChange(() => {
    for (const doc of documents) apply(doc);
    app.workspace.trigger('css-change');
  }));
  // Obsidian writes a new accent onto `body` without announcing it (`setAccentColor` triggers no `css-change`, unlike
  // a theme or font switch), so Atlas announces it: the dice, the canvas' accent and the lent ivy re-read it then.
  plugin.register(onAccentChange(app, () => {
    for (const doc of documents) apply(doc);
    app.workspace.trigger('css-change');
  }));
  plugin.registerEvent(app.workspace.on('css-change', () => looks.followThemeChange()));
}
