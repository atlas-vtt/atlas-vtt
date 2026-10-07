import React, { useEffect, useReducer } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ObsidianIcon } from '../ObsidianIcon';
import { runInBackground } from '../../../utils/backgroundTask';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import './atlas-context-menu.scss';
import { t } from '../../../i18n';

// ── Entry descriptor (declarative menu definition) ──────────────────────────

// `onClick` may be async: the menu logs a rejected action rather than leaving it unhandled.
export type ContextMenuEntry =
  | {
    type: 'item';
    label: string;
    icon?: string;
    onClick: () => unknown;
    checked?: boolean;
    disabled?: boolean;
    destructive?: boolean;
    /** Drawn before the label, e.g. a condition's badge. */
    leading?: React.ReactNode;
    /** Choosing the item leaves the menu open, for toggles that are often picked several at a time. */
    keepOpen?: boolean;
    /** − value + controls after the label, also driven by the + and - keys while the item is highlighted. */
    stepper?: MenuStepper;
  }
  | {
    type: 'submenu';
    label: string;
    icon?: string;
    /** A function is read again whenever `subscribe` reports a change, so an open submenu stays current. */
    children: ContextMenuEntries;
    subscribe?: (onChange: () => void) => () => void;
  }
  | { type: 'custom'; render: () => React.ReactNode }
  /** A heading row over the entries that follow: plain text, not focusable and never chosen. */
  | { type: 'label'; text: string }
  | { type: 'separator' };

/** A menu's entries: a function is read again whenever the menu's `subscribe` reports a change, so an open menu stays current. */
export type ContextMenuEntries = ContextMenuEntry[] | (() => ContextMenuEntry[]);

export interface MenuStepper {
  value: string;
  /** Names the stepped quantity for assistive technology, e.g. "Frightened". */
  label: string;
  onDecrement: () => unknown;
  onIncrement: () => unknown;
  canDecrement: boolean;
}

type ContextMenuItemEntry = Extract<ContextMenuEntry, { type: 'item' }>;
type ContextMenuSubmenuEntry = Extract<ContextMenuEntry, { type: 'submenu' }>;

/** Runs an entry's action; a rejected async action is logged rather than left unhandled. */
function runEntryAction(entry: ContextMenuItemEntry): void {
  const result = entry.onClick();
  if (result instanceof Promise) {
    runInBackground(result, `Context menu action "${entry.label}"`);
  }
}

// ── Icon helper ─────────────────────────────────────────────────────────────

function CtxIcon({ name }: { name: string }): React.ReactElement {
  return <ObsidianIcon name={name} className="atlas-ctx-icon" />;
}

interface LiveEntriesProps {
  entries: ContextMenuEntries;
  subscribe?: ((onChange: () => void) => () => void) | undefined;
  onClose: () => void;
  /** Closes the menu once a rebuild leaves nothing to show (the root menu; an empty submenu just shows nothing). */
  closeWhenEmpty?: boolean;
}

/** A menu's entries, rebuilt whenever `subscribe` reports that they changed. Rows keep their keys (by index), so focus survives a rebuild of the same shape. */
export function LiveEntries({ entries, subscribe, onClose, closeWhenEmpty = false }: LiveEntriesProps): React.ReactElement {
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  useEffect(() => subscribe?.(refresh), [subscribe]);
  const list = typeof entries === 'function' ? entries() : entries;
  const empty = list.length === 0;
  useEffect(() => { if (closeWhenEmpty && empty) onClose(); }, [closeWhenEmpty, empty, onClose]);
  return <>{renderEntries(list, onClose)}</>;
}

/** A submenu's entries, rebuilt whenever the submenu reports that they changed. */
function SubmenuEntries({ entry, onClose }: { entry: ContextMenuSubmenuEntry; onClose: () => void }): React.ReactElement {
  return <LiveEntries entries={entry.children} subscribe={entry.subscribe} onClose={onClose} />;
}

/** Runs a stepper action from a click inside a menu item without choosing the item. */
function stepperClick(action: () => unknown): (event: React.MouseEvent) => void {
  return (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
  };
}

function Stepper({ stepper }: { stepper: MenuStepper }): React.ReactElement {
  return (
    <span className="atlas-ctx-stepper">
      <LabelTooltip label={t('menu.lower', { label: stepper.label })}>
        <button type="button" tabIndex={-1} className="atlas-ctx-stepper__button" disabled={!stepper.canDecrement} onClick={stepperClick(stepper.onDecrement)}>
          <CtxIcon name="minus" />
        </button>
      </LabelTooltip>
      <span className="atlas-ctx-stepper__value">{stepper.value}</span>
      <LabelTooltip label={t('menu.raise', { label: stepper.label })}>
        <button type="button" tabIndex={-1} className="atlas-ctx-stepper__button" onClick={stepperClick(stepper.onIncrement)}>
          <CtxIcon name="plus" />
        </button>
      </LabelTooltip>
    </span>
  );
}

/** The + and - keys step a highlighted item's value. */
function stepperKeys(stepper: MenuStepper | undefined): ((event: React.KeyboardEvent) => void) | undefined {
  if (!stepper) return undefined;
  return (event) => {
    if (event.key === '+' || event.key === '=') stepper.onIncrement();
    else if (event.key === '-' && stepper.canDecrement) stepper.onDecrement();
    else return;
    event.preventDefault();
  };
}

function ItemContent({ entry }: { entry: ContextMenuItemEntry }): React.ReactElement {
  return (
    <>
      {entry.leading ? (
        <span className="atlas-ctx-item__leading">
          {entry.leading}
          <span className="atlas-ctx-item__label">{entry.label}</span>
        </span>
      ) : entry.label}
      {(entry.stepper || entry.checked !== undefined) && (
        <span className="atlas-ctx-item__trailing">
          {entry.stepper && <Stepper stepper={entry.stepper} />}
          {entry.checked !== undefined && (
            <DropdownMenu.ItemIndicator forceMount className="atlas-ctx-item__check">
              <CtxIcon name="check" />
            </DropdownMenu.ItemIndicator>
          )}
        </span>
      )}
    </>
  );
}

// ── Render entries recursively ──────────────────────────────────────────────

export function renderEntries(
  entries: ContextMenuEntry[],
  onClose: () => void,
): React.ReactNode[] {
  return entries.map((entry, idx) => {
    switch (entry.type) {
      case 'label':
        return (
          <DropdownMenu.Label key={`label-${idx}`} className="atlas-ctx-label">
            <span role="presentation">{entry.text}</span>
          </DropdownMenu.Label>
        );

      case 'separator':
        return <DropdownMenu.Separator key={`separator-${idx}`} className="atlas-ctx-separator" />;

      case 'custom':
        return (
          <div key={`custom-${idx}`} className="atlas-ctx-custom" role="none">
            {entry.render()}
          </div>
        );

      case 'submenu':
        return (
          <DropdownMenu.Sub key={`sub-${idx}`}>
            <DropdownMenu.SubTrigger
              className={`atlas-ctx-item atlas-ctx-submenu-trigger`}
            >
              <span className="atlas-ctx-item__leading">
                {entry.icon ? <CtxIcon name={entry.icon} /> : <span className="atlas-ctx-icon-spacer" />}
                <span className="atlas-ctx-item__label">{entry.label}</span>
              </span>
              <span className="atlas-ctx-item__trailing">
                <CtxIcon name="chevron-right" />
              </span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="atlas-ctx-menu"
                sideOffset={4}
                alignOffset={-4}
                avoidCollisions
                collisionPadding={8}
              >
                <SubmenuEntries entry={entry} onClose={onClose} />
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
        );

      case 'item':
      default: {
        const className = `atlas-ctx-item${entry.destructive ? ' atlas-ctx-item--destructive' : ''}`;
        const onSelect = (event: Event): void => {
          runEntryAction(entry);
          if (entry.keepOpen) event.preventDefault();
          else onClose();
        };
        const disabled = entry.disabled !== undefined ? { disabled: entry.disabled } : {};
        if (entry.checked !== undefined) {
          return (
            <DropdownMenu.CheckboxItem key={`check-${idx}`} className={className} checked={entry.checked} {...disabled} onSelect={onSelect} onKeyDown={stepperKeys(entry.stepper)}>
              <ItemContent entry={entry} />
            </DropdownMenu.CheckboxItem>
          );
        }
        return (
          <DropdownMenu.Item key={`item-${idx}`} className={className} {...disabled} onSelect={onSelect} onKeyDown={stepperKeys(entry.stepper)}>
            <ItemContent entry={entry} />
          </DropdownMenu.Item>
        );
      }
    }
  });
}
