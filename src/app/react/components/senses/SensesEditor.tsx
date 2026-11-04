import React, { useEffect, useId, useRef, useState } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Pencil, Plus, RotateCcw } from 'lucide-react';
import { t } from '../../../i18n';
import { senseSummary } from '../../../gameSystems/senseEditing';
import { findSense } from '../../../gameSystems/senseRules';
import { senseRows, type SenseRow } from '../../../lighting/tokenLighting';
import { Button } from '../../../packages/components/primitives/button';
import { useExclusiveDropdown } from '../../../packages/components/primitives/useExclusiveDropdown';
import type { SenseDefinition, TokenSense } from '../../../types/senseTypes';
import { numberText } from '../../../utils/numberInput';
import { InheritedSenseRow, SenseRowFields } from './SenseRows';

interface SensesEditorProps {
  /** The senses being edited; null while the token has none of its own. */
  senses: SenseRow[] | null;
  onChange: (senses: SenseRow[] | null) => void;
  /** The senses of the collection, which the list offers. */
  definitions: readonly SenseDefinition[];
  /** Game unit of the map, e.g. "ft". */
  unit: string;
  /** Shown while the list is empty. */
  emptyText: string;
  /**
   * The senses the token takes from its linked statblock while it has none of its own. They
   * show read-only until "Edit senses" copies them onto the token.
   */
  inheritedSenses?: readonly TokenSense[];
  /** Phrases of the statblock's senses line that name no sense of the collection; shown as they are written. */
  notRecognised?: readonly string[];
}

/** Whether `row` still says what the statblock says about its sense. */
function fromStatblock(row: SenseRow, inherited: readonly TokenSense[]): boolean {
  return inherited.some((sense) => sense.id === row.id && numberText(sense.range) === row.range.trim());
}

/**
 * A list of senses: one row per sense with its range where it takes one, a way to remove it,
 * and a menu of the collection's other senses to add, each with what it does.
 */
export function SensesEditor({ senses, onChange, definitions, unit, emptyText, inheritedSenses = [], notRecognised = [] }: SensesEditorProps): React.ReactElement {
  const labelId = useId();
  const { isOpen: adding, setIsOpen: setAdding, onCloseAutoFocus } = useExclusiveDropdown();
  const [focusId, setFocusId] = useState<string | null>(null);
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null);
  const ranges = useRef(new Map<string, HTMLInputElement>());
  // Set while the menu closes for a sense that was picked: its range field takes the focus, not the button.
  const picked = useRef(false);

  // Whether the token's own list stands in place of its statblock's by the GM's choice: it came
  // with one beside a statblock, or "Edit senses" took the statblock's. Only then is an emptied
  // list kept ("no senses, whatever the statblock says"); otherwise the token has no list again.
  const cameWithOwn = useRef(senses !== null);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const detached = chosen ?? (cameWithOwn.current && inheritedSenses.length > 0);

  const following = senses === null && inheritedSenses.length > 0;
  const rows = senses ?? [];
  const available = following ? [] : definitions.filter((definition) => !rows.some((row) => row.id === definition.id));

  // The sense just added takes the focus in its range field, or the list's button when it has
  // none; so does the button when a sense was removed, whose own button is gone.
  useEffect(() => {
    if (focusId === null) return;
    (ranges.current.get(focusId) ?? addButton)?.focus();
    setFocusId(null);
  }, [focusId, addButton]);

  const add = (definition: SenseDefinition): void => {
    picked.current = true;
    onChange([...rows, { id: definition.id, range: '' }]);
    setAdding(false);
    setFocusId(definition.id);
  };

  const remove = (index: number): void => {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.length > 0 || detached ? next : null);
    setAdding(false);
    setFocusId(rows[index]?.id ?? null);
  };

  return (
    <div className="atlas-senses" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="atlas-senses__label">{t('senses.title')}</span>
      {following || rows.length > 0 ? (
        <ul className="atlas-senses__list" role="list">
          {following
            ? inheritedSenses.map((sense) => (
              <InheritedSenseRow key={sense.id} sense={sense} definition={findSense(definitions, sense.id)} unit={unit} />
            ))
            : rows.map((row, index) => (
              <SenseRowFields
                key={row.id}
                row={row}
                definition={findSense(definitions, row.id)}
                unit={unit}
                fromStatblock={fromStatblock(row, inheritedSenses)}
                inputRef={(input) => {
                  if (input) ranges.current.set(row.id, input);
                  else ranges.current.delete(row.id);
                }}
                onRangeChange={(range) => onChange(rows.map((other, i) => (i === index ? { ...other, range } : other)))}
                onRemove={() => remove(index)}
              />
            ))}
        </ul>
      ) : (
        <p className="atlas-senses__empty">{emptyText}</p>
      )}
      {notRecognised.length > 0 && <p className="atlas-senses__empty">{t('senses.notRecognised', { phrases: notRecognised.join(', ') })}</p>}

      {(following || available.length > 0 || (senses !== null && inheritedSenses.length > 0)) && (
        <div className="atlas-senses__actions">
          {following && (
            <Button variant="outline" size="sm" onClick={() => { setChosen(true); onChange(senseRows(inheritedSenses)); }}>
              <Pencil />
              {t('senses.edit')}
            </Button>
          )}
          {available.length > 0 && (
            <DropdownMenu.Root open={adding} onOpenChange={setAdding} modal={false}>
              <DropdownMenu.Trigger asChild>
                <Button ref={setAddButton} variant="outline" size="sm">
                  <Plus />
                  {t('senses.add')}
                </Button>
              </DropdownMenu.Trigger>
              {/* Inside the dialog that holds the list: the menu stacks above it, and Escape in it stays in it. */}
              <DropdownMenu.Portal container={addButton?.closest<HTMLElement>('.atlas-modal') ?? addButton?.ownerDocument.body}>
                <DropdownMenu.Content
                  className="atlas-ctx-menu atlas-ctx-menu--dropdown atlas-senses-menu"
                  side="top"
                  align="start"
                  sideOffset={4}
                  collisionPadding={8}
                  onCloseAutoFocus={(event) => {
                    if (picked.current) event.preventDefault();
                    else onCloseAutoFocus(event);
                    picked.current = false;
                  }}
                  onEscapeKeyDown={(event) => event.stopPropagation()}
                >
                  {available.map((definition) => (
                    <DropdownMenu.Item key={definition.id} className="atlas-ctx-item atlas-sense-offer" onSelect={() => add(definition)}>
                      <span className="atlas-sense-offer__name">{definition.name}</span>
                      <span className="atlas-sense-offer__text">{senseSummary(definition)}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
          {senses !== null && inheritedSenses.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => { setAdding(false); setChosen(false); onChange(null); }}>
              <RotateCcw />
              {t('senses.followStatblock')}
            </Button>
          )}
        </div>
      )}

    </div>
  );
}
