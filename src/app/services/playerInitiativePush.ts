import type { Combatant, PlayerInitiativeList, PlayerInitiativeLook } from './playerInitiativeList';
import type { ListSegment } from '../initiative/listSegments';
import { renderPlayerCard } from './playerInitiativeCard';
import { t } from '../i18n';

/**
 * A row that starts at the turn moves on like a conveyor: when the turn passes on, the combatant who acted is
 * pushed out at the front while it comes in again at the end, in the next round. The list is drawn anew on every change,
 * so the push is a CSS animation taken up where it was (`--atlas-turn-push-delay`), as the turn's flash is.
 */

/** How long a push lasts; the animations in `player-initiative.scss` last as long. */
export const TURN_PUSH_MS = 700;

/** The combatants being pushed out, in their order, and how far the push has gone. */
export interface TurnPush {
  /** Who acted, and with them whom the turn passed by (sitting the round out, defeated): several glide out at once. */
  combatants: Combatant[];
  elapsed: number;
  /** The turn began a round: who acted closed the round before. */
  newRound: boolean;
}

const keyOf = ({ entry }: Combatant): string => `${entry.order}\u0000${entry.tokenId ?? entry.name}`;

/**
 * By how many places `next` is `previous` moved on, 0 for none: who led it left, with those the turn passed by, everyone
 * else as many places up, and as many came in at the end (those who left where the list shows everyone, the next in line
 * where it shows only so many). Whether it moved on or back the order alone cannot tell: `TurnPushWatch` asks the turn.
 */
export function movedOnBy(previous: readonly string[], next: readonly string[]): number {
  if (previous.length < 2 || previous.length !== next.length) return 0;
  for (let places = 1; places < previous.length; places++) {
    if (next.slice(0, -places).every((key, index) => key === previous[index + places])) return places;
  }
  return 0;
}

/** Notes the order the list was drawn in and when it last moved on by one turn. */
export class TurnPushWatch {
  private keys: string[] = [];
  private order: Combatant[] = [];
  private round = 0;
  private push: { combatants: Combatant[]; began: number; newRound: boolean } | null = null;

  /** The push under way in the list drawn now; undefined where none is. */
  see(segments: readonly ListSegment<Combatant>[], list: PlayerInitiativeList, fromTurn: boolean): TurnPush | undefined {
    const order = segments.flatMap((segment) => (segment.kind === 'round' ? [] : segment.items));
    const keys = order.map(keyOf);
    const places = movedOnBy(this.keys, keys);
    const changed = keys.join('\n') !== this.keys.join('\n');
    const leaving = this.order.slice(0, places);
    const leader = this.order[0];
    // On, not back: a later round, or a later place in this one
    const onwards = list.round > this.round || (list.round === this.round && leader !== undefined && (order[0]?.entry.order ?? -1) > leader.entry.order);
    this.keys = keys;
    this.order = order;
    const newRound = list.round !== this.round;
    this.round = list.round;
    // By sides a whole side moves on, which is no conveyor
    if (!fromTurn || !list.isActive || list.bySides) this.push = null;
    else if (places > 0 && onwards) this.push = { combatants: leaving, began: performance.now(), newRound };
    else if (changed) this.push = null;
    if (this.push === null) return undefined;
    const elapsed = performance.now() - this.push.began;
    return elapsed < TURN_PUSH_MS ? { combatants: this.push.combatants, elapsed, newRound: this.push.newRound } : undefined;
  }

  forget(): void {
    this.keys = [];
    this.order = [];
    this.round = 0;
    this.push = null;
  }
}

/** One round's cards in a row, over the round's name; the row of cards it returns takes them. */
function roundGroup(entries: HTMLElement, round: number): HTMLElement {
  const name = t('playerInit.round', { round });
  const group = entries.createDiv({ cls: 'atlas-player-initiative__round-group' });
  const cards = group.createDiv({ cls: 'atlas-player-initiative__round-cards', attr: { role: 'list', 'aria-label': name } });
  // The name, and a line from it to the round's end: how far the round still runs
  group.createDiv({ cls: 'atlas-player-initiative__round-label', attr: { 'aria-hidden': 'true' } })
    .createSpan({ cls: 'atlas-player-initiative__round-name', text: name });
  return cards;
}

/**
 * A row in turn order during a fight: the cards of this round and of the next each over their round's name, a
 * slim line between them in place of the column's divider, so the names move on with the cards. Returns the rows of
 * cards, this round's first; a round nobody is shown in is left out.
 */
export function renderRoundRow(entries: HTMLElement, segments: readonly ListSegment<Combatant>[], round: number, draw: (into: HTMLElement, segment: ListSegment<Combatant>) => void): HTMLElement[] {
  const rows = [roundGroup(entries, round)];
  for (const segment of segments) {
    if (segment.kind === 'round') rows.push(roundGroup(entries, segment.round));
    else draw(rows[rows.length - 1]!, segment);
  }
  const shown = rows.filter((cards) => cards.childElementCount > 0);
  for (const cards of rows) if (cards.childElementCount === 0) cards.parentElement?.remove();
  return shown;
}

/** Moves `cards`, the last of `row`, into a group of their own at its end, which slides as one. */
function pushGroup(row: HTMLElement, cards: readonly HTMLElement[]): HTMLElement {
  const group = row.createDiv({ cls: 'atlas-player-initiative__push-group', attr: { role: 'none' } });
  group.append(...cards);
  return group;
}

/**
 * Draws the push into a row's rounds: those who left the front (who acted, and whom the turn passed by) again at the
 * front, sliding out together, and as many cards at the end coming in. Where the push began a round, they closed the
 * round before, which leaves with its name.
 */
export function renderTurnPush(entries: HTMLElement, rounds: readonly HTMLElement[], push: TurnPush, look: PlayerInitiativeLook, round: number): void {
  const cards = rounds.flatMap((row) => [...row.children]).filter((card): card is HTMLElement => card.instanceOf(HTMLElement) && card.hasClass('atlas-player-initiative__card'));
  const newcomers = cards.slice(-push.combatants.length);
  if (push.combatants.length === 0 || newcomers.length < push.combatants.length) return;
  const delay = `${-Math.round(push.elapsed)}ms`;
  // Several come in as one, sliding in by their width together as the leaving ones go out, never folded over each other
  const row = newcomers[0]!.parentElement;
  const together = newcomers.length > 1 && row !== null && newcomers.every((newcomer) => newcomer.parentElement === row);
  const arriving = together ? [pushGroup(row, newcomers)] : newcomers;
  for (const element of arriving) {
    element.addClass('atlas-player-initiative__push-in');
    element.style.setProperty('--atlas-turn-push-delay', delay);
  }
  const into = push.newRound ? roundGroup(entries, round - 1) : rounds[0]!;
  // Several leave as one, sliding out by their width together
  const group = push.combatants.length > 1 && !push.newRound ? into.createDiv({ cls: 'atlas-player-initiative__push-group', attr: { role: 'none' } }) : into;
  for (const combatant of push.combatants) {
    renderPlayerCard(group, { ...combatant, entry: { ...combatant.entry, isActive: false } }, look, false);
    // The same combatant stands at the end: the leaving copy is only a picture
    group.lastElementChild?.removeAttribute('role');
  }
  const card = group === into ? (into.lastElementChild as HTMLElement) : group;
  if (group === into) {
    // In their order, before those who stay
    const copies = [...into.children].slice(-push.combatants.length);
    into.prepend(...copies);
  } else {
    into.prepend(group);
  }
  const leaving = push.newRound ? into.parentElement! : card;
  leaving.addClass('atlas-player-initiative__leaving');
  leaving.setAttribute('aria-hidden', 'true');
  leaving.style.setProperty('--atlas-turn-push-delay', delay);
  if (leaving !== card) entries.prepend(leaving);
  // Out by its own width and the gap after it, which is a card's, or a card's and the line's for a round
  if (leaving.offsetWidth > 0) leaving.style.setProperty('--atlas-push-width', `${leaving.offsetWidth}px`);
  if (together && arriving[0]!.offsetWidth > 0) arriving[0]!.style.setProperty('--atlas-push-in-width', `${arriving[0]!.offsetWidth}px`);
  entries.scrollLeft = 0;
}
