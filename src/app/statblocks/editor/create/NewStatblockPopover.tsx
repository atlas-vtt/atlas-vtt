import React, { useEffect, useId, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAnchoredPopoverVariants } from '../../../packages/components/primitives/dialogMotion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { t } from '../../../i18n';
import './create-statblock.scss';

export interface NewStatblockPopoverProps {
  /** The role the statblock is made with, muted beside the field's label. */
  roleName: string;
  /** Called with the trimmed name when Enter is pressed on one. */
  onCreate: (name: string) => void;
  /** Escape, or a press anywhere else. */
  onCancel: () => void;
}

/**
 * The one field that names a new statblock where no token gives it a name
 * (commands, the file menu; §7.3): Enter creates, Escape or a press elsewhere
 * cancels. It grows out of the top of the window, where the role menu was.
 */
export function NewStatblockPopover({ roleName, onCreate, onCancel }: NewStatblockPopoverProps): React.JSX.Element {
  const [name, setName] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const variants = useAnchoredPopoverVariants();

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Captured on the popover's own document, so it works in a popout and before Obsidian's keys see it.
  useEffect(() => {
    const popover = popoverRef.current;
    const doc = popover?.ownerDocument;
    if (!popover || !doc) return undefined;
    const onPointerDown = (event: PointerEvent): void => {
      if (!event.composedPath().includes(popover)) onCancel();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || handledByAnotherControl(event)) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('keydown', onKeyDown, true);
    return (): void => {
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('keydown', onKeyDown, true);
    };
  }, [onCancel]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onCreate(trimmed);
  };

  return (
    <motion.div
      ref={popoverRef}
      className="atlas-sb-new-popover"
      role="dialog"
      aria-labelledby={`${id}-label`}
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="atlas-sb-new-popover__header">
        <label id={`${id}-label`} htmlFor={`${id}-name`} className="atlas-sb-new-popover__label">{t('statblockEditor.newStatblock')}</label>
        <span className="atlas-sb-new-popover__role">{roleName}</span>
      </div>
      <input
        ref={inputRef}
        id={`${id}-name`}
        type="text"
        className="atlas-sb-new-popover__input"
        placeholder={t('statblockEditor.name')}
        spellCheck={false}
        autoComplete="off"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </motion.div>
  );
}
