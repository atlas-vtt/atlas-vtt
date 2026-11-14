/**
 * The statblock editor's entry points (§7.3, §11, D9): the token menu, the
 * asset card, the link dialog, the DM screen and the note fence ask here.
 * While the `statblockEditor` switch is off each answer is "nothing", so
 * every entry point behaves as before.
 */

import type { App } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import { t } from '../../../i18n';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { runInBackground } from '../../../utils/backgroundTask';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { cachedTemplateId } from '../../notes/statblockSource';
import { openStatblockEditor, type StatblockEditorEntry } from '../openStatblockEditor';
import { collectionOffers } from './collectionRoles';
import { createStatblock } from './createFlow';
import { createStatblockMenuEntry } from './RoleMenu';
import type { NewStatblockOption, TemplateOffer } from './templateOffers';

export interface EntryContext {
  /** The entry point's collection: the asset manager's, the map's; null where there is none. */
  collectionId: string | null;
  from: StatblockEditorEntry;
}

/** The token a statblock is made for: the note takes its name, and its art as `image`. */
export interface TokenForStatblock {
  imagePath: string;
  name: string;
}

export interface TokenCreationContext extends EntryContext {
  token: TokenForStatblock;
  /** Before the note is made, once a role or template is chosen: close what covers the workspace. */
  onStart?: (() => void) | undefined;
  /** The token was linked to the new note. */
  onLinked?: ((notePath: string) => void) | undefined;
}

/** Whether "Edit statblock" opens the note with its statblock beside it: a native statblock, with the switch on (D9). */
export function opensStatblockEditor(app: App, path: string): boolean {
  const file = experimentalFeatureOn(app, 'statblockEditor') ? app.vault.getFileByPath(path) : null;
  return file !== null && cachedTemplateId(app, file) !== null;
}

/**
 * "Edit statblock": opens a native statblock's note with its statblock beside
 * it while the switch is on, and returns true. Returns false for everything
 * else, Fantasy Statblocks' statblocks included, where the caller opens the
 * note as it always did.
 */
export function editInStatblockPane(app: App, path: string, context: EntryContext): boolean {
  if (!opensStatblockEditor(app, path)) return false;
  runInBackground(
    openStatblockEditor(app, { notePath: path, collectionId: context.collectionId, from: context.from }),
    `Opening the statblock of ${path}`,
    "Couldn't open the statblock",
  );
  return true;
}

/** How `openStatblockNote` opened a statblock note. */
export type StatblockNoteOpening = 'editor' | 'note' | 'missing';

/**
 * Opens a token's statblock note: with its statblock beside it where
 * `editInStatblockPane` does, else as the note in a new tab. A note that is
 * gone opens nothing (`missing`): Obsidian would make a new, empty one in its place.
 */
export function openStatblockNote(app: App, path: string, context: EntryContext): StatblockNoteOpening {
  const file = app.vault.getFileByPath(path);
  if (!file) return 'missing';
  if (editInStatblockPane(app, path, context)) return 'editor';
  runInBackground(app.workspace.openLinkText(file.path, '', true), `Opening ${path}`, t('statblockEditor.openNoteFailed'));
  return 'note';
}

/**
 * What a token's statblock can start from, as "New statblock…" lists it: the collection's roles, then the vault's
 * other templates. The built-ins no role starts from stay with the command: a menu holds no room for them.
 */
function tokenOffers(app: App, collectionId: string | null): TemplateOffer[] {
  return collectionOffers(app, collectionId, TemplateLibrary.forApp(app).list().filter((entry) => !entry.builtIn));
}

function createForToken(app: App, context: TokenCreationContext, offer: TemplateOffer): void {
  context.onStart?.();
  runInBackground(createStatblock(app, {
    collectionId: context.collectionId,
    // A role names its template again once the library has read the vault; a template picked itself belongs to no role.
    ...(offer.roleId === undefined ? { templateId: offer.templateId } : { roleId: offer.roleId }),
    name: context.token.name,
    tokenImagePath: context.token.imagePath,
    from: context.from,
    onLinked: context.onLinked,
  }), `Creating a statblock for ${context.token.name}`);
}

/** "Create statblock" for a token without one (token menu, asset card); null while the switch is off. */
export function createStatblockEntry(app: App, context: TokenCreationContext): ContextMenuEntry | null {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  return createStatblockMenuEntry(tokenOffers(app, context.collectionId), (offer) => createForToken(app, context, offer));
}

/** The link dialog's "New statblock…" for its token; undefined while the switch is off. */
export function newStatblockOption(app: App, context: TokenCreationContext): NewStatblockOption | undefined {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return undefined;
  return {
    choices: tokenOffers(app, context.collectionId),
    onChoose: (offer) => createForToken(app, context, offer),
  };
}
