import type { PlayersListEdge } from '../initiative/initiativeLayout';
import { shownItems, type ListSegment } from '../initiative/listSegments';
import { TURN_KEY_ATTRIBUTE } from '../initiative/motion/turnMotion';
import { layoutEdges, scrollWithin } from '../utils/scrollWithin';
import { playerSegments, type Combatant, type PlayerInitiativeList } from './playerInitiativeList';
import { renderPlayerCard } from './playerInitiativeCard';
import { showConditionsTip } from './playerConditionsTip';
import '../initiative/initiative-panel.scss';
import './player-initiative.scss';
import { t } from '../i18n';

/** How the list draws names and portraits, and how the GM laid the lists out. */
export interface PlayerInitiativeLook {
  showNames: boolean;
  /** The scene's Show nameplates: with `showNames`, a combatant is named where the GM's map shows its nameplate. */
  mapShowsNameplates: boolean;
  /** The address of an entry's portrait, or null to draw none. */
  portraitSrc(imagePath: string): string | null;
  /** Hands `apply` the `object-view-box` that shows a portrait's art without its transparent margins (`withArtViewBox`). */
  artViewBox?(imagePath: string, apply: (viewBox: string) => void): void;
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
  /** The most cards the list shows, 0 for all (`initiativeMaxCardsOf`). */
  maxCards?: number;
  /** Players see their TV at true scale (TrueScale): miniatures cover the tokens, so every card shows its conditions. */
  trueScale?: boolean;
  /** The card (`playerCardKey`) whose conditions the GM names by hovering it in the tracker: the list scrolls to it and names them too. */
  conditionsShown?: string | undefined;
  /** Draws one of the card's icons into `parent` (Obsidian's `setIcon` in Atlas), so the list imports nothing of Obsidian's and the player page draws it too. */
  icon?(parent: HTMLElement, name: PlayerCardIcon): void;
}

/** The icons a card draws: the stand-in of a combatant without art or a name shown, and the skull of the defeated. */
export type PlayerCardIcon = 'bot' | 'user' | 'skull';

/** How long the card of a combatant whose turn began lights up (both lists); `initiative-turn-flash` in `_initiative-cards.scss` lasts as long. */
export const TURN_FLASH_MS = 900;

/**
 * As a fight starts, its banner stands this long where the lists will be before they come in from their edges
 * beneath it (`enterList`), pushing it up to stand above them (`PlayerTurnBanner`). As it ends, its banner stands as
 * long above the lists before they leave (`exitList`) and it settles where they were. Without a banner they move at once.
 */
export const FIGHT_INTRO_HOLD_MS = 1000;

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

/** Draws the players' list into `container` and answers its panel; nothing (null) while it has no combatants. */
export function renderPlayerInitiative(container: HTMLElement, list: PlayerInitiativeList, look: PlayerInitiativeLook): HTMLElement | null {
  if (!list.combatants.length) return null;
  // The GM's tracker's panel (`initiative-panel.scss`), placed for the players
  const panel = container.createDiv({
    cls: 'atlas-initiative-panel atlas-player-initiative',
    attr: { role: 'region', 'aria-label': t('playerInit.order') },
  });
  // Its edge, where a turn banner attached to it finds it (`turnBannerAnchors.ts`)
  panel.dataset.edge = look.dock ?? 'right';
  // The panel's own surface: a layer of its own, so a theme's ivy can lie behind it (`themeIvy.ts`)
  panel.createDiv({ cls: 'atlas-initiative-panel__surface', attr: { 'aria-hidden': 'true' } });
  // A list that faces its edge is the bottom's row, turned there
  const shape = look.faces ? 'bottom' : look.dock;
  if (shape && shape !== 'right') panel.addClass(`atlas-player-initiative--${shape}`);
  if (look.faces) panel.addClass(`atlas-player-initiative--faces-${look.dock ?? 'right'}`);
  const across = shape === 'top' || shape === 'bottom';
  // A row is the column turned on its side (`initiative-panel.scss`)
  if (across) panel.addClass('atlas-initiative-panel--row');
  if (look.pulse) {
    panel.addClass('atlas-player-initiative--pulse');
    // Taken up where the clock has it, so a new drawing goes on with the pulse instead of starting it again
    panel.style.setProperty('--atlas-pulse-phase', `${-Math.round(performance.now() % PULSE_MS)}ms`);
  }
  const fromTurn = look.fromTurn === true;
  const entries = panel.createDiv({ cls: 'atlas-initiative-panel__list' });
  const segments = playerSegments(list, fromTurn, look.maxCards);
  // In turn order the list is the list of combatants; by sides each side is one
  if (!list.bySides) entries.setAttribute('role', 'list');
  for (const segment of segments) renderSegment(entries, segment, list, look);
  renderMore(entries, list, segments);
  // The cards scrolled past the list's start fade under a shade, as on the GM's tracker
  panel.createDiv({ cls: 'atlas-initiative-panel__top-shade', attr: { 'aria-hidden': 'true' } });
  if (list.isActive && look.turnFlash !== undefined) {
    const holders = panel.querySelectorAll<HTMLElement>('.atlas-initiative-card--active, .atlas-initiative-side--active .atlas-initiative-card');
    for (const card of holders) {
      card.addClass('atlas-initiative-card--turn-flash');
      card.style.setProperty('--atlas-turn-flash-delay', `${-Math.round(look.turnFlash)}ms`);
    }
  }
  // Without a round at the foot, a shade there while more of the list lies beyond it
  if (!list.isActive) panel.createDiv({ cls: 'atlas-initiative-panel__bottom-shade', attr: { 'aria-hidden': 'true' } });
  if (list.isActive) {
    panel.createDiv({ cls: 'atlas-initiative-panel__round', text: t('playerInit.round', { round: list.round }) });
    // The list is drawn anew on every change: show the turn and the next two visible combatants,
    // or the top of a list that starts at the turn
    const side = panel.querySelector('.atlas-initiative-side--active');
    const card = panel.querySelector('.atlas-initiative-card--active');
    const axis = across ? 'x' : 'y';
    // A turned list scrolls along its own axis: a row facing its side, and the left column turned around
    const edgesOf = look.faces || look.dock === 'left' ? ([layoutEdges] as const) : ([] as const);
    if (side) scrollWithin(entries, side, 'start', 0, axis, ...edgesOf);
    else if (card && fromTurn) scrollWithin(entries, card, 'start', 0, axis, ...edgesOf);
    else if (card) scrollWithin(entries, card, 'nearest', 2, axis, ...edgesOf);
    if (look.conditionsShown !== undefined) {
      showConditionsTip(panel, entries, list, look.conditionsShown, (shown) => scrollWithin(entries, shown, 'nearest', 0, axis, ...edgesOf));
    }
  }
  return panel;
}

/** Where the list shows only so many (`maxCards`), a tile at its end counts the combatants it leaves out. */
function renderMore(entries: HTMLElement, list: PlayerInitiativeList, segments: readonly ListSegment<Combatant>[]): void {
  const acting = list.combatants.filter(({ entry }) => !entry.delayed).length;
  const left = acting - shownItems(segments).filter(({ entry }) => !entry.delayed).length;
  if (left <= 0) return;
  entries.createDiv({ cls: 'atlas-player-initiative__more', text: `+${left}`, attr: { role: 'note', 'aria-label': t('playerInit.more', { count: left }) } });
}

function renderSegment(entries: HTMLElement, segment: ListSegment<Combatant>, list: PlayerInitiativeList, look: PlayerInitiativeLook): void {
  if (segment.kind === 'round') {
    const label = t('playerInit.round', { round: segment.round });
    entries.createDiv({ cls: 'atlas-initiative-round', attr: { role: 'separator', 'aria-label': label, [TURN_KEY_ATTRIBUTE]: `round:${segment.round}` } })
      .createSpan({ cls: 'atlas-initiative-round__label', text: label, attr: { 'aria-hidden': 'true' } });
    return;
  }
  if (segment.side) {
    // A side's roll, like every initiative number, stays on the GM's screen
    const { name } = segment.side;
    const group = entries.createDiv({ cls: 'atlas-initiative-side', attr: { role: 'list', 'aria-label': name } });
    if (segment.active) {
      group.addClass('atlas-initiative-side--active');
      group.setAttribute('aria-current', 'true');
    }
    group.createDiv({ cls: 'atlas-initiative-side__label', text: name, attr: { 'aria-hidden': 'true', [TURN_KEY_ATTRIBUTE]: `side:${name}` } });
    // By sides the turn is the side's
    for (const member of segment.items) renderPlayerCard(group, member, look, false);
    return;
  }
  if (segment.delayed) {
    const group = entries.createDiv({ cls: 'atlas-initiative-side atlas-initiative-side--delayed', attr: { role: 'list', 'aria-label': t('playerInit.delayed') } });
    group.createDiv({ cls: 'atlas-initiative-side__label', text: t('playerInit.delayed'), attr: { 'aria-hidden': 'true', [TURN_KEY_ATTRIBUTE]: 'delayed' } });
    for (const combatant of segment.items) renderPlayerCard(group, combatant, look, false);
    return;
  }
  for (const combatant of segment.items) renderPlayerCard(entries, combatant, look, list.isActive);
}
