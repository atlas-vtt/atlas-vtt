import { describe, expect, it, vi } from 'vitest';
import { initiativeTrackerOptions } from '../../src/app/react/components/initiativeTrackerOptions';
import { DEFAULT_TURN_OPTIONS } from '../../src/app/initiative/turnOptions';
import { toggledEdge, type PlayersListEdge } from '../../src/app/initiative/initiativeLayout';
import type { ContextMenuEntry } from '../../src/app/react/components/context-menu/AtlasContextMenu';

describe('the players\' list submenu, which stays open while the GM ticks', () => {
  it('ticks every edge and the facing in a row from what they are now, not from when the menu opened', () => {
    // The settings as the GM's ticks leave them
    const now = { edges: ['right'] as PlayersListEdge[], facesPlayers: true };
    const listeners = new Set<() => void>();
    const changed = (): void => listeners.forEach((listener) => listener());
    const noop = (): void => undefined;
    const entries = initiativeTrackerOptions(
      {
        autoSort: false, bySides: false, empty: false, showNames: false, compact: false, fromTurn: true, dock: 'right', gmDock: 'right',
        playersList: () => now, subscribeSettings: (onChange) => { listeners.add(onChange); return () => listeners.delete(onChange); },
        turn: DEFAULT_TURN_OPTIONS, online: false,
      },
      {
        setAutoSort: noop, setShowNames: noop, setCompact: noop, setFromTurn: noop, setGmDock: noop, setTurn: noop, clear: noop,
        resetNumbers: noop, addCombatant: noop, addEnemy: noop,
        setEdges: vi.fn((edges: PlayersListEdge[]) => { now.edges = edges; changed(); }),
        setFacesPlayers: vi.fn((on: boolean) => { now.facesPlayers = on; changed(); }),
      },
    );
    const submenu = entries.find((entry): entry is Extract<ContextMenuEntry, { type: 'submenu' }> => entry.type === 'submenu' && entry.label === 'Players\' list');
    if (!submenu || typeof submenu.children !== 'function') throw new Error('no live "Players\' list" submenu');
    const read = submenu.children;
    let shown = read();
    submenu.subscribe?.(() => { shown = read(); });
    const pick = (label: string): void => {
      const item = shown.find((entry) => entry.type === 'item' && entry.label === label);
      if (item?.type !== 'item') throw new Error(`no ${label}`);
      void item.onClick?.();
    };
    pick('Left, top to bottom');
    pick('Top, side by side');
    pick('Bottom, side by side');
    expect(now.edges).toEqual(['left', 'right', 'top', 'bottom']);
    const ticked = shown.flatMap((entry) => (entry.type === 'item' && entry.checked ? [entry.label] : []));
    expect(ticked).toEqual(['Left, top to bottom', 'Right, top to bottom', 'Top, side by side', 'Bottom, side by side', 'Turn toward the players at each edge']);
    // Off and on again
    pick('Turn toward the players at each edge');
    expect(now.facesPlayers).toBe(false);
    pick('Turn toward the players at each edge');
    expect(now.facesPlayers).toBe(true);
    pick('Top, side by side');
    expect(now.edges).toEqual(toggledEdge(['left', 'right', 'top', 'bottom'], 'top'));
  });
});
