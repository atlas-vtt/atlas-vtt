import { startCombatByRules } from '../initiative/combatStart';
import { listedByCards, listedBySides } from '../initiative/sides';
import type { ViewAtlasState } from '../storeFactory';
import type { DicePreset } from '../types/dicePresetTypes';
import type { InitiativeRules } from '../types/initiativeRulesTypes';
import type { RemoteCombat, RemoteCommand, RemotePlayer } from './remoteProtocol';

const TABLE_COMMAND_TYPES = ['combat', 'rollInitiative', 'present', 'freeze', 'curtain', 'takeBackHandout', 'showHoveredImage', 'roll', 'shareRolls'] as const;
const TABLE_COMMANDS: ReadonlySet<string> = new Set(TABLE_COMMAND_TYPES);

/** The commands that act on the table (the fight and the player window), not on sound. */
export type TableCommand = Extract<RemoteCommand, { type: (typeof TABLE_COMMAND_TYPES)[number] }>;

export function isTableCommand(command: RemoteCommand): command is TableCommand {
  return TABLE_COMMANDS.has(command.type);
}

/** Why a table command did nothing. */
export type TableRefusal = 'no-scene' | 'no-combatants' | 'no-rolls' | 'cards-short' | 'no-player-window' | 'true-scale' | 'no-handout' | 'no-image' | 'no-roll';

/** The map the GM has in front (`remoteMapView`), and the tracker's and the scene tab's own actions on it. */
export interface TableMap {
  state(): Pick<ViewAtlasState, 'mapPath' | 'mapLoaded' | 'isMapLoading' | 'initiative' | 'objects' | 'startCombat' | 'endCombat'>;
  /** The initiative rules the map plays by (`mapInitiativeRules`). */
  rules(): InitiativeRules;
  /** Its defeated combatants (`defeatedOnMap`). */
  defeated(): ReadonlySet<string>;
  /** The tracker's Roll button (`rollInitiative`). */
  roll(): void;
  /** Its scene tab is the presented scene. */
  presented(): boolean;
  /** The eye on its scene tab, opening the player window (`presentTab`). */
  present(): void;
  /** The saved rolls of its collection (`collectionDiceShelf`). */
  savedRolls(): readonly DicePreset[];
  /** Rolls one through the view's dice tool, as the tray does (`rollSavedRoll`). */
  rollSaved(preset: DicePreset): void;
}

/** The player window as its bar reads and presses it. */
export interface TablePlayerWindow {
  isOpen(): boolean;
  isFrozen(): boolean;
  isTrueScale(): boolean;
  isCurtained(): boolean;
  handoutShown(): boolean;
  toggleFreeze(): void;
  setCurtain(down: boolean): void;
  takeBackHandout(): void;
  /** Shows players the image under the pointer, as its menu's "Display on player view" does; false where there is none to show. */
  showHoveredImage(): boolean;
}

/** "Show my rolls to players" (`useShareRolls`). */
export interface TableShareRolls {
  shown(): boolean;
  setShown(shown: boolean): void;
}

export interface TableSource {
  /** The map the GM has in front, or null without one. */
  map(): TableMap | null;
  player: TablePlayerWindow;
  shareRolls: TableShareRolls;
}

/** A map with a scene loaded in it; one loading or empty is none to act on. */
function loadedMap(source: TableSource): TableMap | null {
  const map = source.map();
  const state = map?.state();
  return map && state && state.mapPath && state.mapLoaded && !state.isMapLoading ? map : null;
}

/** The tracker's Roll button shows only where its rules roll: turn order (a fight keeps the mode it began in). */
function rolls(map: TableMap): boolean {
  const { initiative } = map.state();
  const rules = map.rules();
  return !listedBySides(initiative, rules) && !listedByCards(initiative, rules);
}

export function remoteCombat(source: TableSource): RemoteCombat | null {
  const map = loadedMap(source);
  if (!map) return null;
  const { initiative } = map.state();
  return { active: initiative.isActive, round: initiative.round, combatants: initiative.entries.length, rolls: rolls(map) };
}

export function remotePlayer(source: TableSource): RemotePlayer {
  const { player } = source;
  const open = player.isOpen();
  const trueScale = open && player.isTrueScale();
  return {
    open,
    presented: loadedMap(source)?.presented() ?? false,
    frozen: open && player.isFrozen() && !trueScale,
    trueScale,
    hidden: open && player.isCurtained(),
    handout: player.handoutShown(),
  };
}

function runCombat(map: TableMap): TableRefusal | null {
  const state = map.state();
  if (state.initiative.isActive) {
    state.endCombat();
    return null;
  }
  if (state.initiative.entries.length === 0) return 'no-combatants';
  return startCombatByRules(state, map.rules(), () => map.defeated()) ? null : 'cards-short';
}

function runInitiativeRoll(map: TableMap): TableRefusal | null {
  if (map.state().initiative.entries.length === 0) return 'no-combatants';
  if (!rolls(map)) return 'no-rolls';
  map.roll();
  return null;
}

/** The saved rolls of the loaded map's collection; none without one. */
export function savedRollsOnMap(source: TableSource): readonly DicePreset[] {
  return loadedMap(source)?.savedRolls() ?? [];
}

function runRoll(map: TableMap, id: string): TableRefusal | null {
  const preset = map.savedRolls().find((candidate) => candidate.id === id);
  if (!preset) return 'no-roll';
  map.rollSaved(preset);
  return null;
}

function runPresent(map: TableMap): null {
  map.present();
  return null;
}

/** Acts on the loaded map, or refuses without one. */
function onMap(source: TableSource, act: (map: TableMap) => TableRefusal | null): TableRefusal | null {
  const map = loadedMap(source);
  return map ? act(map) : 'no-scene';
}

/** Runs a table command through the same functions the tracker, the scene tabs and the player window's bar call. Null where it was done. */
export function runTableCommand(source: TableSource, command: TableCommand): TableRefusal | null {
  const { player } = source;
  switch (command.type) {
    case 'combat':
      return onMap(source, runCombat);
    case 'rollInitiative':
      return onMap(source, runInitiativeRoll);
    case 'present':
      return onMap(source, runPresent);
    case 'freeze':
      if (!player.isOpen()) return 'no-player-window';
      if (player.isTrueScale()) return 'true-scale';
      player.toggleFreeze();
      return null;
    case 'curtain':
      if (!player.isOpen()) return 'no-player-window';
      player.setCurtain(!player.isCurtained());
      return null;
    case 'takeBackHandout':
      if (!player.handoutShown()) return 'no-handout';
      player.takeBackHandout();
      return null;
    case 'showHoveredImage':
      return player.showHoveredImage() ? null : 'no-image';
    case 'roll':
      return onMap(source, (map) => runRoll(map, command.id));
    case 'shareRolls':
      source.shareRolls.setShown(!source.shareRolls.shown());
      return null;
  }
}
