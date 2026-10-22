import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { handledByAnotherControl } from '../../../keyboard/tooltipEscape';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import { formatList, t } from '../../../i18n';
import type { TemplateUsage } from '../../library/templateUsage';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { TemplateId } from '../../model/templateTypes';

/** The Select's value for leaving the statblocks and roles as they are. */
const KEEP = '';

export interface DeleteTemplateDialogProps {
  /** An element of the editor: the dialog opens in its window. */
  anchor: HTMLElement;
  name: string;
  templateId: TemplateId;
  usage: TemplateUsage;
  templates: readonly LibraryTemplate[];
  /** The names of the template's recovery buttons, which go with it: a replacement offers its own. */
  lostButtons: readonly string[];
  onDelete: (replacement: TemplateId | null) => Promise<void>;
  onClose: () => void;
}

function usageText(usage: TemplateUsage): string | null {
  const count = usage.notes.length;
  const roles = usage.roles.length;
  const parts: string[] = [];
  if (count > 0) parts.push(count === 1 ? '1 statblock' : `${count} statblocks`);
  if (roles > 0) parts.push(roles === 1 ? `the role ${usage.roles[0]?.roleName ?? ''}` : `${roles} roles`);
  if (parts.length === 0) return null;
  const sentence = `${parts.join(' and ')} ${count + roles === 1 ? 'uses' : 'use'} it.`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}`;
}

/**
 * Delete… from the header's menu (§7.4): what uses the template, and the
 * template they switch to; left as they are, they show with the auto
 * template. The file goes to the trash.
 */
export function DeleteTemplateDialog(props: DeleteTemplateDialogProps): React.JSX.Element {
  const { anchor, name, templateId, usage, templates, lostButtons, onDelete, onClose } = props;
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();
  const selectId = useId();
  const [replacement, setReplacement] = useState<string>(KEEP);
  const [busy, setBusy] = useState(false);
  const windowRef = useRef<HTMLDivElement>(null);
  const used = usageText(usage);
  const lost = lostButtons;
  const options: SelectOption<string>[] = [
    { value: KEEP, label: 'Leave them as they are' },
    ...templates.filter((entry) => entry.template.id !== templateId)
      .map((entry) => ({ value: entry.template.id, label: entry.name, ...(entry.builtIn && { detail: 'Built-in' }) })),
  ];

  // Focus moves in, so Escape reaches the dialog before a dialog it opened over (the collection settings).
  useEffect(() => windowRef.current?.focus({ preventScroll: true }), []);

  const confirm = (): void => {
    setBusy(true);
    void onDelete(replacement === KEEP ? null : replacement).finally(() => setBusy(false));
  };

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-te-dialog-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || handledByAnotherControl(event.nativeEvent)) return;
        event.preventDefault();
        onClose();
      }}
    >
      <motion.div
        ref={windowRef}
        className="atlas-te-dialog"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="atlas-te-dialog__header">
          <h2 id={titleId}>Delete {name}?</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-te-dialog__body">
          <p className="atlas-te-dialog__text">The template goes to the trash. Statblocks keep their values.</p>
          {lost.length > 0 && (
            <p className="atlas-te-dialog__text">{t('rest.lostWithTemplate', { count: lost.length, list: formatList(lost) })}</p>
          )}
          {used && (
            <div className="atlas-te-dialog__field">
              <p className="atlas-te-dialog__text">{used}</p>
              <span id={selectId} className="atlas-te-dialog__label">Switch them to</span>
              <Select value={replacement} options={options} onChange={setReplacement} labelledBy={selectId} />
            </div>
          )}
        </div>
        <div className="atlas-te-dialog__footer">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button type="button" variant="destructive" size="sm" disabled={busy} onClick={confirm}>{busy ? 'Deleting…' : 'Delete'}</Button>
        </div>
      </motion.div>
    </motion.div>,
    anchor.doc.body,
  );
}
