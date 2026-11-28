import { keptHotkeys, readHotkeyOverrides, type HotkeyOverrides } from '../../keyboard/hotkeyOverrides';
import { DEFAULT_DICE_LOOK, isDiceColour, isDiceFont, type DiceLook } from '../../dice3d/diceLook';
import { readListEdge, readListEdges, type InitiativeLayout } from '../../initiative/initiativeLayout';
import type { InitiativeTurnOptions } from '../../initiative/turnOptions';
import type { PreferenceRow, StoredEntries } from './preferenceRow';

/** Only the bindings the user changed; resolve them with `resolveHotkeys`. Bindings of actions a newer Atlas added are written back unchanged. */
const hotkeys: PreferenceRow<HotkeyOverrides> = {
  store: 'synced',
  keys: ['hotkeys'],
  read: (stored) => readHotkeyOverrides(stored('hotkeys')),
  write: (overrides, stored) => ({ hotkeys: { ...keptHotkeys(stored('hotkeys')), ...overrides } }),
  rebasesOnArrival: true,
};

const readDiceLook = (stored: StoredEntries): DiceLook => {
  const colour = stored('diceColour');
  const font = stored('diceFont');
  return { colour: isDiceColour(colour) ? colour : DEFAULT_DICE_LOOK.colour, font: isDiceFont(font) ? font : DEFAULT_DICE_LOOK.font };
};

/** Colour of the dice and face of their numerals, each under its own key. */
const diceLook: PreferenceRow<DiceLook, Partial<DiceLook>> = {
  store: 'synced',
  keys: ['diceColour', 'diceFont'],
  read: readDiceLook,
  write: (change, stored) => {
    const next = { ...readDiceLook(stored), ...change };
    return { diceColour: next.colour, diceFont: next.font };
  },
};

const readTurnOptions = (stored: StoredEntries): InitiativeTurnOptions => ({
  banner: stored('initiativeBanner') !== false,
  movesOnTurn: stored('initiativeMovesOnTurn') === true,
});

/** What a turn change does: the banner is on unless the file says `false`, moving only on one's turn off unless it says `true`. */
const initiativeTurnOptions: PreferenceRow<InitiativeTurnOptions, Partial<InitiativeTurnOptions>> = {
  store: 'synced',
  keys: ['initiativeBanner', 'initiativeMovesOnTurn'],
  read: readTurnOptions,
  write: (change, stored) => {
    const next = { ...readTurnOptions(stored), ...change };
    return { initiativeBanner: next.banner, initiativeMovesOnTurn: next.movesOnTurn };
  },
};

function readLayout(stored: StoredEntries): InitiativeLayout {
  const dock = readListEdge(stored('initiativeDock'));
  const edges = readListEdges(stored('initiativeEdges'), dock);
  return {
    // During a fight the lists always start at the turn
    fromTurn: true,
    // An older version may have moved the list since: the dock it wrote counts among the edges
    dock: edges.includes(dock) ? dock : edges[0] ?? dock,
    edges,
    facesPlayers: stored('initiativeFacesPlayers') === true,
  };
}

/**
 * How the initiative lists are laid out. `initiativeDock` stays the list's first edge for older
 * versions, which know no other; the edges and the turn to the players are stored once chosen.
 */
const initiativeLayout: PreferenceRow<InitiativeLayout, Partial<InitiativeLayout>> = {
  store: 'synced',
  keys: ['initiativeDock', 'initiativeEdges', 'initiativeFacesPlayers'],
  read: readLayout,
  write: (changes, stored) => {
    const current = readLayout(stored);
    const { facesPlayers = current.facesPlayers } = changes;
    // One edge chosen alone is the list's only edge; edges chosen keep the dock among them, as its first where it left them
    const edges = changes.edges ?? (changes.dock !== undefined ? [changes.dock] : current.edges);
    const dock = changes.dock ?? (edges.includes(current.dock) ? current.dock : edges[0] ?? current.dock);
    return {
      initiativeDock: dock,
      ...((edges.length > 1 || stored('initiativeEdges') !== undefined) && { initiativeEdges: [...edges] }),
      ...((facesPlayers || stored('initiativeFacesPlayers') !== undefined) && { initiativeFacesPlayers: facesPlayers }),
    };
  },
};

/** Preferences stored under several keys, or written with more than their own value. */
export const COMBINED_PREFERENCES = { hotkeys, diceLook, initiativeTurnOptions, initiativeLayout };
