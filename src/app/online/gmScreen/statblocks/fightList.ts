import { instanceBadgeNumbers } from '../../../initiative/cardInstanceNumber';
import { combatantDefeated } from '../../../initiative/defeated';
import type { ListSegment } from '../../../initiative/listSegments';
import { entrySide, entryToken } from '../../../initiative/party';
import { listedSides } from '../../../initiative/sides';
import { trackerSegments } from '../../../initiative/trackerSegments';
import { turnColor } from '../../../initiative/turnColor';
import { woundShare } from '../../../initiative/woundShare';
import { currentTurn, holdsTurn, turnEntries } from '../../../initiative/turnHolders';
import { tokenDisplayName } from '../../../pixi/token-renderer/tokenDisplayName';
import type { ResourceDefinition } from '../../../resources/resourceTypes';
import { visibleResources } from '../../../resources/visibleResources';
import { isOffMap } from '../../../tokens/offMap';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { InitiativeEntry } from '../../../types/initiativeTypes';
import { hexColour, ringColour } from '../../gm/scenePicture.ts';
import { MAX_COMBATANTS, MAX_NAME, MAX_SIDE_ID, MAX_SIDES, type FightCombatant, type FightPart, type FightSide, type StatblocksFight } from '../../protocol/index.ts';
import type { FrontSceneState } from './frontScene.ts';

/** The largest round or side's roll a device is sent, as the protocol takes them. */
const MAX_NUMBER = 1e9;

/** A round as a device takes one: a whole number from 0, whatever the scene holds. */
const wholeRound = (round: number): number => (Number.isFinite(round) ? Math.min(Math.max(Math.trunc(round), 0), MAX_NUMBER) : 0);

/** A side's head within what a device takes, as the players' table cuts side names; none where it has no id to name it by. */
function sideOf(side: { readonly id: string; readonly name: string; readonly roll?: number | null }, turn: boolean): FightSide | undefined {
  const id = side.id.slice(0, MAX_SIDE_ID);
  const { roll } = side;
  return id === '' ? undefined : { id, name: side.name.trim().slice(0, MAX_NAME), roll: typeof roll === 'number' && Number.isFinite(roll) && Math.abs(roll) <= MAX_NUMBER ? roll : null, turn };
}

/** What a fight's rows are made of beside the scene: the map's rules and resources, and the ids and hashes the device knows. */
export interface FightInputs {
  readonly rules: InitiativeRules;
  readonly definitions: readonly ResourceDefinition[];
  /** Atlas's key for an entry while its fight runs. */
  keyOf(entryId: string): string;
  /** The id of the list's statblock for a note; null where the list has none. */
  statblockOf(path: string): string | null;
  /** The hash of a token's art; null for none. */
  portraitOf(imagePath: string): string | null;
}

/** The art of a fight's combatants, which `portraitOf` must know before the fight is read. */
export function fightArt(state: FrontSceneState): string[] {
  return state.initiative.isActive ? [...new Set(state.initiative.entries.flatMap((entry) => (entry.imagePath ? [entry.imagePath] : [])))] : [];
}

/**
 * The running fight as the GM's tracker shows it (`trackerSegments`, from the turn on, as every list starts during a fight:
 * `SettingsService.initiativeLayout`), each combatant
 * with what its card shows (`InitiativeCard`): its token's name, art and ring, its look-alike number as the map's badge
 * shows it, the turn, its side, and whether it is hidden from the players, defeated, sits out, delayed or kept beside
 * the map. Null outside a fight. Nothing in it follows where a token stands, so a token moved changes none of it.
 */
export function fightOf(state: FrontSceneState, inputs: FightInputs): StatblocksFight | null {
  const { initiative, objects: { tokens } } = state;
  if (!initiative.isActive) return null;
  const sides = listedSides(initiative, inputs.rules);
  const bySides = initiative.sides !== undefined;
  const turn = currentTurn(initiative);
  const entries = [...initiative.entries].sort((a, b) => a.order - b.order);
  const segments = trackerSegments(entries, tokens, {
    bySides, sides, fightRuns: true, holder: turn?.kind === 'combatant' ? turn.entry.id : undefined, round: initiative.round, fromTurn: true,
  });
  const badges = instanceBadgeNumbers(tokens, state.tokenSettings?.showInstanceBadges ?? true, state.levels);
  const defeated = new Set(entries.filter((entry) => combatantDefeated(entryToken(tokens, entry), inputs.definitions)).map((entry) => entry.id));
  const holders = new Set(turnEntries(turn, initiative, tokens, defeated).map((entry) => entry.id));
  const known = sides.map((side) => side.id);
  // A device drops a fight whose rows share a key: an entry whose id another entry of the tracker has already gets a key of its own.
  const seen = new Map<string, number>();
  const keyOf = (id: string): string => {
    const before = seen.get(id) ?? 0;
    seen.set(id, before + 1);
    return inputs.keyOf(before === 0 ? id : `${id}\u0000${before}`);
  };

  /** How much of its life the token has lost, as its tracker card's red shows it (`woundShare`), to a thousandth; null where nothing tells. */
  const woundOf = (token: ReturnType<typeof entryToken>): number | null => {
    const share = token ? woundShare(visibleResources(token, inputs.definitions, 'dm').filter(({ definition }) => definition.defeatedWhenSpent)) : null;
    return share === null ? null : Math.round(share * 1000) / 1000;
  };

  const combatant = (entry: InitiativeEntry): FightCombatant => {
    const token = entryToken(tokens, entry);
    const wound = woundOf(token);
    const badge = entry.tokenId === undefined ? undefined : badges.get(entry.tokenId);
    const path = token?.kind === 'character' ? token.statblockPath : undefined;
    const flags: Partial<Record<'turn' | 'ally' | 'hidden' | 'defeated' | 'sitsOut' | 'delayed' | 'offMap', boolean>> = {
      turn: bySides ? holders.has(entry.id) : holdsTurn(entry),
      ally: entrySide(entry, tokens, known) === 'players',
      hidden: token?.isHidden === true || entry.hiddenFromPlayers === true,
      defeated: defeated.has(entry.id),
      sitsOut: entry.sitsOut === true,
      delayed: entry.delayed === true,
      offMap: isOffMap(token),
    };
    return {
      key: keyOf(entry.id),
      name: ((token && tokenDisplayName(token)) || entry.name).trim().slice(0, MAX_NAME),
      statblock: path ? inputs.statblockOf(path) : null,
      portrait: entry.imagePath ? inputs.portraitOf(entry.imagePath) : null,
      ring: token?.showRing === false ? null : ringColour(token?.ringColor),
      turnColour: hexColour(turnColor(token) ?? undefined),
      ...(badge !== undefined && { badge }),
      ...(wound !== null && { wound }),
      ...Object.fromEntries(Object.entries(flags).flatMap(([flag, on]) => (on ? [[flag, true]] : []))),
    };
  };

  const part = (segment: ListSegment<InitiativeEntry>): FightPart => {
    if (segment.kind === 'round') return { k: 'round', round: wholeRound(segment.round) };
    const side = segment.side && sideOf(segment.side, segment.active === true);
    return {
      k: 'group', key: segment.key.slice(0, MAX_SIDE_ID) || 'order',
      ...(side && { side }),
      ...(segment.delayed && { delayed: true as const }),
      combatants: segment.items.map(combatant),
    };
  };
  return { round: wholeRound(initiative.round), parts: bounded(segments.map(part)) };
}

/** The parts within what one message may carry (`MAX_COMBATANTS` combatants, `MAX_SIDES` sides): the rest is left out. */
function bounded(parts: readonly FightPart[]): FightPart[] {
  let room = MAX_COMBATANTS;
  return parts.slice(0, 2 * MAX_SIDES + 4).map((part) => {
    if (part.k === 'round') return part;
    const combatants = part.combatants.slice(0, Math.max(room, 0));
    room -= combatants.length;
    return { ...part, combatants };
  });
}
