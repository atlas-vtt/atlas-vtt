/**
 * The statblock editor's entry points (§7.3, §11, D9): the token menu, the
 * asset card, the link dialog, the DM screen and the note fence ask here.
 * While the `statblockEditor` switch is off each answer is "nothing", so
 * every entry point behaves as before.
 */

import type { App } from 'obsidian';
import { experimentalFeatureOn } from '../../../experimental/experimentalFeatures';
import type { ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { runInBackground } from '../../../utils/backgroundTask';
import { cachedTemplateId } from '../../notes/statblockSource';
import { openStatblockEditor, type StatblockEditorEntry } from '../openStatblockEditor';
import { roleChoicesFor } from './collectionRoles';
import { createStatblock } from './createFlow';
import { createStatblockMenuEntry } from './RoleMenu';
import type { NewStatblockOption } from './roleChoices';

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
  /** Before the note is made, once a role is chosen: close what covers the workspace. */
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

function createForToken(app: App, context: TokenCreationContext, roleId: string): void {
  context.onStart?.();
  runInBackground(createStatblock(app, {
    collectionId: context.collectionId,
    roleId,
    name: context.token.name,
    tokenImagePath: context.token.imagePath,
    from: context.from,
    onLinked: context.onLinked,
  }), `Creating a statblock for ${context.token.name}`);
}

/** "Create statblock" for a token without one (token menu, asset card); null while the switch is off. */
export function createStatblockEntry(app: App, context: TokenCreationContext): ContextMenuEntry | null {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return null;
  return createStatblockMenuEntry(roleChoicesFor(app, context.collectionId), (roleId) => createForToken(app, context, roleId));
}

/** The link dialog's "New statblock…" for its token; undefined while the switch is off. */
export function newStatblockOption(app: App, context: TokenCreationContext): NewStatblockOption | undefined {
  if (!experimentalFeatureOn(app, 'statblockEditor')) return undefined;
  return {
    choices: roleChoicesFor(app, context.collectionId),
    onChoose: (roleId) => createForToken(app, context, roleId),
  };
}
