import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { type App } from 'obsidian';
import { showNotice } from '../../../ui/notice';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { TemplateLibrary } from '../../library/TemplateLibrary';
import { useTemplateLibrary } from '../../library/useTemplateLibrary';
import type { StatblockRole } from '../../model/roleTypes';
import type { TemplateId } from '../../model/templateTypes';
import { fsLayoutItems, offersFsLayouts } from '../fs-import/fsGalleryItems';
import { showImportOutcome, showLayoutImportDialog } from '../fs-import/layoutImportFlow';
import { moveLabel } from '../fs-import/importReportText';
import { useLayoutsToMove } from '../fs-import/useLayoutsToMove';
import { statblockCount } from '../../fs/fsLayoutStatblocks';
import { runInBackground } from '../../../utils/backgroundTask';
import type { CreatedTemplate, GalleryPick } from './galleryActions';
import { GallerySourceNav } from './GallerySourceNav';
import { UseForField } from './UseForField';
import {
  firstSource, gallerySources, roleFor, rolesWithoutOwnTemplate, sourceTemplates, type GallerySourceId,
} from './gallerySources';
import { StatblockSourcePanel } from './StatblockSourcePanel';
import { noteValues, statblockNoteChoices, statblockTemplate } from './statblockNotes';
import { BLANK_ITEM, TemplateGrid, templateItem } from './TemplateGrid';
import { t } from '../../../i18n';
import './template-gallery.scss';

export interface TemplateGalleryProps {
  app: App;
  /** The document of the window the gallery opens in. */
  doc: Document;
  /** The roles of the collection the gallery works for: "Use for" offers those without a template of their own. */
  roles: readonly StatblockRole[];
  /** The templates the collection's game system starts its roles from ("This system"). */
  systemTemplateIds: readonly TemplateId[];
  /**
   * Use template: makes the pick (opens it unsaved, or writes it and gives it
   * to the role). The gallery closes once this settles, showing the report of
   * a layout it imported.
   */
  onUse: (pick: GalleryPick, roleId: string | null) => Promise<CreatedTemplate | null>;
  onClose: () => void;
}

type Chosen = Partial<Record<GallerySourceId, string>>;

/**
 * "New template" (§7.9): an Atlas dialog with the sources on the left and the
 * templates of the chosen one as cards. Use template (or a double click)
 * makes an editable copy; "Use for" gives it to a role of the collection that
 * has no template of its own.
 */
export function TemplateGallery({ app, doc, roles, systemTemplateIds, onUse, onClose }: TemplateGalleryProps): React.JSX.Element {
  const library = useTemplateLibrary(app);
  const sources = useMemo(() => gallerySources(systemTemplateIds, offersFsLayouts(app)), [app, systemTemplateIds]);
  const [source, setSource] = useState<GallerySourceId>(() => firstSource(sources));
  const [chosen, setChosen] = useState<Chosen>({});
  const [useFor, setUseFor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const panelId = useId();
  const windowVariants = useDialogWindowVariants();

  const builtIns = useMemo(() => (library?.templates ?? []).filter((entry) => entry.builtIn), [library]);
  const fsItems = useMemo(() => (source === 'fantasy-statblocks' ? fsLayoutItems(app) : []), [app, source]);
  const fsLayouts = useMemo(() => fsItems.map((item) => item.layout), [fsItems]);
  const toMove = useLayoutsToMove(app, fsLayouts, library?.templates ?? null);
  const items = useMemo(() => {
    if (source === 'blank') return [BLANK_ITEM];
    if (source === 'fantasy-statblocks') {
      return fsItems.map((item) => {
        const waiting = toMove.get(item.layout.id);
        return waiting ? { ...item, detail: t('statblockEditor.toMove', { count: statblockCount(waiting.statblocks) }) } : item;
      });
    }
    const lookup = (id: TemplateId): ReturnType<TemplateLibrary['get']> => TemplateLibrary.forApp(app).get(id);
    return sourceTemplates(source, builtIns, systemTemplateIds, lookup).map(templateItem);
  }, [app, source, builtIns, systemTemplateIds, fsItems, toMove]);
  const notes = useMemo(() => (source === 'statblock' ? statblockNoteChoices(app) : []), [app, source]);
  const selected = chosen[source] ?? items[0]?.id ?? null;

  /** What Use template makes from a card or note of the current source. */
  const pickOf = (id: string | null): GalleryPick | null => {
    if (source === 'blank') return { kind: 'blank' };
    if (!id) return null;
    if (source === 'statblock') {
      const template = statblockTemplate(noteValues(app, id));
      return template ? { kind: 'statblock', path: id, template } : null;
    }
    if (source === 'fantasy-statblocks') {
      const layout = fsItems.find((item) => item.id === id)?.layout;
      return layout ? { kind: 'fs-layout', layout } : null;
    }
    const entry = TemplateLibrary.forApp(app).get(id);
    return entry ? { kind: 'template', entry } : null;
  };
  const pick = pickOf(selected);

  const inVault = (id: TemplateId): boolean => (library?.templates ?? []).some((entry) => !entry.builtIn && entry.template.id === id);
  const candidates = rolesWithoutOwnTemplate(roles, inVault);
  /** The role "Use for" names: the user's choice, else the one that starts from the picked template. */
  const roleOf = (target: GalleryPick | null): string | null =>
    (useFor !== undefined ? useFor : roleFor(candidates, target?.kind === 'template' ? target.entry.template.id : null));

  useEffect(() => {
    const radio = windowRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
    (radio ?? windowRef.current)?.focus({ preventScroll: true });
  }, []);

  const use = (id?: string): void => {
    const target = id === undefined ? pick : pickOf(id);
    if (!target || busy) return;
    setBusy(true);
    onUse(target, roleOf(target))
      .then((created) => {
        onClose();
        // The import's report, and the batch for the statblocks its layout draws (§6.2).
        if (created?.fsImport) {
          const { layout, imported } = created.fsImport;
          runInBackground(showImportOutcome(app, doc, layout, imported), `Showing the import of ${layout.name}`);
        }
      })
      .catch((error: unknown) => {
        console.error('[Atlas] Creating a template from the gallery failed:', error);
        showNotice(t('statblockEditor.templateCreateFailed'));
        setBusy(false);
      });
  };

  const choose = (id: string): void => setChosen((was) => ({ ...was, [source]: id }));

  /** A layout imported before, whose statblocks are not all moved yet: the batch again, in place of the gallery. */
  const moving = pick?.kind === 'fs-layout' ? toMove.get(pick.layout.id) : undefined;
  const move = (): void => {
    if (!moving) return;
    onClose();
    showLayoutImportDialog({ app, doc, ...moving });
  };

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      ref={setLayer}
      className="atlas-vtt-plugin atlas-te-gallery-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
        // Taken here, so a dialog the gallery opened from (the collection settings) stays open.
        event.preventDefault();
        onClose();
      }}
    >
      <motion.div
        ref={windowRef}
        className="atlas-te-gallery"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="atlas-te-gallery__header">
          <h2 id={titleId}>{t('statblockEditor.newTemplate')}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-te-gallery__body">
          <GallerySourceNav sources={sources} value={source} panelId={panelId} onChange={setSource} />
          <div id={panelId} className="atlas-te-gallery__content" role="tabpanel">
            {source === 'statblock' ? (
              <StatblockSourcePanel app={app} notes={notes} selected={chosen.statblock ?? null} layer={layer} onSelect={choose} onUse={() => use()} />
            ) : (
              <TemplateGrid
                app={app}
                label={sources.find((entry) => entry.id === source)?.label ?? t('statblockEditor.templates')}
                items={items}
                selected={selected}
                layer={layer}
                onSelect={choose}
                onUse={(id) => { choose(id); use(id); }}
              />
            )}
          </div>
        </div>
        <div className="atlas-te-gallery__footer">
          {candidates.length > 0 && <UseForField roles={candidates} value={roleOf(pick)} onChange={setUseFor} layer={layer} />}
          <Button type="button" variant="outline" size="sm" onClick={onClose}>{t('statblockEditor.cancel')}</Button>
          {moving && (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={move}>{moveLabel(statblockCount(moving.statblocks))}…</Button>
          )}
          <Button type="button" variant="default" size="sm" disabled={!pick || busy} onClick={() => use()}>
            {busy ? t('statblockEditor.creating') : t('statblockEditor.useTemplate')}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    doc.body,
  );
}
