import React, { useEffect, useRef, useState } from 'react';
import { Reorder } from 'framer-motion';
import { Plus } from 'lucide-react';
import { cn } from '../../../../utils/cn';
import { t } from '../../../i18n';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { MAX_RECOVERY_BUTTONS, type RecoveryButton } from '../../../recovery/recoveryTypes';
import { RailNameInput } from './RailNameInput';

interface RecoveryRailProps {
  buttons: readonly RecoveryButton[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Adds a button named `name`; its id, or null where none was added. */
  onAdd: (name: string) => string | null;
  onRename: (id: string, name: string) => void;
  onReorder: (order: readonly string[]) => void;
  onMove: (id: string, step: number) => void;
  onRemove: (id: string) => void;
}

/** What takes focus once the rail has drawn: a button by id, or the Add button. */
type FocusRequest = { id: string } | 'add' | null;

/**
 * The template's recovery buttons as a row of capsules and an Add button. A click selects a
 * button, a double click (or F2) renames it in place, a drag (or Alt with an arrow) moves it, and
 * Delete or Backspace removes it, focus going to the next, else the previous, else Add.
 */
export function RecoveryRail({ buttons, selected, onSelect, onAdd, onRename, onReorder, onMove, onRemove }: RecoveryRailProps): React.ReactElement {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [focus, setFocus] = useState<FocusRequest>(null);
  const capsules = useRef(new Map<string, HTMLButtonElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const full = buttons.length >= MAX_RECOVERY_BUTTONS;

  useEffect(() => {
    if (focus === null) return;
    const target = focus === 'add' ? addRef.current : capsules.current.get(focus.id);
    target?.focus({ preventScroll: true });
    setFocus(null);
  }, [focus, buttons]);

  const remove = (id: string): void => {
    const at = buttons.findIndex((button) => button.id === id);
    const next = buttons[at + 1] ?? buttons[at - 1];
    onRemove(id);
    setFocus(next ? { id: next.id } : 'add');
  };

  const onCapsuleKey = (event: React.KeyboardEvent<HTMLButtonElement>, id: string): void => {
    const at = buttons.findIndex((button) => button.id === id);
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      event.stopPropagation();
      remove(id);
    } else if (event.key === 'F2') {
      event.preventDefault();
      setRenaming(id);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      if (event.altKey) {
        onMove(id, step);
        setFocus({ id });
        return;
      }
      const next = buttons[at + step];
      if (next) setFocus({ id: next.id });
      else if (step > 0) setFocus('add');
    }
  };

  const commitNew = (name: string): void => {
    setAdding(false);
    if (name.trim() === '') {
      setFocus('add');
      return;
    }
    const id = onAdd(name);
    setFocus(id === null ? 'add' : { id });
  };

  return (
    <div className="atlas-rc-rail" role="group" aria-label={t('recoveryEditor.buttons')}>
      <Reorder.Group as="div" axis="x" className="atlas-rc-rail__capsules" values={buttons.map((button) => button.id)} onReorder={onReorder}>
        {buttons.map((button) => (
          <Reorder.Item key={button.id} value={button.id} as="div" className="atlas-rc-rail__slot" dragListener={renaming !== button.id}>
            {renaming === button.id ? (
              <RailNameInput
                initial={button.name}
                onCommit={(name) => {
                  setRenaming(null);
                  if (name.trim() !== '') onRename(button.id, name);
                  setFocus({ id: button.id });
                }}
                onCancel={() => { setRenaming(null); setFocus({ id: button.id }); }}
              />
            ) : (
              <LabelTooltip label={t('recoveryEditor.buttonTip')} describe>
                <button
                  ref={(element) => { if (element) capsules.current.set(button.id, element); else capsules.current.delete(button.id); }}
                  type="button"
                  className={cn('atlas-rc-capsule', selected === button.id && 'atlas-selected')}
                  aria-pressed={selected === button.id}
                  onClick={() => onSelect(button.id)}
                  onDoubleClick={() => setRenaming(button.id)}
                  onKeyDown={(event) => onCapsuleKey(event, button.id)}
                >
                  <span className="atlas-rc-capsule__name">{button.name}</span>
                  {button.rules.length > 0 && <span className="atlas-rc-capsule__count" aria-hidden="true">{button.rules.length}</span>}
                </button>
              </LabelTooltip>
            )}
          </Reorder.Item>
        ))}
      </Reorder.Group>
      {adding && <RailNameInput initial="" onCommit={commitNew} onCancel={() => { setAdding(false); setFocus('add'); }} />}
      {!adding && (
        <LabelTooltip label={full ? t('recoveryEditor.addFull', { count: MAX_RECOVERY_BUTTONS }) : t('recoveryEditor.add')}>
          <button
            ref={addRef}
            type="button"
            className="atlas-rc-rail__add"
            aria-disabled={full || undefined}
            onClick={() => { if (!full) setAdding(true); }}
          >
            <Plus aria-hidden="true" />
          </button>
        </LabelTooltip>
      )}
    </div>
  );
}
