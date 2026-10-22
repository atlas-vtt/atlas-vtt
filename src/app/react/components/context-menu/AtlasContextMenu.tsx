import React, { useEffect, useReducer, useRef } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { setIcon } from 'obsidian';
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
    /** Said after the label in a quieter tone, e.g. the character a player plays, a key, or the template a statblock role starts from. */
    detail?: string;
    /** Choosing the item leaves the menu open, for toggles that are often picked several at a time. */
    keepOpen?: boolean;
    /** − value + controls after the label, also driven by the + and - keys while the item is highlighted. */
    stepper?: MenuStepper;
    /** What choosing the row does, in a sentence or two: a tooltip beside the row while it is pointed at or focused. */
    description?: string;
  }
  | {
    type: 'submenu';
    label: string;
    icon?: string;
    /** A function is read again whenever `subscribe` reports a change, so an open submenu stays current. */
    children: ContextMenuEntry[] | (() => ContextMenuEntry[]);
    subscribe?: (onChange: () => void) => () => void;
  }
  | { type: 'custom'; render: () => React.ReactNode };

export interface MenuStepper {
  value: string;
  /** Names the stepped quantity for assistive technology, e.g. "Frightened". */
  label: string;
  onDecrement: () => unknown;
  onIncrement: () => unknown;
  canDecrement: boolean;
}

/** A line between two groups of rows. */
export const MENU_SEPARATOR: ContextMenuEntry = {
  type: 'custom',
  render: () => <div className="atlas-ctx-separator" role="separator" />,
};

type ContextMenuItemEntry = Extract<ContextMenuEntry, { type: 'item' }>;
type ContextMenuSubmenuEntry = Extract<ContextMenuEntry, { type: 'submenu' }>;

/** Submenus share the document and visible view of the menu that opened them. */
export interface ContextMenuPlacement {
  collisionBoundary?: Element | null | undefined;
  container?: HTMLElement | undefined;
}

/** Runs an entry's action; a rejected async action is logged rather than left unhandled. */
function runEntryAction(entry: ContextMenuItemEntry): void {
  const result = entry.onClick();
  if (result instanceof Promise) {
    runInBackground(result, `Context menu action "${entry.label}"`);
  }
}

// ── Icon helper ─────────────────────────────────────────────────────────────

/** An Obsidian icon in a menu row's icon slot; an empty name keeps the slot, so labels line up. */
export function MenuIcon({ name }: { name: string }): React.ReactElement {
  return name ? <ObsidianIcon name={name} /> : <span className="atlas-ctx-icon-spacer" />;
}

function ObsidianIcon({ name }: { name: string }): React.ReactElement {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      while (ref.current.firstChild) {
        ref.current.removeChild(ref.current.firstChild);
      }
      setIcon(ref.current, name);
    }
  }, [name]);

  return <span ref={ref} className="atlas-ctx-icon" />;
}

/** A submenu's entries, rebuilt whenever the submenu reports that they changed. */
function SubmenuEntries({ entry, onClose, placement }: { entry: ContextMenuSubmenuEntry; onClose: () => void; placement: ContextMenuPlacement }): React.ReactElement {
  const [, refresh] = useReducer((version: number) => version + 1, 0);
  useEffect(() => entry.subscribe?.(refresh), [entry]);
  const children = typeof entry.children === 'function' ? entry.children() : entry.children;
  return <>{renderEntries(children, onClose, placement)}</>;
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
          <ObsidianIcon name="minus" />
        </button>
      </LabelTooltip>
      <span className="atlas-ctx-stepper__value">{stepper.value}</span>
      <LabelTooltip label={t('menu.raise', { label: stepper.label })}>
        <button type="button" tabIndex={-1} className="atlas-ctx-stepper__button" onClick={stepperClick(stepper.onIncrement)}>
          <ObsidianIcon name="plus" />
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

/** The label, in an element of its own where something stands beside it that it has to make room for. */
function itemLabel(entry: ContextMenuItemEntry): React.ReactNode {
  const label = <span className="atlas-ctx-item__label">{entry.label}</span>;
  if (entry.leading) {
    return (
      <span className="atlas-ctx-item__leading">
        {entry.leading}
        {label}
      </span>
    );
  }
  return entry.detail !== undefined ? label : entry.label;
}

function ItemContent({ entry }: { entry: ContextMenuItemEntry }): React.ReactElement {
  return (
    <>
      {itemLabel(entry)}
      {entry.detail !== undefined && <span className="atlas-ctx-item__detail">{entry.detail}</span>}
      {(entry.stepper || entry.checked !== undefined) && (
        <span className="atlas-ctx-item__trailing">
          {entry.stepper && <Stepper stepper={entry.stepper} />}
          {entry.checked !== undefined && (
            <DropdownMenu.ItemIndicator forceMount className="atlas-ctx-item__check">
              <ObsidianIcon name="check" />
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
  placement: ContextMenuPlacement = {},
): React.ReactNode[] {
  return entries.map((entry, idx) => {
    switch (entry.type) {
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
                {entry.icon ? <ObsidianIcon name={entry.icon} /> : <span className="atlas-ctx-icon-spacer" />}
                <span className="atlas-ctx-item__label">{entry.label}</span>
              </span>
              <span className="atlas-ctx-item__trailing">
                <ObsidianIcon name="chevron-right" />
              </span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal container={placement.container}>
              <DropdownMenu.SubContent
                className="atlas-ctx-menu"
                sideOffset={4}
                alignOffset={-4}
                avoidCollisions
                collisionBoundary={placement.collisionBoundary ?? []}
                collisionPadding={8}
              >
                <SubmenuEntries entry={entry} onClose={onClose} placement={placement} />
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
        const row = entry.checked !== undefined
          ? (
            <DropdownMenu.CheckboxItem className={className} checked={entry.checked} {...disabled} onSelect={onSelect} onKeyDown={stepperKeys(entry.stepper)}>
              <ItemContent entry={entry} />
            </DropdownMenu.CheckboxItem>
          )
          : (
            <DropdownMenu.Item className={className} {...disabled} onSelect={onSelect} onKeyDown={stepperKeys(entry.stepper)}>
              <ItemContent entry={entry} />
            </DropdownMenu.Item>
          );
        const key = `${entry.checked !== undefined ? 'check' : 'item'}-${idx}`;
        return entry.description
          ? <LabelTooltip key={key} label={entry.description} side="right" describe multiline>{row}</LabelTooltip>
          : <React.Fragment key={key}>{row}</React.Fragment>;
      }
    }
  });
}
