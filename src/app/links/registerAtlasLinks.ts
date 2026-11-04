import type { EmbedCreator, Plugin } from 'obsidian';
import { EXTENSION_ATLASMAP } from '../utils/sceneFiles';
import { runInBackground } from '../utils/backgroundTask';
import { isEncounterPath } from './atlasLinkTargets';
import { EncounterEmbed } from './EncounterEmbed';
import { openInsertAtlasLink } from './InsertAtlasLinkModal';
import { SceneEmbed } from './SceneEmbed';
import { registerSnapshotLinkSuggest } from './SnapshotLinkSuggest';
import { t } from '../i18n';
import './atlas-link-suggest.scss';

/**
 * Shows files of `extension` embedded in notes and in link hover previews.
 * Obsidian has no public API for this; where it is missing, or another plugin
 * already shows these files, links keep Obsidian's plain file embed.
 */
function registerEmbed(plugin: Plugin, extension: string, creator: EmbedCreator): void {
  const registry = plugin.app.embedRegistry;
  if (!registry || typeof registry.registerExtension !== 'function' || registry.isExtensionRegistered(extension)) return;
  registry.registerExtension(extension, creator);
  plugin.register(() => registry.unregisterExtension(extension));
}

/**
 * Links to Atlas files in notes: scenes, their snapshots (`#name`) and
 * encounters embed as cards that open them in Atlas, the `#` of a scene link
 * suggests its snapshots, and a command inserts links to scenes and encounters.
 */
export function registerAtlasLinks(plugin: Plugin): void {
  registerEmbed(plugin, EXTENSION_ATLASMAP, (context, file, subpath) => new SceneEmbed(context, file, subpath));
  // Only encounters: every other JSON file keeps Obsidian's plain embed
  registerEmbed(plugin, 'json', (context, file, subpath) => isEncounterPath(file.path) ? new EncounterEmbed(context, file, subpath) : null);
  registerSnapshotLinkSuggest(plugin);

  plugin.addCommand({
    id: 'insert-atlas-link',
    name: t('atlasLinks.insertCommand'),
    editorCallback: (editor, context) => {
      runInBackground(openInsertAtlasLink(plugin.app, editor, context.file?.path ?? ''), 'Inserting an Atlas link');
    },
  });
}
