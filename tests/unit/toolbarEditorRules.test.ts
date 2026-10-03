import { describe, expect, it, vi } from 'vitest';
import { hiddenMessage, movedMessage, shownMessage } from '../../src/app/packages/components/toolbar/editor/toolbarAnnouncements';
import { toolbarEditMenu } from '../../src/app/packages/components/toolbar/editor/toolbarEditMenus';
import { movedToolbarLayout } from '../../src/app/packages/components/toolbar/editor/toolbarMoves';
import { DEFAULT_TOOLBAR_ORDER, type ToolbarControlId } from '../../src/app/toolbar/toolbarCatalog';
import { resolveToolbarLayout, withControlHidden, type ToolbarLayout } from '../../src/app/toolbar/toolbarLayout';

const DEFAULT = resolveToolbarLayout({});
/** The bar of a GM with dynamic lighting off (no `wall`) in a build without ambient sound. */
const BAR: ToolbarControlId[] = DEFAULT_TOOLBAR_ORDER.filter(id => id !== 'wall' && id !== 'audio');

describe('moving a bar control', () => {
  it('steps one place left or right among the bar controls', () => {
    const right = movedToolbarLayout(DEFAULT, BAR, 'fog', 'right');
    expect(right && { from: right.from, to: right.to }).toEqual({ from: 2, to: 3 });
    expect(right?.layout.order.slice(0, 4)).toEqual(['move', 'draw', 'fog', 'text']);
    expect(movedToolbarLayout(DEFAULT, BAR, 'fog', 'left')?.layout.order.slice(0, 2)).toEqual(['fog', 'move']);
  });

  it('moves to either end', () => {
    expect(movedToolbarLayout(DEFAULT, BAR, 'measure', 'start')?.layout.order[0]).toBe('measure');
    const end = movedToolbarLayout(DEFAULT, BAR, 'move', 'end');
    expect(end?.layout.order.at(-1)).toBe('move');
    expect(end?.to).toBe(BAR.length);
  });

  it('goes nowhere past an end', () => {
    expect(movedToolbarLayout(DEFAULT, BAR, 'move', 'left')).toBeNull();
    expect(movedToolbarLayout(DEFAULT, BAR, 'palette', 'right')).toBeNull();
    expect(movedToolbarLayout(DEFAULT, BAR, 'move', 'start')).toBeNull();
  });

  it('steps over controls the view does not show, which keep their places', () => {
    // Lighting sits between measure and pin but is off here: pin moving left lands before measure.
    const moved = movedToolbarLayout(DEFAULT, BAR, 'pin', 'left');
    expect(moved?.layout.order).toEqual(['move', 'fog', 'draw', 'text', 'pin', 'measure', 'wall', 'audio', 'dice', 'loot', 'assets', 'palette']);
  });

  it('counts hidden controls nowhere', () => {
    const hidden: ToolbarLayout = withControlHidden(DEFAULT, 'fog');
    const bar = BAR.filter(id => id !== 'fog');
    const moved = movedToolbarLayout(hidden, bar, 'draw', 'left');
    expect(moved && { from: moved.from, to: moved.to }).toEqual({ from: 2, to: 1 });
    expect(moved?.layout.hidden.has('fog')).toBe(true);
  });
});

describe('the editor menu', () => {
  it('offers Hide on the bar and in "More tools", disabled for the Command palette', () => {
    const hide = vi.fn();
    const actions = { hide, show: vi.fn() };
    expect(toolbarEditMenu('fog', 'bar', actions)).toMatchObject([{ type: 'item', label: 'Hide', disabled: false }]);
    expect(toolbarEditMenu('palette', 'bar', actions)).toMatchObject([{ type: 'item', label: 'Hide', disabled: true }]);
    const [overflowEntry] = toolbarEditMenu('loot', 'overflow', actions);
    expect(overflowEntry).toMatchObject({ label: 'Hide', disabled: false });
    if (overflowEntry?.type === 'item') overflowEntry.onClick();
    expect(hide).toHaveBeenCalledWith('loot');
  });

  it('offers Show on toolbar in the tray', () => {
    const show = vi.fn();
    const [entry] = toolbarEditMenu('fog', 'tray', { hide: vi.fn(), show });
    expect(entry).toMatchObject({ type: 'item', label: 'Show on toolbar' });
    if (entry?.type === 'item') entry.onClick();
    expect(show).toHaveBeenCalledWith('fog');
  });
});

describe('the editor announcements', () => {
  it('says which key still selects a hidden tool, unless none is bound', () => {
    expect(hiddenMessage('Fog of war', 'F')).toBe('Fog of war hidden. F still selects it.');
    expect(hiddenMessage('Fog of war', 'Unassigned')).toBe('Fog of war hidden.');
  });

  it('names positions on the bar', () => {
    expect(movedMessage('Fog of war', 2, 5)).toBe('Fog of war moved from position 2 to 5.');
    expect(shownMessage('Fog of war', 2, 11)).toBe('Fog of war is back on the toolbar, position 2 of 11.');
  });
});
