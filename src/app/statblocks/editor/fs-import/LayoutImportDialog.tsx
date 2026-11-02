import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { useDialogEscape } from '../../../packages/components/primitives/useDialogEscape';
import type { FsLayoutImport, LayoutIdentity } from '../../fs/fsImport';
import { statblockCount, type LayoutStatblocks } from '../../fs/fsLayoutStatblocks';
import { moveLabel, readyTitle } from './importReportText';
import { partsOnlyFsShows } from './layoutImportActions';
import { AdoptionSection, ImportSummary } from './LayoutImportParts';
import { useLayoutAdoption } from './useLayoutAdoption';
import { t } from '../../../i18n';
import './layout-import-dialog.scss';

export interface LayoutImportDialogProps {
  app: App;
  /** The document of the window the dialog opens in. */
  doc: Document;
  layout: LayoutIdentity;
  /** The layout's template, with the report of an import made just now. */
  imported: FsLayoutImport;
  /** The statblocks the layout draws, which the batch moves to Atlas. */
  statblocks: LayoutStatblocks;
  /** Opens the template in the template editor; without it there is no Open template. */
  onOpenTemplate?: (() => void) | undefined;
  onClose: () => void;
}

/**
 * What an import of a Fantasy Statblocks layout made (§6.2) and the batch
 * that moves the layout's statblocks to Atlas (§6.4), in one dialog: what
 * Atlas can show now, then "Move 214 statblocks to Atlas" with what moving
 * does and the statblocks folded away, progress, Cancel and what it did.
 */
export function LayoutImportDialog({ app, doc, layout, imported, statblocks, onOpenTemplate, onClose }: LayoutImportDialogProps): React.JSX.Element {
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const { phase, adopt, cancel } = useLayoutAdoption(app, statblocks, imported.id);
  const [fsOnlyParts] = useState(() => partsOnlyFsShows(app, imported));
  const total = statblockCount(statblocks);
  const name = layout.name.trim() || imported.name;
  const running = phase.kind === 'running';
  const offersMove = total > 0 && phase.kind === 'ready';
  // Closing while notes are switched stops at the next note.
  const close = (): void => {
    cancel();
    onClose();
  };
  useDialogEscape(windowRef, close);
  useEffect(() => windowRef.current?.focus({ preventScroll: true }), []);

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-te-dialog-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !running) close(); }}
    >
      <motion.div
        ref={windowRef}
        className="atlas-te-dialog atlas-fs-import"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="atlas-te-dialog__header">
          <h2 id={titleId}>{readyTitle(name)}</h2>
          <CloseButton onClick={close} />
        </div>
        <div className="atlas-te-dialog__body">
          <ImportSummary layoutName={name} fsOnlyParts={fsOnlyParts} report={imported.report} />
          {total > 0 && <AdoptionSection statblocks={statblocks} phase={phase} />}
        </div>
        <div className="atlas-te-dialog__footer">
          {running ? (
            <Button type="button" variant="outline" size="sm" onClick={cancel}>{t('statblockEditor.cancel')}</Button>
          ) : (
            <>
              {onOpenTemplate && (
                <Button type="button" variant="outline" size="sm" onClick={() => { onOpenTemplate(); close(); }}>{t('statblockEditor.fs.openTemplate')}</Button>
              )}
              {offersMove ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={close}>{t('statblockEditor.fs.notNow')}</Button>
                  <Button type="button" size="sm" onClick={adopt}>{moveLabel(total)}</Button>
                </>
              ) : (
                <Button type="button" size="sm" onClick={close}>{t('statblockEditor.done')}</Button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>,
    doc.body,
  );
}
