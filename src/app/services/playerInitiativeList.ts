import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import { visibleResources } from '../resources/visibleResources';
import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import type { InitiativeSide, SideId } from '../types/initiativeRulesTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { initiativeRulesForMap } from '../gameSystems/initiativeRules';
import { mapConditions, type RulesLookup } from '../gameSystems/mapRules';
import { mapResources } from '../resources/collectionResources';
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
  /** The side the token fights on, of the sides the list knows (`listedSides`). */
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

/** An entry as the list reads it: what it shows, and what says whether players see it, on which side and under which conditions. */
type ListedEntry = PlayerInitiativeEntry & Pick<InitiativeEntry, 'partyMemberId' | 'conditions' | 'conditionValues'>;

/** The fight the list is made of. */
type ListedFight = Pick<InitiativeState, 'isActive' | 'round' | 'sides' | 'sideOrder' | 'cards'> & { readonly entries: readonly ListedEntry[] };

/** What the players' list is made of: the scene's fight, the GM's tracker, its tokens and the map whose rules apply. */
export interface PlayersInitiativeScene {
  readonly initiative?: ListedFight | undefined;
  readonly initiativeTrackerOpen?: boolean | undefined;
  readonly mapPath: string | null;
  readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> };
}

/** Where the list looks up the rules of the scene's map. */
export interface ListRules {
  /** The map's collection and the campaign played (`RulesLookup`); null where neither can be read: the default initiative rules, no resources and no conditions. */
  readonly lookup: RulesLookup | null;
  /** The game system presets those rules may name, the user's among them (`systemPresetsOf`). */
  readonly presets: readonly SystemPreset[];
}

/** When players are given the list. */
export interface ListedWhen {
  /** The player view's initiative switch (`showInitiative`): off, they are given none. */
  readonly showInitiative: boolean;
  /**
   * Given as soon as the GM's tracker is open, while a fight is prepared too, not only while one runs. Atlas's player
   * window shows the list during a fight alone; online players are sent it before one starts, and their page decides.
   */
  readonly beforeFight: boolean;
}

/**
 * Whether players are given the list now: the player view shows initiative, the GM's tracker is open, and a fight
 * runs, or is prepared where `when` gives the list before it.
 */
export function initiativeShown(
  scene: { readonly initiative?: Pick<InitiativeState, 'isActive'> | undefined; readonly initiativeTrackerOpen?: boolean | undefined },
  when: ListedWhen,
): boolean {
  if (!when.showInitiative || scene.initiativeTrackerOpen !== true || scene.initiative === undefined) return false;
  return scene.initiative.isActive || when.beforeFight;
}

/** The list players are given of the scene's fight (`playerInitiativeList`), or null while they are given none (`initiativeShown`). */
export function initiativeForPlayers(scene: PlayersInitiativeScene, rules: ListRules, when: ListedWhen): PlayerInitiativeList | null {
  const { initiative } = scene;
  if (initiative === undefined || !initiativeShown(scene, when)) return null;
  return playerInitiativeList({ initiative, mapPath: scene.mapPath, objects: scene.objects }, rules);
}

/**
 * The list players see of the scene's fight: every combatant they see (`playersEntryToken`), in turn order, grouped by
 * side as the fight runs or the map's rules say, defeated, hurt and under conditions as those rules have it. A view
 * that keeps the list between drawings reads it here and asks `initiativeShown` when to draw it.
 */
export function playerInitiativeList(scene: PlayersInitiativeScene & { readonly initiative: ListedFight }, rules: ListRules): PlayerInitiativeList {
  const { initiative, mapPath } = scene;
  const { lookup } = rules;
  // Who is defeated, and whose hit points players see, follow the map's resources, as on the map
  const definitions = lookup === null ? [] : mapResources(lookup, mapPath);
  const conditions = lookup === null ? [] : mapConditions(lookup, mapPath);
  const initiativeRules = initiativeRulesForMap(lookup, rules.presets, mapPath);
  const sides = listedSides(initiative, initiativeRules);
  // A token's side counts where the fight or the rules know it
  const known = sides.map(({ id }) => id);
  const combatants = initiative.entries
    .flatMap((entry): Combatant[] => {
      const token = playersEntryToken(entry, scene.objects.tokens, definitions, conditions, known);
      return token ? [{ entry, token }] : [];
    })
    .sort((a, b) => a.entry.order - b.entry.order);
  const bySides = listedBySides(initiative, initiativeRules);
  const turn = initiative.isActive && !bySides ? initiative.entries.find((entry) => entry.isActive && !entry.delayed) : undefined;
  return {
    combatants,
    isActive: initiative.isActive,
    round: initiative.round,
    bySides,
    byCards: listedByCards(initiative, initiativeRules),
    sides,
    firstSide: initiative.sides?.first ?? firstBuiltInSide(sides),
    activeSide: initiative.sides?.active ?? null,
    turnOrder: turn ? turn.order : null,
  };
}

/**
 * What the list shows of `entry`, or null where players do not see it: none the GM hid from them (`hiddenFromPlayers`);
 * else a player at the table always, on the players' side; an enemy added by name always, on the opponents'; a
 * token's entry while its token is on the map and not hidden. Sight and light never decide: the list would change as
 * tokens move, and the GM could not tell what it shows. The other arguments are `entryTokenOf`'s.
 */
function playersEntryToken(
  entry: ListedEntry,
  tokens: Readonly<Record<string, TokenEntity>>,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[],
  sides: readonly SideId[],
): EntryToken | null {
  // Conditions the tracker gave: a token's own, else the entry's
  const conditions = (token: TokenEntity | undefined): ActiveCondition[] => entryConditions(entry, token, conditionDefinitions);
  // Whomever the GM hid from the players
  if (entry.hiddenFromPlayers) return null;
  if (entry.partyMemberId !== undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), side: 'players', conditions: conditions(undefined) };
  if (entry.tokenId === undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), conditions: conditions(undefined) };
  const token = entryToken(tokens, entry);
  return token && !token.isHidden ? { ...entryTokenOf(token, definitions, conditionDefinitions, sides), conditions: conditions(token) } : null;
}

/**
 * What the list reads of a combatant's token; `definitions` are the map's resources, which say who is defeated and
 * whether players see its hit points, as on the map, `conditionDefinitions` its conditions, drawn as the map draws
 * them, and `sides` the ids of the sides the list knows.
 */
function entryTokenOf(
  token: TokenEntity | undefined,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[],
  sides: readonly SideId[],
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
