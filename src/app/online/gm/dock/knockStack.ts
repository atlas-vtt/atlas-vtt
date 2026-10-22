import { animatePanelIn } from '../../../ui/panelMotion';
import type { RestCard } from '../book/restRequests.ts';
import type { GateActions, WaitingPlayer } from '../joinGate.ts';
import { knockKey } from '../waitingKnocks.ts';
import { textButton } from './controls.ts';
import { DockTooltip } from './dockTooltip.ts';
import { BAR_GAP, roomAbove, rowOf } from './dockDom.ts';
import type { RestActions } from './panelModel.ts';

/** The cards' width; never wider than the row the control hangs from. */
const KNOCK_WIDTH = 300;
/** The room the open control always leaves above itself: one card and the gap under it. */
export const KNOCK_ROOM = 64;

/** One of a card's answers: its words, its look, and what it does. */
export interface StackAction {
  readonly text: string;
  readonly kind: 'cta' | 'ghost';
  run(): void;
}

/**
 * A card over the control, whoever's it is (a newcomer who knocks, a player who asks for a rest):
 * one line of `name` (someone's own text) and `text`, and its answers. `about` is what stands behind
 * the line, shown as a tooltip of it, so the card stays one line. It takes an answer only while
 * `armed` and not `answered`.
 */
export interface StackCard {
  readonly key: string;
  /** What the card says, for screen readers. */
  readonly label: string;
  readonly name: string;
  readonly text: string;
  readonly about?: string;
  readonly armed: boolean;
  readonly answered: boolean;
  readonly actions: readonly StackAction[];
}

/** A card per newcomer who waits: Decline and Admit, or for a moment that the table was full. */
export function knockCards(waiting: readonly WaitingPlayer[], actions: Pick<GateActions, 'admit' | 'decline'>): StackCard[] {
  return waiting.map((player) => ({
    key: knockKey(player.id),
    label: `${player.name} wants to join`,
    name: player.name,
    text: player.full ? ': table full' : ' wants to join',
    armed: player.armed,
    answered: player.answered,
    actions: player.full ? [] : [
      { text: 'Decline', kind: 'ghost', run: () => actions.decline(player.id) },
      { text: 'Admit', kind: 'cta', run: () => actions.admit(player.id) },
    ],
  }));
}

/** What a rest request's card says behind its line: the actions picked, then what the rest will do. */
function restAbout(rest: RestCard): string {
  const picks = rest.picks.length === 0 ? [] : [rest.picks.join(', ')];
  return picks.length === 0 && rest.rules.length === 0 ? 'Nothing to restore' : [...picks, ...rest.rules].join(' · ');
}

/** A card per rest a player asks for: Decline and Approve, and behind its line the actions picked and what the rest will do. */
export function restCards(rests: readonly RestCard[], actions: RestActions): StackCard[] {
  return rests.map((rest) => ({
    key: rest.key,
    label: `${rest.character} asks for a ${rest.button}`,
    name: rest.character,
    text: ` asks for a ${rest.button}`,
    about: restAbout(rest),
    armed: rest.armed,
    answered: rest.answered,
    actions: [
      { text: 'Decline', kind: 'ghost', run: () => actions.decline(rest.key) },
      { text: 'Approve', kind: 'cta', run: () => actions.approve(rest.key) },
    ],
  }));
}

/** Every card in the order the cards came (`order`, their keys), so a new card goes above those that were there. */
export function stackCards(cards: readonly StackCard[], order: readonly string[]): StackCard[] {
  const place = (card: StackCard): number => {
    const index = order.indexOf(card.key);
    return index === -1 ? order.length : index;
  };
  return [...cards].sort((a, b) => place(a) - place(b));
}

/**
 * An answer of a card. It takes a press only once its card has stood for the arming time (`armed`,
 * kept with the card) and until the GM answered; before and after it stays in place and reads as off.
 */
function answerButton(row: HTMLElement, card: StackCard, index: number, action: StackAction): void {
  const live = card.armed && !card.answered;
  const button = textButton(row, action.text, () => live && action.run(), action.kind);
  button.dataset.focusKey = `${index}:${card.key}`;
  // Not `disabled`: the button keeps its place in the Tab order, and the one the GM pressed the focus.
  if (!live) button.setAttribute('aria-disabled', 'true');
}

/**
 * The cards, one line each: the name, the words after it, the answers. The name is someone's own
 * text: one line in a box of its own, cut with an ellipsis, its direction kept to itself, so it can
 * neither reorder the card's words nor move its buttons. A card with more behind its line makes the
 * line a focusable part of its own that shows it as a tooltip (`about`). Returns the tooltips made.
 */
export function renderCards(parent: HTMLElement, cards: readonly StackCard[], tooltipParent: HTMLElement = parent): DockTooltip[] {
  const tooltips: DockTooltip[] = [];
  for (const card of cards) {
    const row = parent.createDiv({ cls: 'atlas-online-knock', attr: { role: 'group', 'aria-label': card.label } });
    const text = row.createSpan({ cls: 'atlas-online-knock__text' });
    text.createEl('bdi', { cls: 'atlas-online-knock__name', text: card.name });
    text.createSpan({ cls: 'atlas-online-knock__rest', text: card.text });
    if (card.about !== undefined) {
      text.addClass('atlas-online-knock__text--about');
      text.tabIndex = 0;
      text.dataset.focusKey = `about:${card.key}`;
      const tooltip = new DockTooltip(tooltipParent, text, { cls: 'atlas-online-tooltip--cards', multiline: true });
      tooltip.setText(card.about);
      tooltips.push(tooltip);
    }
    card.actions.forEach((action, index) => answerButton(row, card, index, action));
  }
  return tooltips;
}

/** A card per newcomer who waits for the GM: the name, Decline and Admit. One the GM admitted into a table that had filled meanwhile says so for a moment. */
export function renderKnocks(parent: HTMLElement, waiting: readonly WaitingPlayer[], actions: Pick<GateActions, 'admit' | 'decline'>): void {
  renderCards(parent, knockCards(waiting, actions));
}

/**
 * The cards of those who wait for the GM (newcomers who knock, players who ask for a rest) over the
 * control, whether it is closed or open. They stand outside the menu's and the panel's flow, because
 * whoever knocks or asks chooses the moment: a card that came between the rows would push them, and
 * its Admit could land under a press meant for one of them. Here a new card goes above the earlier
 * ones, which stay where they are, and the control keeps room for one card above itself
 * (`KNOCK_ROOM`), so a knock moves nothing; more cards than the view has room for scroll, the
 * earliest in sight. What does move the cards (the control changing its size under them) is told to
 * the knocks (`moved`), which then take no answer for a moment, as they do when one of them leaves.
 *
 * It never takes the keyboard's focus (the map keeps its keys); Tab reaches its buttons, and focus
 * that was on a card which left goes to the next card, or to `fallback`.
 */
export class KnockStack {
  private readonly el: HTMLElement;
  private readonly root: HTMLElement;
  private readonly container: HTMLElement;
  private readonly fallback: HTMLElement;
  private readonly resizes: ResizeObserver;
  private moved: (() => void) | null = null;
  private tooltips: DockTooltip[] = [];
  private shownKey = '';

  constructor(root: HTMLElement, container: HTMLElement, fallback: HTMLElement) {
    this.root = root;
    this.container = container;
    this.fallback = fallback;
    this.el = root.createDiv({ cls: 'atlas-online-knocks', attr: { role: 'region', 'aria-label': 'Players asking the GM', 'aria-live': 'polite' } });
    this.el.hidden = true;
    // The cards hang from the control's top edge: when it changes its size, they moved.
    this.resizes = new ResizeObserver(() => this.reflow());
    this.resizes.observe(root);
  }

  /** The control or the surface open above it changed: the cards move along. */
  reflow(): void {
    this.fit();
    if (!this.el.hidden) this.moved?.();
  }

  /** Shows the cards (`stackCards`), the earliest lowest; none hides the stack. `moved` tells the cards they moved. */
  update(cards: readonly StackCard[], moved: () => void): void {
    this.moved = moved;
    const width = Math.min(KNOCK_WIDTH, rowOf(this.container)?.clientWidth ?? KNOCK_WIDTH);
    // A card's answers are no part of what it shows: the same cards with new handlers are not drawn again.
    const key = JSON.stringify([cards, width]);
    if (key === this.shownKey) return;
    this.shownKey = key;
    const active = this.el.doc.activeElement;
    const focus = active !== null && this.el.contains(active) ? active.getAttribute('data-focus-key') : null;
    const appears = this.el.hidden && cards.length > 0;
    const scroll = this.el.scrollTop;
    this.clearTooltips();
    this.el.empty();
    this.el.hidden = cards.length === 0;
    this.el.style.width = `${width}px`;
    // The control's border as the browser draws it (snapped to device pixels), so the cards' edge lies on the control's.
    if (appears) this.el.style.setProperty('--atlas-online-dock-border', getComputedStyle(this.root).borderLeftWidth);
    this.fit();
    this.tooltips = renderCards(this.el, cards, this.root);
    this.el.scrollTop = scroll;
    this.measure();
    if (focus !== null) {
      const target = this.el.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focus)}"]`) ?? this.el.querySelector<HTMLElement>('button') ?? this.fallback;
      target.focus({ preventScroll: true });
    }
    if (appears) animatePanelIn(this.el);
  }

  dispose(): void {
    this.resizes.disconnect();
    this.clearTooltips();
    this.el.remove();
  }

  private clearTooltips(): void {
    for (const tooltip of this.tooltips.splice(0)) tooltip.dispose();
  }

  /** The cards' height, which what a card's line has behind it stands above (`renderCards`). */
  private measure(): void {
    this.root.style.setProperty('--atlas-online-knocks-height', `${this.el.hidden ? 0 : this.el.offsetHeight}px`);
  }

  /** The cards' tallest height: from a gap above the control (or the surface open over it) up to a gap below the scene tabs. */
  private fit(): void {
    const row = rowOf(this.container);
    if (row === null) return;
    // The open surface says how far it reaches above the control (`DockSurface`).
    const above = parseFloat(this.root.style.getPropertyValue('--atlas-online-above')) || 0;
    const room = roomAbove(this.container, row, BAR_GAP) - this.root.offsetHeight - above - BAR_GAP;
    this.el.style.setProperty('--atlas-online-knocks-max', `${Math.max(0, room)}px`);
    this.measure();
  }
}
