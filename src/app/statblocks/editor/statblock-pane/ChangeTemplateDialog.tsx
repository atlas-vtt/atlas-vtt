import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { App } from 'obsidian';
import { handledByAnotherControl, STANDING_LIST } from '../../../keyboard/tooltipEscape';
import { Button } from '../../../packages/components/primitives/button';
import { CloseButton } from '../../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../../packages/components/primitives/dialogMotion';
import type { LibraryTemplate } from '../../model/resolvedTypes';
import type { StatblockRole } from '../../model/roleTypes';
import type { TemplateId } from '../../model/templateTypes';
import { StatblockSheet } from '../../render/StatblockSheet';
import type { FieldRecord } from '../../values/fieldValues';
import { templateGroups, unshownKeys } from './templateChoices';

export interface ChangeTemplateDialogProps {
  app: App;
  /** The element the dialog belongs to; it opens in that element's window. */
  anchor: HTMLElement;
  notePath: string;
  record: FieldRecord;
  currentId: TemplateId | null;
  templates: readonly LibraryTemplate[];
  roles: readonly StatblockRole[];
  onApply: (templateId: TemplateId) => void;
  onClose: () => void;
}

/**
 * Change template… (§7.2): the library's templates on the left, the
 * collection's roles first; on the right this statblock as it reads with the
 * chosen one, and the note's values that template does not show. Apply writes
 * only `atlas-template`; no value is touched.
 */
export function ChangeTemplateDialog(props: ChangeTemplateDialogProps): React.JSX.Element {
  const { app, anchor, notePath, record, currentId, templates, roles, onApply, onClose } = props;
  const groups = useMemo(() => templateGroups(templates, roles), [templates, roles]);
  const [chosenId, setChosenId] = useState<TemplateId | null>(currentId ?? groups[0]?.items[0]?.entry.template.id ?? null);
  const chosen = templates.find((entry) => entry.template.id === chosenId) ?? null;
  const unshown = chosen ? unshownKeys(record, chosen.template) : [];
  const windowVariants = useDialogWindowVariants();
  const titleId = useId();

  useEffect(() => {
    const doc = anchor.doc;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || handledByAnotherControl(event)) return;
      event.preventDefault();
      onClose();
    };
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [anchor, onClose]);

  return createPortal(
    <motion.div
      {...dialogOverlayMotion}
      className="atlas-vtt-plugin atlas-sb-change-template-overlay"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <motion.div className="atlas-sb-change-template" variants={windowVariants} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="atlas-sb-change-template__header">
          <h2 id={titleId}>Change template</h2>
          <CloseButton onClick={onClose} />
        </div>
        <div className="atlas-sb-change-template__body">
          <div className="atlas-sb-change-template__list" role="listbox" aria-labelledby={titleId} {...STANDING_LIST}>
            {groups.map((group) => (
              <div key={group.heading} role="group" aria-label={group.heading} className="atlas-sb-change-template__group">
                <div className="atlas-sb-change-template__group-heading" aria-hidden="true">{group.heading}</div>
                {group.items.map(({ entry, detail }) => (
                  <div
                    key={entry.template.id}
                    role="option"
                    tabIndex={0}
                    aria-selected={entry.template.id === chosenId}
                    className="atlas-sb-change-template__option"
                    onClick={() => setChosenId(entry.template.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setChosenId(entry.template.id);
                    }}
                  >
                    <span className="atlas-sb-change-template__name">{entry.name}</span>
                    {detail && <span className="atlas-sb-change-template__detail">{detail}</span>}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="atlas-sb-change-template__preview">
            {chosen && (
              <StatblockSheet template={chosen.template} name={chosen.name} fields={record} variant="full" app={app} sourcePath={notePath} rollBonuses="preview" />
            )}
            {unshown.length > 0 && (
              <p className="atlas-sb-change-template__unshown">Not shown with this template: {unshown.join(', ')}</p>
            )}
          </div>
        </div>
        <div className="atlas-sb-change-template__footer">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!chosenId || chosenId === currentId}
            onClick={() => { if (chosenId) onApply(chosenId); }}
          >
            Apply
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    anchor.doc.body,
  );
}
