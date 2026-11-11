import type { ResourceDefinition, ResourceValue } from '../resources/resourceTypes';
import type { TokenEntity } from '../types';
import type { ConditionDefinition } from '../types/collectionSettingsTypes';
import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';
import type { InitiativeRules, InitiativeSide, SideId } from '../types/initiativeRulesTypes';
import { firstBuiltInSide } from '../gameSystems/initiativeSideRules';
import { listedByCards, listedBySides, listedSides, sideOf, type ListedSide } from '../initiative/sides';
import { combatantDefeated } from '../initiative/defeated';
import { firstCards, listSegments, type ListSegment } from '../initiative/listSegments';
import type { PlayersListEdge } from '../initiative/initiativeLayout';
import { combatantConditions } from '../utils/activeConditions';
import { entryConditions, type CombatantCondition } from '../initiative/combatantConditions';
import { entryToken } from '../initiative/party';
import { layoutEdges, scrollWithin } from '../utils/scrollWithin';
import { renderPlayerCard } from './playerInitiativeCard';
import { renderRoundRow, renderTurnPush, type TurnPush } from './playerInitiativePush';
import './player-initiative.scss';
import { t } from '../i18n';

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
  /** The condition badges the map shows players on the token (`combatantConditions`), or the entry's own, with their turns. */
  conditions?: CombatantCondition[];
  /** The token's own Show nameplate, which names it where the map shows no nameplates (`nameplateShownToPlayers`). */
  showNameplate?: boolean;
}

/** What the players' list shows of an initiative entry. */
export type PlayerInitiativeEntry = Pick<InitiativeEntry, 'hiddenFromPlayers' | 'tokenId' | 'name' | 'initiative' | 'awaitingInitiative' | 'isActive' | 'imagePath' | 'order' | 'sitsOut' | 'delayed' | 'card' | 'color'>;

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

/** How the list draws names and portraits, and how the GM laid the lists out. */
export interface PlayerInitiativeLook {
  showNames: boolean;
  /** The scene's Show nameplates: with `showNames`, a combatant is named where the GM's map shows its nameplate. */
  mapShowsNameplates: boolean;
  /** The address of an entry's portrait, or null to draw none. */
  portraitSrc(imagePath: string): string | null;
  /** The number a combatant's badge shows the players on the map, which tells look-alikes apart; null for none. */
  badgeNumber?(tokenId: string): number | null;
  /** The GM's choice: during a fight the list starts at the turn and runs on into the next round. */
  fromTurn?: boolean;
  /** The edge the GM docked the list at; the right one unless said. Across the top or bottom it runs as a row. */
  dock?: PlayersListEdge;
  /** The list turns to face players at `dock`: a row, read from that edge. */
  faces?: boolean;
  /** The border of the combatant whose turn it is pulses. */
  pulse?: boolean;
  /**
   * The turn began this many milliseconds ago, less than `TURN_FLASH_MS`: the border of who
   * holds it flashes, taken up where it was, since the list is drawn anew on every change.
   */
  turnFlash?: number | undefined;
  /** The turn just passed on: a row that starts at the turn pushes who acted out at its front (`playerInitiativePush.ts`). */
  push?: TurnPush | undefined;
  /** The most cards the list shows, 0 for all (`initiativeMaxCardsOf`). */
  maxCards?: number;
}

/** How long the border of a combatant whose turn began flashes; the animation in `player-initiative.scss` lasts as long. */
export const TURN_FLASH_MS = 900;

/**
 * As a fight starts, its banner stands this long where the lists will be before they slide in from their edges
 * beneath it, over `LIST_SLIDE_MS`, pushing it up to stand above them (`PlayerTurnBanner`). As it ends, its banner stands as
 * long above the lists before they slide out over `LIST_LEAVE_MS` and it settles where they were. Without a banner they move at once.
 */
export const FIGHT_INTRO_HOLD_MS = 1000;

/** How long a players' list takes to slide in from its edge, or out as the fight ends. */
export const LIST_SLIDE_MS = 700;

/** How long a players' list takes to slide out as the fight ends: a little slower than it came, gentle at both ends. */
export const LIST_LEAVE_MS = 1000;

/** The easing of a list sliding out, and of the fight's end banner settling with it. */
export const LIST_LEAVE_EASING = 'cubic-bezier(0.45, 0, 0.55, 1)';

/** How long one pulse of the turn's border lasts; `$pulse-ms` in `player-initiative.scss`. */
export const PULSE_MS = 1600;

/** The largest the players' list grows. */
export const MAX_INITIATIVE_SCALE = 3;

/**
 * The player view's initiative size as it is drawn: 1 to `MAX_INITIATIVE_SCALE`, and 1 for what is no number. The player
 * window puts it on its overlays (`--atlas-player-initiative-scale`), where the list's widths and text and the turn banner read it.
 */
export function initiativeScaleOf(scale: unknown): number {
  return typeof scale === 'number' && Number.isFinite(scale) ? Math.min(MAX_INITIATIVE_SCALE, Math.max(1, scale)) : 1;
}

/** The most cards the player view's lists may be set to show. */
export const MAX_INITIATIVE_CARDS = 12;

/** The player view's card limit as it is drawn: 0 (all) to `MAX_INITIATIVE_CARDS`, and 0 for what is no number. */
export function initiativeMaxCardsOf(count: unknown): number {
  return typeof count === 'number' && Number.isFinite(count) ? Math.min(MAX_INITIATIVE_CARDS, Math.max(0, Math.round(count))) : 0;
}

/** Whether players see a combatant: its token is on the map and not hidden. */
export function listedForPlayers(token: Pick<TokenEntity, 'isHidden'> | undefined): boolean {
  return !!token && !token.isHidden;
}

/**
 * What the players' list shows of `entry`, or null where they do not see it: none the GM hid from
 * them (`hiddenFromPlayers`); else a player at the table always, on the players' side; an enemy added by name
 * always, on the opponents'; a token's entry while its token is listed (`listedForPlayers`). The other arguments are `entryTokenOf`'s.
 */
export function playersEntryToken(
  entry: Pick<InitiativeEntry, 'tokenId' | 'partyMemberId' | 'conditions' | 'conditionValues' | 'conditionTurns' | 'hiddenFromPlayers'>,
  tokens: Readonly<Record<string, TokenEntity>> | undefined,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[] = [],
  sides?: readonly SideId[],
): EntryToken | null {
  // Conditions the tracker gave: a token's own, else the entry's, with the turns they last
  const conditions = (token: TokenEntity | undefined): CombatantCondition[] => entryConditions(entry, token, conditionDefinitions);
  // Whomever the GM hid from the players
  if (entry.hiddenFromPlayers) return null;
  if (entry.partyMemberId !== undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), side: 'players', conditions: conditions(undefined) };
  if (entry.tokenId === undefined) return { ...entryTokenOf(undefined, definitions, conditionDefinitions, sides), conditions: conditions(undefined) };
  const token = entryToken(tokens, entry);
  return listedForPlayers(token) ? { ...entryTokenOf(token, definitions, conditionDefinitions, sides), conditions: conditions(token) } : null;
}

/** The ids of the sides the players' list groups by: the running fight's, else the rules'. */
export function sideIdsOf(initiative: Pick<InitiativeState, 'isActive' | 'round' | 'sides'>, rules: InitiativeRules): SideId[] {
  return listedSides(initiative, rules).map((side) => side.id);
}

/**
 * What the players' list reads of a combatant's token; `definitions` are the map's resources, which
 * say who is defeated, `conditionDefinitions` its conditions, drawn as the map draws them, and
 * `sides` the ids of the sides the list knows (`sideIdsOf`).
 */
export function entryTokenOf(
  token: TokenEntity | undefined,
  definitions: readonly ResourceDefinition[],
  conditionDefinitions: readonly ConditionDefinition[] = [],
  sides?: readonly SideId[],
): EntryToken {
  return {
    hp: token?.resources?.hp ?? null,
    showRing: token?.showRing !== false,
    ringColor: token?.ringColor,
    side: sideOf(token, sides),
    defeated: combatantDefeated(token, definitions),
    conditions: combatantConditions(token, conditionDefinitions),
    ...(token?.showNameplate === true ? { showNameplate: true } : {}),
  };
}

/**
 * The list players see of a fight: every entry `tokenOf` answers for (those whose token they may
 * see), in turn order, grouped by side as the fight runs or the collection's rules say. Hit points
 * show only where `hpVisible`.
 */
export function playerInitiativeList(
  initiative: Pick<InitiativeState, 'isActive' | 'round' | 'sides' | 'cards'> & { entries: readonly PlayerInitiativeEntry[] },
  tokenOf: (entry: PlayerInitiativeEntry, index: number) => EntryToken | null,
  rules: InitiativeRules,
  hpVisible: boolean,
): PlayerInitiativeList {
  const combatants = initiative.entries
    .flatMap((entry, index): Combatant[] => {
      const token = tokenOf(entry, index);
      return token ? [{ entry, token: hpVisible ? token : { ...token, hp: null } }] : [];
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

/** Draws the players' list into `container` and answers its panel; nothing (null) while it has no combatants. */
export function renderPlayerInitiative(container: HTMLElement, list: PlayerInitiativeList, look: PlayerInitiativeLook): HTMLElement | null {
  if (!list.combatants.length) return null;
  const panel = container.createDiv({
    cls: 'atlas-player-initiative',
    attr: { role: 'region', 'aria-label': t('playerInit.order') },
  });
  // Its edge, where a turn banner attached to it finds it (`turnBannerAnchors.ts`)
  panel.dataset.edge = look.dock ?? 'right';
  // The panel's own surface: a layer of its own, so a theme's ivy can lie behind it (`themeIvy.ts`)
  panel.createDiv({ cls: 'atlas-player-initiative__surface', attr: { 'aria-hidden': 'true' } });
  // A list that faces its edge is the bottom's row, turned there
  const shape = look.faces ? 'bottom' : look.dock;
  if (shape && shape !== 'right') panel.addClass(`atlas-player-initiative--${shape}`);
  if (look.faces) panel.addClass(`atlas-player-initiative--faces-${look.dock ?? 'right'}`);
  const across = shape === 'top' || shape === 'bottom';
  if (look.pulse) {
    panel.addClass('atlas-player-initiative--pulse');
    // Taken up where the clock has it, so a new drawing goes on with the pulse instead of starting it again
    panel.style.setProperty('--atlas-pulse-phase', `${-Math.round(performance.now() % PULSE_MS)}ms`);
  }
  const fromTurn = look.fromTurn === true;
  const entries = panel.createDiv({ cls: 'atlas-player-initiative__list' });
  const segments = playerSegments(list, fromTurn, look.maxCards);
  // A row in turn order during a fight: each round's cards over its name, which move on with them
  const byRounds = across && list.isActive && !list.bySides;
  const rounds = byRounds ? renderRoundRow(entries, segments, list.round, (into, segment) => renderSegment(into, segment, list, look)) : [];
  if (!byRounds) {
    // In turn order the list is the list of combatants; by sides each side is one
    if (!list.bySides) entries.setAttribute('role', 'list');
    for (const segment of segments) renderSegment(entries, segment, list, look);
  }
  const pushing = byRounds && fromTurn && look.push !== undefined;
  if (pushing && look.push) renderTurnPush(entries, rounds, look.push, look, list.round);
  if (list.isActive && look.turnFlash !== undefined) {
    const holders = panel.querySelectorAll<HTMLElement>('.atlas-player-initiative__card--active, .atlas-player-initiative__side--active .atlas-player-initiative__card');
    for (const card of holders) {
      card.addClass('atlas-player-initiative__card--turn-flash');
      card.style.setProperty('--atlas-turn-flash-delay', `${-Math.round(look.turnFlash)}ms`);
    }
  }
  if (list.isActive) {
    if (!byRounds) panel.createDiv({ cls: 'atlas-player-initiative__round', text: t('playerInit.round', { round: list.round }) });
    // The list is drawn anew on every change: show the turn and the next two visible combatants,
    // or the top of a list that starts at the turn
    const side = panel.querySelector('.atlas-player-initiative__side--active');
    const card = panel.querySelector('.atlas-player-initiative__card--active');
    const axis = across ? 'x' : 'y';
    const edgesOf = look.faces ? ([layoutEdges] as const) : ([] as const);
    // A push starts at the front, where the turn is
    if (pushing) return panel;
    if (side) scrollWithin(entries, side, 'start', 0, axis, ...edgesOf);
    else if (card && fromTurn) scrollWithin(entries, card, 'start', 0, axis, ...edgesOf);
    else if (card) scrollWithin(entries, card, 'nearest', 2, axis, ...edgesOf);
  }
  return panel;
}

function renderSegment(entries: HTMLElement, segment: ListSegment<Combatant>, list: PlayerInitiativeList, look: PlayerInitiativeLook): void {
  if (segment.kind === 'round') {
    const label = t('playerInit.round', { round: segment.round });
    entries.createDiv({ cls: 'atlas-player-initiative__next-round', attr: { role: 'separator', 'aria-label': label } })
      .createSpan({ cls: 'atlas-player-initiative__next-round-label', text: label, attr: { 'aria-hidden': 'true' } });
    return;
  }
  if (segment.side) {
    const { name, roll } = segment.side;
    const label = roll === null ? name : t('initRules.sideRolled', { side: name, roll });
    const group = entries.createDiv({ cls: 'atlas-player-initiative__side', attr: { role: 'list', 'aria-label': label } });
    if (segment.active) {
      group.addClass('atlas-player-initiative__side--active');
      group.setAttribute('aria-current', 'true');
    }
    const heading = group.createDiv({ cls: 'atlas-player-initiative__side-label', attr: { 'aria-hidden': 'true' } });
    heading.createSpan({ text: name });
    if (roll !== null) heading.createSpan({ cls: 'atlas-player-initiative__side-roll', text: String(roll) });
    // By sides the turn is the side's and there are no numbers
    for (const member of segment.items) renderPlayerCard(group, member, look, false, 'none');
    return;
  }
  if (segment.delayed) {
    const group = entries.createDiv({ cls: 'atlas-player-initiative__side', attr: { role: 'list', 'aria-label': t('playerInit.delayed') } });
    group.createDiv({ cls: 'atlas-player-initiative__side-label', text: t('playerInit.delayed'), attr: { 'aria-hidden': 'true' } });
    for (const combatant of segment.items) renderPlayerCard(group, combatant, look, false);
    return;
  }
  for (const combatant of segment.items) renderPlayerCard(entries, combatant, look, list.isActive, list.byCards ? 'card' : 'number');
}
