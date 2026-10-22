import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { type App } from 'obsidian';
import { showNotice } from '../../ui/notice';
import { Plus } from 'lucide-react';
import { Button } from '../../packages/components/primitives/button';
import { ActionsMenuButton } from '../../packages/components/shared/ActionsMenuButton';
import type { ContextMenuEntry } from '../../react/components/context-menu/AtlasContextMenu';
import { DeleteTemplateDialog } from '../editor/template-editor/DeleteTemplateDialog';
import { createFromPick } from '../editor/gallery/galleryActions';
import { TemplateGallery } from '../editor/gallery/TemplateGallery';
import type { TemplateLibrarySnapshot } from '../library/TemplateLibrary';
import { copyTemplate, deleteTemplate } from '../library/templateActions';
import { templateUsage, type TemplateUsage } from '../library/templateUsage';
import type { LibraryTemplate } from '../model/resolvedTypes';
import type { StatblockRole } from '../model/roleTypes';
import type { TemplateId } from '../model/templateTypes';
import { rowDetail, templateRows, usageText, type TemplateRow } from './templateRows';
import { useTemplateNoteCounts } from './useTemplateNoteCounts';
import './template-list.scss';

export interface TemplateListProps {
  app: App;
  /** The collection's roles as the dialog holds them. */
  roles: readonly StatblockRole[];
  /** The templates of the collection's game system, which the gallery offers first. */
  systemTemplateIds: readonly TemplateId[];
  library: TemplateLibrarySnapshot | null;
  /** Saves the settings, closes the dialog and opens the template; rows offer no Open without it. */
  onEditTemplate?: ((templateId: TemplateId) => void) | undefined;
  /** Why Open cannot run now; null while it can. */
  editBlocked: string | null;
  /** The gallery's "Use for": the role starts from the new template, in the dialog's draft. */
  onUseForRole: (roleId: string, templateId: TemplateId) => void;
  /** A deleted template was replaced: the draft's roles that started from it start from the replacement. */
  onReplaceTemplate: (from: TemplateId, to: TemplateId) => void;
}

interface Deleting {
  entry: LibraryTemplate;
  usage: TemplateUsage;
}

/**
 * The Templates of the Statblocks tab (§9): the library's templates with how
 * many statblocks use them, the roles' first; New template opens the gallery,
 * and each row opens, duplicates or deletes its template. The library belongs
 * to the vault, so every collection lists the same templates.
 */
export function TemplateList(props: TemplateListProps): React.JSX.Element {
  const { app, roles, systemTemplateIds, library, onEditTemplate, editBlocked, onUseForRole, onReplaceTemplate } = props;
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [deleting, setDeleting] = useState<Deleting | null>(null);
  const counts = useTemplateNoteCounts(app);
  const rows = templateRows(library?.templates ?? [], roles, counts);
  const ownTemplates = (library?.templates ?? []).some((entry) => !entry.builtIn);

  const duplicate = (entry: LibraryTemplate): void => {
    copyTemplate(app, entry.template.id).catch((error: unknown) => {
      console.error('[Atlas] Copying a template failed:', error);
      showNotice("Couldn't copy the template.");
    });
  };

  const entriesOf = ({ entry }: TemplateRow): ContextMenuEntry[] => [
    ...(onEditTemplate
      ? [{ type: 'item' as const, label: 'Open', icon: 'pencil', disabled: editBlocked !== null, onClick: () => onEditTemplate(entry.template.id) }]
      : []),
    { type: 'item', label: 'Duplicate', icon: 'copy', onClick: () => duplicate(entry) },
    {
      type: 'item', label: 'Delete…', icon: 'trash-2', destructive: true, disabled: entry.builtIn,
      onClick: () => setDeleting({ entry, usage: templateUsage(app, entry.template.id) }),
    },
  ];

  const remove = async (replacement: TemplateId | null): Promise<void> => {
    if (!deleting) return;
    const id = deleting.entry.template.id;
    try {
      await deleteTemplate(app, id, replacement);
      if (replacement !== null) onReplaceTemplate(id, replacement);
      setDeleting(null);
    } catch (error) {
      console.error('[Atlas] Deleting a template failed:', error);
      showNotice("Couldn't delete the template.");
    }
  };

  return (
    <div ref={setRoot} className="atlas-csm-field atlas-sb-templates">
      <div className="atlas-sb-roles__head">
        <span className="atlas-csm-label">Templates</span>
        <Button variant="ghost" className="atlas-csm-add-btn atlas-sb-roles__revert" onClick={() => setGalleryOpen(true)}>
          <Plus />
          New template
        </Button>
      </div>
      <p className="atlas-csm-hint">Every collection in this vault shares these templates.</p>
      <ul className="atlas-sb-templates__list" aria-label="Templates">
        {rows.map((row) => (
          <li key={row.entry.template.id} className="atlas-sb-templates__row">
            <span className="atlas-sb-templates__name">{row.entry.name}</span>
            {rowDetail(row) && <span className="atlas-sb-templates__detail">{rowDetail(row)}</span>}
            <span className="atlas-sb-templates__usage">{usageText(row.count)}</span>
            <ActionsMenuButton label={`Actions for ${row.entry.name}`} entries={entriesOf(row)} className="atlas-sb-templates__more" />
          </li>
        ))}
      </ul>
      {!ownTemplates && library && !library.loading && <p className="atlas-sb-templates__empty">No statblock templates yet</p>}
      <AnimatePresence>
        {galleryOpen && root && (
          <TemplateGallery
            key="gallery"
            app={app}
            doc={root.doc}
            roles={roles}
            systemTemplateIds={systemTemplateIds}
            onUse={async (pick, roleId) => {
              const created = await createFromPick(app, pick);
              if (roleId !== null) onUseForRole(roleId, created.id);
              return created;
            }}
            onClose={() => setGalleryOpen(false)}
          />
        )}
      </AnimatePresence>
      {deleting && root && (
        <DeleteTemplateDialog
          anchor={root}
          name={deleting.entry.name}
          templateId={deleting.entry.template.id}
          usage={deleting.usage}
          templates={library?.templates ?? []}
          lostButtons={(deleting.entry.template.recovery ?? []).map((button) => button.name)}
          onDelete={remove}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
