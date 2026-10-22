import { MAX_COMBATANTS, MAX_INSTANCE_NUMBER, MAX_NAME, type AssetRef, type SharedCombatant, type SharedInitiative, type SharedSide, type SharedSideTurn } from '../protocol/index.ts';
import { isBuiltInSide } from '../../gameSystems/initiativeSideRules';
import { BUILT_IN_SYSTEM_PRESETS } from '../../gameSystems/builtInPresets';
import { collectionInitiativeRules, DEFAULT_INITIATIVE_RULES } from '../../gameSystems/initiativeRules';
import { mapConditions, rulesForMap, type RulesLookup } from '../../gameSystems/mapRules';
import { mapResources } from '../../resources/collectionResources';
import { entryTokenOf, listedForPlayers, playerInitiativeList, playerSegments, sideIdsOf, type PlayerInitiativeList } from '../../services/playerInitiativeList';
import { sharedConditions } from './tokenUI.ts';
import type { TokenEntity } from '../../types';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { ViewState } from '../../types/viewState';
import { ringColour } from './scenePicture.ts';
import { hasInitiative } from '../../initiative/awaitingInitiative';

/** What the players' initiative list is made of. */
export interface InitiativeInputs {
  readonly state: Partial<Pick<ViewState, 'initiative' | 'initiativeTrackerOpen'>> & { readonly mapPath: string | null; readonly objects: { readonly tokens: Readonly<Record<string, TokenEntity>> } };
  /** The player view's initiative switch (`showInitiative`). */
  readonly shown: boolean;
  /** The player view's nameplate switch: without it no name is sent. */
  readonly showNames: boolean;
  /** The GM's choice that the lists start at the turn during a fight; off unless said. */
  readonly fromTurn?: boolean;
  /** The GM switched the turn banner off; on unless said. */
  readonly bannerOff?: boolean;
  /** Players move tokens that fight only on their turn; off unless said. */
  readonly movesOnTurn?: boolean;
  /** The edge the GM docked the lists at; the right one unless said. */
  readonly dock?: 'left' | 'right';
  /** The number a combatant's look-alike badge shows the players, or null without one; none are sent without it. */
  badge?(tokenId: string): number | null;
  /** The id players know a token by while it is in their token list (`TokenShare.listedAlias`); none for any other. */
  tokenAlias?(tokenId: string): string | undefined;
  /** Where the map's rules are looked up; without it the default rules and no hit points. */
  readonly rules: RulesLookup | null;
  /** A portrait's artwork as players are sent it, by vault path; null while unknown. */
  art(path: string): AssetRef | null;
}

/** A number players are sent: finite and within the protocol's bound. */
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e9;

/** A look-alike number as players are sent it: a whole number within the protocol's bound, else none. */
function instanceOf(badge: number | null): { instance?: number } {
  return badge !== null && Number.isInteger(badge) && badge >= 1 && badge <= MAX_INSTANCE_NUMBER ? { instance: badge } : {};
}

/** The token a card brings into view, where the players know it. */
function aliasOf(alias: string | undefined): { token?: string } {
  return alias === undefined ? {} : { token: alias };
}

/** The side older pages group a combatant under: the players', or the opponents' for every other side. */
const legacySide = (side: string): SharedSide => (side === 'players' ? 'players' : 'opponents');

/** The sides as the players' list heads its groups, in the order they act this round. */
function sharedSides(list: PlayerInitiativeList): SharedSideTurn[] {
  return list.sides.map((side) => ({
    id: side.id,
    name: side.name.slice(0, MAX_NAME),
    roll: finite(side.roll) ? side.roll : null,
    turn: list.isActive && side.active,
  }));
}

/** The side with the turn as older pages read it: one of the built-in two, else none. */
function legacyActiveSide(list: PlayerInitiativeList): SharedSide | null {
  if (!list.bySides || !list.isActive) return null;
  const active = list.sides.find((side) => side.active && isBuiltInSide(side.id));
  return active ? legacySide(active.id) : null;
}

/**
 * The initiative rules the map plays by (`rulesForMap`): their own, else their built-in preset's,
 * else the default. A user preset's rules are not readable from here; such rules read as the default.
 */
function initiativeRulesOf(rules: RulesLookup | null, mapPath: string | null): InitiativeRules {
  const settings = rules !== null && mapPath !== null ? rulesForMap(rules, mapPath).settings : null;
  return settings === null ? { ...DEFAULT_INITIATIVE_RULES } : collectionInitiativeRules(settings, BUILT_IN_SYSTEM_PRESETS);
}

/**
 * The players' initiative list as Atlas's player window shows it (`PlayerInitiativePanel`): only
 * while the GM's tracker is open and the player view shows it; every entry whose token is on the
 * map and not hidden, in turn order or by sides; names only with nameplates, hit points only where
 * the map's rules show them to players. Nothing of a hidden token's entry is read.
 */
export function sharedInitiative(inputs: InitiativeInputs): SharedInitiative | null {
  const { state, rules } = inputs;
  const initiative = state.initiative;
  if (!inputs.shown || state.initiativeTrackerOpen !== true || initiative === undefined) return null;
  const tokens = state.objects.tokens;
  const definitions = rules !== null ? mapResources(rules, state.mapPath) : [];
  const conditions = rules !== null ? mapConditions(rules, state.mapPath) : [];
  const hpVisible = definitions.some((definition) => definition.key === 'hp' && definition.visibleToPlayers);
  const initiativeRules = initiativeRulesOf(rules, state.mapPath);
  const sides = sideIdsOf(initiative, initiativeRules);
  const list = playerInitiativeList(
    initiative,
    (entry) => (listedForPlayers(tokens[entry.tokenId]) ? entryTokenOf(tokens[entry.tokenId], definitions, conditions, sides) : null),
    initiativeRules,
    hpVisible,
  );
  const shownNumber = (entry: (typeof list.combatants)[number]['entry']): number => {
    // A dealt card stands where the number does, so older pages show it too
    const value = list.byCards ? entry.card ?? 0 : entry.initiative;
    return finite(value) ? value : 0;
  };
  // Who acts in the next round, where the list starts at the turn
  const fromTurn = inputs.fromTurn === true;
  const nextRound = new Set(playerSegments(list, fromTurn).flatMap((segment) => (segment.kind === 'group' && segment.key === 'next' ? segment.items : [])));
  const combatants = list.combatants.slice(0, MAX_COMBATANTS).map((combatant): SharedCombatant => {
    const { entry, token } = combatant;
    return {
      initiative: shownNumber(entry),
      name: inputs.showNames && typeof entry.name === 'string' ? entry.name.slice(0, MAX_NAME) : null,
      turn: list.isActive && !list.bySides && entry.isActive === true,
      sitsOut: entry.sitsOut === true,
      ...(entry.delayed === true ? { delayed: true } : {}),
      ...(token.defeated ? { defeated: true } : {}),
      // In a fight by cards a combatant is numbered once it holds a card
      ...((list.byCards ? entry.card !== undefined : hasInitiative(entry)) ? {} : { unnumbered: true }),
      art: typeof entry.imagePath === 'string' && entry.imagePath !== '' ? inputs.art(entry.imagePath) : null,
      ring: token.showRing ? { colour: token.ringColor ? ringColour(token.ringColor) : null } : null,
      side: legacySide(token.side),
      ...(isBuiltInSide(token.side) ? {} : { sideId: token.side }),
      hp: token.hp !== null && finite(token.hp.current) && finite(token.hp.max) ? { current: token.hp.current, max: token.hp.max } : null,
      ...(nextRound.has(combatant) ? { nextRound: true } : {}),
      ...(token.conditions?.length ? { conditions: sharedConditions(token.conditions) } : {}),
      ...instanceOf(inputs.badge?.(entry.tokenId) ?? null),
      ...aliasOf(inputs.tokenAlias?.(entry.tokenId)),
    };
  });
  return {
    isActive: list.isActive,
    round: finite(list.round) ? list.round : 0,
    bySides: list.bySides,
    firstSide: list.firstSide,
    activeSide: legacyActiveSide(list),
    ...(list.bySides ? { sides: sharedSides(list) } : {}),
    ...(list.byCards ? { byCards: true as const } : {}),
    combatants,
    ...(fromTurn ? { fromTurn: true } : {}),
    ...(inputs.bannerOff === true ? { bannerOff: true } : {}),
    ...(inputs.movesOnTurn === true ? { movesOnTurn: true } : {}),
    ...(inputs.dock === 'left' ? { dock: 'left' as const } : {}),
  };
}
