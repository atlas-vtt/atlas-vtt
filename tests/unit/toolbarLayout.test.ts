import { describe, expect, it } from 'vitest';
import { DEFAULT_TOOLBAR_ORDER, type ToolbarControlId } from '../../src/app/toolbar/toolbarCatalog';
import {
  controlPlacement,
  isDefaultToolbarLayout,
  nextVisitArmed,
  orderedToolbarIds,
  readToolbarLayout,
  resolveToolbarLayout,
  storedToolbarLayout,
  withControlAfter,
  withControlHidden,
  withControlShown,
  type ToolbarLayout,
} from '../../src/app/toolbar/toolbarLayout';

const DEFAULT = resolveToolbarLayout({});
const layoutOf = (order: readonly ToolbarControlId[], hidden: ToolbarControlId[] = []): ToolbarLayout => ({ order, hidden: new Set(hidden) });

describe('readToolbarLayout', () => {
  it('reads anything that is not a plain record as the default', () => {
    for (const stored of [undefined, null, 'x', 3, ['fog'], new Date()]) expect(readToolbarLayout(stored)).toEqual({});
  });

  it('keeps distinct strings, ids of newer versions included, and never hides the Command palette', () => {
    expect(readToolbarLayout({ order: [1, 'fog', 'fog', '', 'future', null, 'move'], hidden: ['palette', 'future', 'dice', 'dice', false] }))
      .toEqual({ order: ['fog', 'future', 'move'], hidden: ['future', 'dice'] });
  });

  it('drops lists that are empty or not lists, and over-long ids', () => {
    expect(readToolbarLayout({ order: 'fog', hidden: [] })).toEqual({});
    expect(readToolbarLayout({ order: ['x'.repeat(65), 'fog'] })).toEqual({ order: ['fog'] });
  });

  it('keeps at most 64 ids per list', () => {
    const ids = Array.from({ length: 80 }, (_, index) => `tool-${index}`);
    expect(readToolbarLayout({ order: ids }).order).toHaveLength(64);
  });
});

describe('resolveToolbarLayout', () => {
  it('gives the default order without a stored one', () => {
    expect(DEFAULT.order).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(DEFAULT.hidden.size).toBe(0);
    expect(isDefaultToolbarLayout(DEFAULT)).toBe(true);
  });

  it('applies a custom order and places a control it lacks after its default predecessor', () => {
    const resolved = resolveToolbarLayout({ order: ['palette', 'dice', 'move', 'future', 'fog'], hidden: ['loot', 'future', 'palette'] });
    // loot follows dice, its default predecessor, and assets follows loot; draw follows fog.
    expect(resolved.order.slice(0, 6)).toEqual(['palette', 'dice', 'loot', 'assets', 'move', 'fog']);
    expect(resolved.order.indexOf('draw')).toBe(resolved.order.indexOf('fog') + 1);
    expect([...resolved.order].sort()).toEqual([...DEFAULT_TOOLBAR_ORDER].sort());
    expect([...resolved.hidden]).toEqual(['loot']);
  });

  it('places controls of a later version after the control before them by default', () => {
    expect(orderedToolbarIds(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'd', 'a', 'b']);
    expect(orderedToolbarIds(['a', 'b', 'c'], ['b', 'future'])).toEqual(['a', 'b', 'c']);
    expect(orderedToolbarIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('storedToolbarLayout', () => {
  it('stores nothing for the default layout', () => {
    expect(storedToolbarLayout({}, DEFAULT)).toEqual({});
  });

  it('leaves out the order while it is the default and an empty hidden list', () => {
    expect(storedToolbarLayout({}, withControlHidden(DEFAULT, 'fog'))).toEqual({ hidden: ['fog'] });
    const moved = withControlAfter(DEFAULT, 'palette', null);
    expect(storedToolbarLayout({}, moved)).toEqual({ order: ['palette', ...DEFAULT_TOOLBAR_ORDER.filter(id => id !== 'palette')] });
  });

  it('keeps the ids of a newer version at their place through a round trip', () => {
    const previous = readToolbarLayout({ order: ['future', 'move', 'fog', 'later', 'draw'], hidden: ['future', 'fog'] });
    const next = withControlAfter(resolveToolbarLayout(previous), 'draw', null);
    const stored = storedToolbarLayout(previous, next);
    expect(stored.order?.slice(0, 5)).toEqual(['future', 'draw', 'move', 'fog', 'later']);
    expect(stored.hidden).toEqual(['fog', 'future']);
    expect(resolveToolbarLayout(stored).order).toEqual(next.order);
  });
});

describe('layout operations', () => {
  const order: ToolbarControlId[] = ['move', 'fog', 'draw', 'palette'];

  it('moves a control to the start, the middle and the end', () => {
    expect(withControlAfter(layoutOf(order), 'draw', null).order).toEqual(['draw', 'move', 'fog', 'palette']);
    expect(withControlAfter(layoutOf(order), 'move', 'fog').order).toEqual(['fog', 'move', 'draw', 'palette']);
    expect(withControlAfter(layoutOf(order), 'move', 'palette').order).toEqual(['fog', 'draw', 'palette', 'move']);
  });

  it('shows a control it moves', () => {
    const moved = withControlAfter(layoutOf(order, ['fog']), 'fog', 'palette');
    expect(moved.hidden.has('fog')).toBe(false);
    expect(withControlAfter(layoutOf(order, ['fog']), 'fog', 'fog').order).toEqual(order);
  });

  it('keeps a hidden control in its slot and shows it there again', () => {
    const hidden = withControlHidden(layoutOf(order), 'fog');
    expect(hidden.order).toEqual(order);
    expect([...hidden.hidden]).toEqual(['fog']);
    const shown = withControlShown(hidden, 'fog');
    expect(shown.order).toEqual(order);
    expect(shown.hidden.size).toBe(0);
  });

  it('never hides the Command palette', () => {
    const layout = layoutOf(order);
    expect(withControlHidden(layout, 'palette')).toBe(layout);
  });
});

describe('the undo/redo bar', () => {
  it('reads it from the hidden list and never from the order', () => {
    expect(readToolbarLayout({ order: ['undo', 'fog', 'move'], hidden: ['undo', 'fog'] })).toEqual({ order: ['fog', 'move'], hidden: ['undo', 'fog'] });
    expect(readToolbarLayout({ order: ['undo'] })).toEqual({});
  });

  it('resolves it as hidden without giving it a place in the order', () => {
    const resolved = resolveToolbarLayout({ hidden: ['undo'] });
    expect(resolved.order).toEqual(DEFAULT_TOOLBAR_ORDER);
    expect(resolved.hidden.has('undo')).toBe(true);
    expect(isDefaultToolbarLayout(resolved)).toBe(false);
  });

  it('stores it first in the hidden list, keeps unknown ids, and stores nothing once it shows again', () => {
    const previous = readToolbarLayout({ hidden: ['future', 'fog'] });
    const hidden = withControlHidden(resolveToolbarLayout(previous), 'undo');
    expect(hidden.order).toEqual(DEFAULT_TOOLBAR_ORDER);
    const stored = storedToolbarLayout(previous, hidden);
    expect(stored).toEqual({ hidden: ['undo', 'fog', 'future'] });
    expect(storedToolbarLayout({ hidden: ['undo'] }, withControlShown(resolveToolbarLayout({ hidden: ['undo'] }), 'undo'))).toEqual({});
    expect(storedToolbarLayout({}, withControlHidden(DEFAULT, 'undo'))).toEqual({ hidden: ['undo'] });
  });

  it('keeps it hidden while controls move and show', () => {
    const layout = withControlHidden(DEFAULT, 'undo');
    expect(withControlAfter(layout, 'palette', null).hidden.has('undo')).toBe(true);
    expect(withControlShown(withControlHidden(layout, 'fog'), 'fog').hidden.has('undo')).toBe(true);
  });
});

describe('visits', () => {
  const booleans = [false, true] as const;

  it('places every combination of hidden, active, editing and armed', () => {
    for (const hidden of booleans) for (const active of booleans) for (const editing of booleans) for (const armed of booleans) {
      const expected = !hidden ? 'bar' : active && armed && !editing ? 'visiting' : 'hidden';
      expect(controlPlacement(hidden, active, editing, armed), JSON.stringify({ hidden, active, editing, armed })).toBe(expected);
    }
  });

  it('arms a visit only when a control becomes active while hidden outside edit mode', () => {
    for (const wasActive of booleans) for (const wasArmed of booleans) for (const active of booleans) for (const hidden of booleans) for (const editing of booleans) {
      const expected = active && !editing && (wasArmed || (hidden && !wasActive));
      const state = JSON.stringify({ wasActive, wasArmed, active, hidden, editing });
      expect(nextVisitArmed({ active: wasActive, armed: wasArmed }, active, hidden, editing), state).toBe(expected);
    }
  });

  it('does not arm a control that is active when first seen', () => {
    expect(nextVisitArmed(undefined, true, true, false)).toBe(false);
  });

  it('lets a hidden Move stay hidden while it rests, and visit once selected again', () => {
    // Hidden in the editor while active: leaving edit mode does not bring it back.
    let memory = { active: true, armed: nextVisitArmed(undefined, true, true, true) };
    memory = { active: true, armed: nextVisitArmed(memory, true, true, false) };
    expect(controlPlacement(true, true, false, memory.armed)).toBe('hidden');
    // Another tool, then Move again.
    memory = { active: false, armed: nextVisitArmed(memory, false, true, false) };
    memory = { active: true, armed: nextVisitArmed(memory, true, true, false) };
    expect(controlPlacement(true, true, false, memory.armed)).toBe('visiting');
  });
});
