import { describe, expect, it, vi } from 'vitest';
import { initiativeTrackerOptions } from '../../src/app/react/components/initiativeTrackerOptions';
import { DEFAULT_TURN_OPTIONS } from '../../src/app/initiative/turnOptions';
import type { PlayersListShape } from '../../src/app/initiative/initiativeLayout';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

const noop = (): void => undefined;

function options(playersList: PlayersListShape, party: { label: string; onClick: () => void } | null = null) {
  const setPlayersList = vi.fn();
  const entries = initiativeTrackerOptions(
    { autoSort: false, bySides: false, empty: false, compact: false, fromTurn: true, playersList, party, turn: DEFAULT_TURN_OPTIONS, online: false },
    { setAutoSort: noop, setCompact: noop, setFromTurn: noop, setPlayersList, setTurn: noop, clear: noop, resetNumbers: noop, addCombatant: noop, addEnemy: noop },
  );
  return { entries, setPlayersList };
}

describe('the tracker\'s options', () => {
  it('offer the players\' list as a vertical column or horizontal rows, the one in use ticked', () => {
    const { entries, setPlayersList } = options('horizontal');
    const submenu = entries.find((entry): entry is Extract<ContextMenuEntry, { type: 'submenu' }> => entry.type === 'submenu' && entry.label === 'Players\' list');
    if (!submenu || !Array.isArray(submenu.children)) throw new Error('no "Players\' list" submenu');
    const items = submenu.children.flatMap((entry) => (entry.type === 'item' ? [entry] : []));
    expect(items.map((item) => [item.label, item.checked])).toEqual([['Vertical', false], ['Horizontal', true]]);
    void items[0]!.onClick?.();
    expect(setPlayersList).toHaveBeenCalledWith('vertical');
  });

  it('hold the party row, and no names switch or left edge', () => {
    const onClick = vi.fn();
    const labels = options('vertical', { label: 'Add the party', onClick }).entries.flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));
    expect(labels).toContain('Add the party');
    expect(labels).not.toContain('Show names');
    expect(labels).not.toContain('Tracker on the left');
    expect(options('vertical').entries.some((entry) => entry.type === 'item' && entry.label === 'Add the party')).toBe(false);
  });
});
