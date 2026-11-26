import React, { useId, useRef, useState } from 'react';
import { CloseButton } from '../../primitives/CloseButton';
import { useDialogEscape } from '../../primitives/useDialogEscape';
import { useFocusTrap } from '../../primitives/useFocusTrap';
import { TransferScrollContext } from './transferScroll';

interface TransferDialogProps {
  /** Names the dialog for assistive technology; the hero shows it visually. */
  label: string;
  onClose: () => void;
  /** Full-bleed banner at the top of the main pane. */
  hero: React.ReactNode;
  /** Image whose colours tint the whole dialog. */
  ambientUrl?: string | undefined;
  /** Side rail next to the main pane, e.g. the cover picker. */
  aside?: React.ReactNode;
  /** Shown at the start of the footer, e.g. how much the bundle holds. */
  summary?: React.ReactNode;
  actions: React.ReactNode;
  children: React.ReactNode;
}

/** The cinematic modal frame shared by the export and import dialogs. */
export function TransferDialog({ label, onClose, hero, ambientUrl, aside, summary, actions, children }: TransferDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  const labelId = useId();
  // State rather than a ref: lists inside need the pane once it exists.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  useDialogEscape(dialogRef, onClose);
  useFocusTrap(dialogRef);
  return (
    <div className="atlas-transfer-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="atlas-transfer-dialog"
        data-with-aside={aside ? true : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        onClick={(event) => event.stopPropagation()}
      >
        <span id={labelId} hidden>{label}</span>
        {ambientUrl && <img key={ambientUrl} className="atlas-transfer-dialog__ambient" src={ambientUrl} alt="" aria-hidden="true" />}
        <CloseButton className="atlas-transfer-dialog__close" onClick={onClose} />
        <div ref={setScroller} className="atlas-transfer-dialog__main">
          {hero}
          <TransferScrollContext.Provider value={scroller}>
            <div className="atlas-transfer-dialog__content">{children}</div>
          </TransferScrollContext.Provider>
        </div>
        {/* A plain group: the asset manager behind already has the page's one sidebar landmark. */}
        {aside && <div className="atlas-transfer-dialog__aside">{aside}</div>}
        <div className="atlas-transfer-dialog__footer">
          <span className="atlas-transfer-summary">{summary}</span>
          {actions}
        </div>
      </div>
    </div>
  );
}
