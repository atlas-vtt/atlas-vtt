import React, { useEffect, useRef } from 'react';
import { isActiveAtlasLeaf } from '../../utils/activeLeafGuard';
import type { InitiativeEntry } from '../../types/initiativeTypes';
import { t } from '../../i18n';

/**
 * Compact popup for editing an entry's initiative and the GM's own modifier, which wins over
 * the statblock's; positioned like the statblock preview, anchored to the card.
 */
interface EditInitiativePopupProps {
  entry: InitiativeEntry;
  anchorRect: DOMRect;
  value: string;
  onChange: (value: string) => void;
  /** The GM's own modifier as typed; empty where the statblock's counts. */
  modifier: string;
  onModifierChange: (modifier: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  /** The side of the card it opens on: away from the edge the tracker stands at. */
  side?: 'left' | 'right';
}

export function EditInitiativePopup({
  entry,
  anchorRect,
  value,
  onChange,
  modifier,
  onModifierChange,
  onConfirm,
  onCancel,
  side = 'left',
}: EditInitiativePopupProps): React.ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const padding = 16;

  // Focus input on mount
  useEffect(() => {
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 50);
  }, []);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (!isActiveAtlasLeaf()) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);

  // Beside the card, centred on it vertically, on the side away from the tracker's edge
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const anchorCenterY = anchorRect.top + anchorRect.height / 2;
  const popupHeight = 72; // Approximate height of the compact popup

  let top = anchorCenterY - popupHeight / 2;
  top = Math.max(padding, Math.min(viewportHeight - popupHeight - padding, top));

  const horizontal = side === 'left' ? { right: viewportWidth - anchorRect.left + padding } : { left: anchorRect.right + padding };

  return (
    <>
      {/* Backdrop to close on click outside */}
      <div
        className="atlas-initiative-edit-backdrop"
        onClick={onCancel}
      />
      <div
        ref={popupRef}
        className={`atlas-initiative-edit-popup atlas-initiative-edit-popup--${side}`}
        style={{
          position: 'fixed',
          top,
          ...horizontal,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="atlas-initiative-edit-popup__fields">
          <label className="atlas-initiative-edit-popup__field">
            <span className="atlas-initiative-edit-popup__caption">{t('initiative.total')}</span>
            <input
              ref={inputRef}
              type="number"
              className="atlas-initiative-edit-popup__input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="0"
            />
          </label>
          <label className="atlas-initiative-edit-popup__field">
            <span className="atlas-initiative-edit-popup__caption">{t('initiative.modifier')}</span>
            <input
              type="number"
              className="atlas-initiative-edit-popup__input atlas-initiative-edit-popup__input--modifier"
              value={modifier}
              onChange={(e) => onModifierChange(e.target.value)}
              placeholder={t('initiative.modifierFromStatblock')}
            />
          </label>
        </div>
        <span className="atlas-initiative-edit-popup__hint">{t('initiative.editHint')}</span>
      </div>
    </>
  );
}
