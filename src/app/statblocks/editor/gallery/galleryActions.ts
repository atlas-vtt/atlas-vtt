/**
 * What the template gallery makes (§7.9): an editable template, copied from a
 * card, built from a statblock's values or blank; and where it goes next. From
 * the command it opens in the template editor unsaved, named by its first
 * save; in a collection's settings it is written to the library at once and
 * given to a role. A Fantasy Statblocks layout is imported, which writes it.
 */

import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { AssetService } from '../../../services/AssetService';
import { systemPresetsOf } from '../../../services/mapCollectionRules';
import { identityOf, importFsLayout, type FsLayoutImport, type LayoutIdentity } from '../../fs/fsImport';
import type { FsLayout } from '../../fs/fsLayoutTypes';
import { copiedFrom, copyTemplate, createTemplateFile } from '../../library/templateActions';
import { readTemplateBody } from '../../library/templateBodyNotes';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { copyName } from '../../library/templatePaths';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockTemplate, TemplateId } from '../../model/templateTypes';
import type { FrontmatterRecord } from '../../notes/statblockSource';
import { collectionStatblockRoles, editedStatblockRoles } from '../../roles/collectionStatblockRoles';
import { openNewTemplate, openTemplateEditor } from '../openTemplateEditor';
import { freeName, nameTakenIn } from '../template-editor/save/saveChoice';
import { blankTemplate, firstBlockId } from './gallerySources';
import { noteName } from '../../../utils/pathUtils';
import { noteBodyAt, statblockTemplate } from './statblockNotes';
import { t } from '../../../i18n';

/** What the user picked in the gallery. */
export type GalleryPick =
  | { kind: 'template'; entry: LibraryTemplate }
  | { kind: 'statblock'; path: string; template: StatblockTemplate }
  | { kind: 'fs-layout'; layout: FsLayout }
  | { kind: 'blank' };

/** A template the gallery made, and what the editor needs to open it. */
export interface CreatedTemplate {
  id: TemplateId;
  path: string;
  /** A Fantasy Statblocks layout's template, imported now or before: the gallery shows the report as it closes. */
  fsImport?: { layout: LayoutIdentity; imported: FsLayoutImport } | undefined;
}

const BLANK_NAME = t('statblockEditor.newTemplate');

/** Writes the picked template into the library as a template of its own. */
export async function createFromPick(app: App, pick: GalleryPick): Promise<CreatedTemplate> {
  switch (pick.kind) {
    case 'template':
      return copyTemplate(app, pick.entry.template.id, pick.entry.name);
    case 'statblock':
      return createTemplateFile(app, noteName(pick.path), pick.template, await noteBodyAt(app, pick.path));
    case 'fs-layout': {
      // A layout is imported once: picked again, it opens the template it gave.
      const imported = await importFsLayout(app, pick.layout);
      return { id: imported.id, path: imported.path, fsImport: { layout: identityOf(pick.layout), imported } };
    }
    case 'blank':
      return createTemplateFile(app, BLANK_NAME, blankTemplate());
  }
}

/** The text a template made from the pick starts its note with: the statblock's own, or the copied template's. */
function bodyOfPick(app: App, pick: Exclude<GalleryPick, { kind: 'fs-layout' }>): Promise<string> {
  if (pick.kind === 'statblock') return noteBodyAt(app, pick.path);
  return pick.kind === 'template' ? readTemplateBody(app, pick.entry.path) : Promise.resolve('');
}

/** A template that is not saved yet, and the name its first save offers: one no template goes by. */
export function draftOf(app: App, pick: Exclude<GalleryPick, { kind: 'fs-layout' }>): { template: StatblockTemplate; name: string } {
  const taken = nameTakenIn(TemplateLibrary.forApp(app).list(), '', app);
  switch (pick.kind) {
    case 'template':
      return { template: { ...pick.entry.template, derivedFrom: copiedFrom(pick.entry.template.id) }, name: freeName(copyName(pick.entry.name), taken) };
    case 'statblock':
      return { template: pick.template, name: freeName(noteName(pick.path), taken) };
    case 'blank':
      return { template: blankTemplate(), name: freeName(BLANK_NAME, taken) };
  }
}

/** The role of the collection starts from `templateId`; the collection keeps following its system where that is the system's. */
export async function assignRoleTemplate(app: App, collectionId: string, roleId: string, templateId: TemplateId): Promise<void> {
  const assets = AssetService.getInstance(app);
  const settings = assets.getCollectionSettings(collectionId);
  const presets = systemPresetsOf(app);
  const roles = collectionStatblockRoles(settings, presets).map((role) => (role.id === roleId ? { ...role, templateId } : role));
  const system = presets.find((preset) => preset.id === settings.systemPresetId)?.rules.statblockRoles;
  await assets.updateCollectionSettings(collectionId, { statblockRoles: editedStatblockRoles(roles, system) });
}

/**
 * After the gallery from the command: the template editor opens on the pick
 * with nothing selected, unsaved; its first save names it and gives it the
 * role. A layout is imported (written) at once, given the role, and opened.
 * Resolves with the import, whose report the gallery shows as it closes.
 */
export async function openPick(app: App, pick: GalleryPick, collectionId: string | null, roleId: string | null): Promise<CreatedTemplate | null> {
  const role = collectionId !== null && roleId !== null ? { collectionId, roleId } : null;
  if (pick.kind !== 'fs-layout') {
    await openNewTemplate(app, { ...draftOf(app, pick), body: await bodyOfPick(app, pick), collectionId, role });
    return null;
  }
  const created = await createFromPick(app, pick);
  if (role) await assignRoleTemplate(app, role.collectionId, role.roleId, created.id);
  await openTemplateEditor(app, { templateId: created.id, path: created.path, collectionId });
  return created;
}

/**
 * Save as a template (§6.4): a Fantasy Statblocks statblock read without the
 * plugin becomes a template, shaped like its auto template, and opens in the
 * template editor unsaved, named after the statblock until its first save,
 * which writes the note's body into the template's note.
 */
export async function saveStatblockAsTemplate(app: App, notePath: string, values: FrontmatterRecord, collectionId: string | null): Promise<void> {
  const shaped = statblockTemplate(values);
  if (!shaped) {
    showNotice(t('statblockEditor.noValuesNotice'));
    return;
  }
  const { name } = draftOf(app, { kind: 'statblock', path: notePath, template: shaped });
  await openNewTemplate(app, { template: shaped, name, body: await noteBodyAt(app, notePath), collectionId, select: firstBlockId(shaped) ?? undefined });
}
