import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import { visibleResources } from '../resources/visibleResources';
import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import type { InitiativeRules, InitiativeSide, SideId } from '../types/initiativeRulesTypes';
import { firstBuiltInSide } from '../gameSystems/initiativeSideRules';
import { listedByCards, listedBySides, listedSides, sideOf, type ListedSide } from '../initiative/sides';
import { combatantDefeated } from '../initiative/defeated';
import { firstCards, listSegments, type ListSegment } from '../initiative/listSegments';
import { combatantConditions, type ActiveCondition } from '../utils/activeConditions';
import { entryConditions } from '../initiative/combatantConditions';
import { entryToken } from '../initiative/party';
import { isOffMap } from '../tokens/offMap';

/** What the players' list reads from a combatant's token. */
export interface EntryToken {
  hp: ResourceValue | null;
  /** The map frames a token unless its ring is switched off. */
  showRing: boolean;
  ringColor?: string | undefined;
  /** The side the token fights on, of the sides the list knows (`sideIdsOf`). */
  side: SideId;
  /** Defeated, as the GM's card shows it with its skull: shown dimmed and marked, never left out. */
  defeated: boolean;
  /** The condition badges the map shows players on the token (`combatantConditions`), or the entry's own. */
  conditions?: ActiveCondition[];
  /** The token's own Show nameplate, which names it where the map shows no nameplates (`nameplateShownToPlayers`). */
  showNameplate?: boolean;
  /** Kept beside the map (`isOffMap`): no token on the map shows its conditions, so its card does. */
  offMap?: true;
}

/** What the players' list shows of an initiative entry. */
export type PlayerInitiativeEntry = Pick<InitiativeEntry, 'hiddenFromPlayers' | 'tokenId' | 'name' | 'initiative' | 'awaitingInitiative' | 'isActive' | 'imagePath' | 'order' | 'sitsOut' | 'delayed' | 'card'> & Partial<Pick<InitiativeEntry, 'isNPC'>>;

/** A combatant the players see, with what the list shows of its token. */
export interface Combatant {
  entry: PlayerInitiativeEntry;
  token: EntryToken;
}

/** The players' initiative list as it is drawn: the combatants they see in turn order, and how the fight runs. */
export interface PlayerInitiativeList {
  combatants: Combatant[];
  /** A fight is running: the turn and the round are shown. */
  isActive: boolean;
  round: number;
  /** The combatants are grouped by side (`listedBySides`). */
  bySides: boolean;
  /** A combatant's number is the card it was dealt (`listedByCards`): the lowest acts first. */
  byCards: boolean;
  /** The sides in the order they act this round, with their rolls and the side or sides with the turn. */
  sides: ListedSide[];
  /** Of the players and the opponents, the side that acts first in a round; what older pages read. */
  firstSide: InitiativeSide;
  /** The side whose turn it is in a fight by sides (one of them where several act at once). */
  activeSide: SideId | null;
  /**
   * In a fight in turn order, the place in the order of the combatant whose turn it is, also one
   * the players do not see: a list that starts at the turn starts with the first they see from
   * there. Null without a fight or a turn.
   */
  turnOrder: number | null;
}

/**
 * Whether players see a combatant: its token is on the map and not hidden. Sight and light never
 * decide: the list would change as tokens move, and the GM could not tell what it shows.
 */
export function listedForPlayers(token: Pick<TokenEntity, 'isHidden'> | undefined): boolean {
  return !!token && !token.isHidden;
}

/**
 * What the players' list shows of `entry`, or null where they do not see it: none the GM hid from
 * them (`hiddenFromPlayers`); else a player at the table always, on the players' side; an enemy added by name
 * always, on the opponents'; a token's entry while its token is listed (`listedForPlayers`). The other arguments are `entryTokenOf`'s.
 */
export function playersEntryToken(
  entry: Pick<InitiativeEntry, 'tokenId' | 'partyMemberId' | 'conditions' | 'conditionValues' | 'hiddenFromPlayers'>,
  tokens: Readonly<Record<string, TokenEntity>> | undefined,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[] = [],
  sides?: readonly SideId[],
): EntryToken | null {
  // Conditions the tracker gave: a token's own, else the entry's
  const conditions = (token: TokenEntity | undefined): ActiveCondition[] => entryConditions(entry, token, conditionDefinitions);
  // Whomever the GM hid from the players
  if (entry.hiddenFromPlayers) return null;
  if (entry.partyMemberId !== undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), side: 'players', conditions: conditions(undefined) };
  if (entry.tokenId === undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), conditions: conditions(undefined) };
  const token = entryToken(tokens, entry);
  return listedForPlayers(token) ? { ...entryTokenOf(token, definitions, conditionDefinitions, sides), conditions: conditions(token) } : null;
}

/** The ids of the sides the players' list groups by: the running fight's, else the rules'. */
export function sideIdsOf(initiative: Pick<InitiativeState, 'isActive' | 'round' | 'sides' | 'sideOrder'>, rules: InitiativeRules): SideId[] {
  return listedSides(initiative, rules).map((side) => side.id);
}

/**
 * What the players' list reads of a combatant's token; `definitions` are the map's resources, which
 * say who is defeated and whether players see its hit points, as on the map, `conditionDefinitions` its conditions, drawn as the map draws them, and
 * `sides` the ids of the sides the list knows (`sideIdsOf`).
 */
export function entryTokenOf(
  token: TokenEntity | undefined,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[] = [],
  sides?: readonly SideId[],
): EntryToken {
  return {
    hp: (token && visibleResources(token, definitions, 'player').find(({ definition }) => definition.key === 'hp')?.value) ?? null,
    showRing: token?.showRing !== false,
    ringColor: token?.ringColor,
    side: sideOf(token, sides),
    defeated: combatantDefeated(token, definitions),
    conditions: combatantConditions(token, conditionDefinitions),
    ...(token?.showNameplate === true ? { showNameplate: true } : {}),
    ...(isOffMap(token) ? { offMap: true as const } : {}),
  };
}

/**
 * The list players see of a fight: every entry `tokenOf` answers for (those whose token they may
 * see), in turn order, grouped by side as the fight runs or the collection's rules say.
 */
export function playerInitiativeList(
  initiative: Pick<InitiativeState, 'isActive' | 'round' | 'sides' | 'sideOrder' | 'cards'> & { entries: readonly PlayerInitiativeEntry[] },
  tokenOf: (entry: PlayerInitiativeEntry, index: number) => EntryToken | null,
  rules: InitiativeRules,
): PlayerInitiativeList {
  const combatants = initiative.entries
    .flatMap((entry, index): Combatant[] => {
      const token = tokenOf(entry, index);
      return token ? [{ entry, token }] : [];
    })
    .sort((a, b) => a.entry.order - b.entry.order);
  const bySides = listedBySides(initiative, rules);
  const sides = listedSides(initiative, rules);
  const turn = initiative.isActive && !bySides ? initiative.entries.find((entry) => entry.isActive && !entry.delayed) : undefined;
  return {
    combatants,
    isActive: initiative.isActive,
    round: initiative.round,
    bySides,
    byCards: listedByCards(initiative, rules),
    sides,
    firstSide: initiative.sides?.first ?? firstBuiltInSide(sides),
    activeSide: initiative.sides?.active ?? null,
    turnOrder: turn ? turn.order : null,
  };
}

/** The players' list as it is drawn (`listSegments`): a side nobody is shown of is left out; past `maxCards` only the next ones. */
export function playerSegments(list: PlayerInitiativeList, fromTurn: boolean, maxCards = 0): ListSegment<Combatant>[] {
  const order = list.combatants.filter(({ entry }) => !entry.delayed);
  const { turnOrder } = list;
  const segments = listSegments(list.combatants, {
    bySides: list.bySides,
    sides: list.sides,
    sideOf: ({ token }) => token.side,
    delayed: ({ entry }) => entry.delayed === true,
    fightRuns: list.isActive,
    round: list.round,
    turnAt: turnOrder === null ? -1 : order.findIndex(({ entry }) => entry.order >= turnOrder),
    fromTurn,
    emptySides: false,
  });
  return maxCards > 0 ? firstCards(segments, maxCards) : segments;
}
