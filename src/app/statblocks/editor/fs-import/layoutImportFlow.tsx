/**
 * The ways into a Fantasy Statblocks import that are no React tree of their
 * own (the gallery as it closes, the pane, a command, the file menu): the
 * import, the template opened in the template editor, and the report, shown
 * where it has something to say.
 */

import React from 'react';
import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { identityOf, importFsLayout, readLayoutText, type FsLayoutImport, type LayoutIdentity } from '../../fs/fsImport';
import { statblockCount, statblocksUsingLayout, withoutNote } from '../../fs/fsLayoutStatblocks';
import { firstBlockId } from '../gallery/gallerySources';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { showHostedDialog } from '../hostedDialog';
import { openTemplateEditor } from '../openTemplateEditor';
import { LayoutImportDialog, type LayoutImportDialogProps } from './LayoutImportDialog';

type HostedDialog = Omit<LayoutImportDialogProps, 'onClose'>;

/** Shows the dialog in `dialog.doc`; focus goes back where it was once it has left. */
export function showLayoutImportDialog(dialog: HostedDialog): void {
  showHostedDialog(dialog.doc, 'atlas-fs-import-host', (close) => <LayoutImportDialog key="layout-import" {...dialog} onClose={close} />);
}

/** Opens the layout's template in the template editor, its first block selected. */
export function openImportedTemplate(app: App, imported: FsLayoutImport, collectionId: string | null): Promise<unknown> {
  const template = TemplateLibrary.forApp(app).get(imported.id)?.template;
  return openTemplateEditor(app, {
    templateId: imported.id,
    path: imported.path,
    collectionId,
    select: template ? firstBlockId(template) ?? undefined : undefined,
  });
}

export interface ImportOutcomeOptions {
  collectionId?: string | null;
  /** Offers Open template; unset where the template is open already. */
  offerOpen?: boolean;
  /** A note the user took over already (the pane's own, a fence just copied), left out of the batch. */
  except?: string;
}

/**
 * After an import: the report, and the batch that moves the statblocks the
 * layout draws to Atlas, in properties and in code blocks. Nothing shows for
 * a layout imported before that draws no statblock still to move.
 */
export async function showImportOutcome(
  app: App, doc: Document, layout: LayoutIdentity, imported: FsLayoutImport, options: ImportOutcomeOptions = {},
): Promise<void> {
  const statblocks = withoutNote(await statblocksUsingLayout(app, layout), options.except);
  if (!imported.report && statblockCount(statblocks) === 0) return;
  const collectionId = options.collectionId ?? null;
  showLayoutImportDialog({
    app,
    doc,
    layout,
    imported,
    statblocks,
    onOpenTemplate: options.offerOpen ? () => { void openImportedTemplate(app, imported, collectionId); } : undefined,
  });
}

/** Imports a layout file, opens its template and shows the report; a file that is no layout says so. */
export async function importLayoutFile(app: App, text: string, doc: Document): Promise<void> {
  const read = readLayoutText(text);
  if ('problem' in read) {
    showNotice(read.problem);
    return;
  }
  const imported = await importFsLayout(app, read.layout);
  await openImportedTemplate(app, imported, null);
  await showImportOutcome(app, doc, identityOf(read.layout), imported);
}
