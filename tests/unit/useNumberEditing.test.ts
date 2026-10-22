// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useNumberEditing } from '../../src/app/react/components/useNumberEditing';
import type { InitiativeEntry } from '../../src/app/types/initiativeTypes';

const entryOf = (id: string, initiative: number): InitiativeEntry => ({
  id, tokenId: id, name: id, initiative, initiativeModifier: 0, imagePath: '', isActive: false, isNPC: true, order: 0,
});

/** A tracker that sorts itself anew after every number, as Auto sort does. */
function autoSortingTracker(initial: InitiativeEntry[]): { editing: () => string | null; type: (text: string, key: 'Tab' | 'Shift+Tab' | 'Enter') => void; start: (id: string) => void; visited: string[] } {
  let entries = initial;
  const visited: string[] = [];
  const hook = renderHook(({ list }) => useNumberEditing(list, (id, changes) => {
    entries = entries.map((entry) => (entry.id === id ? { ...entry, ...changes } : entry)).sort((a, b) => b.initiative - a.initiative);
  }), { initialProps: { list: entries } });
  const current = (): InitiativeEntry => entries.find((entry) => entry.id === hook.result.current.editingId)!;
  return {
    editing: () => hook.result.current.editingId,
    start: (id) => {
      act(() => hook.result.current.start(entries.find((entry) => entry.id === id)!));
      visited.push(id);
    },
    type: (text, key) => {
      act(() => hook.result.current.commit(current(), text, key === 'Tab' ? 1 : key === 'Shift+Tab' ? -1 : 0));
      hook.rerender({ list: entries });
      if (hook.result.current.editingId) visited.push(hook.result.current.editingId);
    },
    visited,
  };
}

describe('typing a table of initiatives with Tab', () => {
  it('visits every card once in the order the GM saw, however the list sorts itself meanwhile', () => {
    const tracker = autoSortingTracker([entryOf('A', 20), entryOf('B', 15), entryOf('C', 10), entryOf('D', 5)]);
    tracker.start('A');
    for (const text of ['3', '12', '1']) tracker.type(text, 'Tab');
    tracker.type('2', 'Tab');

    expect(tracker.visited).toEqual(['A', 'B', 'C', 'D']);
    expect(tracker.editing()).toBeNull();
  });

  it('goes back with Shift+Tab in the same order', () => {
    const tracker = autoSortingTracker([entryOf('A', 20), entryOf('B', 15), entryOf('C', 10)]);
    tracker.start('A');
    tracker.type('3', 'Tab');
    tracker.type('1', 'Shift+Tab');

    expect(tracker.visited).toEqual(['A', 'B', 'A']);
  });

  it('starts a new run from the list as it stands, once a run ended', () => {
    const tracker = autoSortingTracker([entryOf('A', 20), entryOf('B', 15), entryOf('C', 10)]);
    tracker.start('A');
    tracker.type('3', 'Enter');
    expect(tracker.editing()).toBeNull();

    // The list now reads B, C, A: Tab from B goes on to C
    tracker.start('B');
    tracker.type('15', 'Tab');
    expect(tracker.editing()).toBe('C');
  });
});
