import { useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { classes } from './classes.ts';
import type { ShownReaction } from './logAuthors.ts';
import type { RowApi, RowFlags } from './panelTypes.ts';
import { RowTools } from './RowTools.tsx';
import { toList, useKeepFocus } from './useKeepFocus.ts';

export interface RowShellProps extends RowFlags {
  readonly id: string;
  readonly className: string;
  readonly reactions: readonly ShownReaction[];
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly api: RowApi;
  readonly children: ReactNode;
}

/** What a press on a row is meant for itself: its buttons, fields and tools. */
const CONTROLS = 'button, textarea, input, a, [contenteditable], [role="button"], [role="toolbar"]';

/** Whether text of the row is selected: the click that ends a selection is no click on the row. */
function selecting(row: HTMLElement | null): boolean {
  return (row?.ownerDocument.getSelection()?.toString() ?? '') !== '';
}

/**
 * A chat message's or a roll's row: its place in the list, and its tools while the mouse is over
 * it, the keyboard is in it, a finger tapped it or it asks before deleting. The tools exist only
 * then, so a long log holds a few buttons, not a thousand. In the whole log a plain click on the
 * row (not on a control, not ending a selection) or Enter on it opens its thread; a finger's tap
 * shows its tools instead.
 */
export function RowShell({ id, className, reactions, canEdit, canDelete, api, children, editing, asking, tapped, highlighted, selected, tabStop }: RowShellProps): ReactElement {
  const row = useRef<HTMLDivElement>(null);
  const pointer = useRef('mouse');
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = !editing && (hovered || focused || tapped || asking);
  const opener = api.thread === null && !editing;

  useKeepFocus(row, toList);

  const onPointerEnter = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse') setHovered(true);
  };
  const onPointerLeave = (): void => {
    setHovered(false);
    if (asking && !focused && !tapped) api.askDelete(null);
  };
  // Only the keyboard's focus shows the tools: a click focuses what it hits, too.
  const onFocus = (event: FocusEvent): void => setFocused(event.target.matches(':focus-visible'));
  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setFocused(false);
    if (asking && !hovered && !tapped) api.askDelete(null);
  };
  const onClick = (event: MouseEvent): void => {
    if ((event.target as Element).closest(CONTROLS) !== null) return;
    if (pointer.current !== 'mouse') return api.tap(id);
    const plain = event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (opener && plain && !selecting(row.current)) api.openThread(id);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.target !== event.currentTarget || !opener || event.nativeEvent.isComposing) return;
    event.preventDefault();
    api.openThread(id);
  };

  return (
    <div
      ref={row}
      className={classes('atlas-online-log__row', className, active && 'is-active', opener && 'is-opener', selected && 'is-selected', highlighted && 'is-highlighted')}
      data-entry={id}
      tabIndex={tabStop ? 0 : -1}
      onPointerDown={(event) => { pointer.current = event.pointerType; }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {active && <RowTools id={id} reactions={reactions} canEdit={canEdit} canDelete={canDelete} asking={asking} api={api} />}
      {children}
    </div>
  );
}
