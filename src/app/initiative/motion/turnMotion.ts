/**
 * How both initiative lists (the GM's tracker and the players' list) move when the turn passes on or back: every card
 * glides from where it was to where it is now (FLIP), in a wave along the way they move; whoever wraps round the list
 * (who acted, at the turn's front) slides on out at one end and comes in again at the other, as a conveyor does. One
 * set of rules for both directions, for columns and rows, and for a list turned to face a side of the table, since
 * places are read in the list's own frame. The players' list is drawn anew on every change: it takes a snapshot before
 * and plays after, and a drawing in the middle of a glide carries every card on from where it stood (its place and its
 * opacity as they were then), so the motion never jumps.
 */

import { prefersReducedMotion } from '../../utils/motion';

/** Marks what moves: a card (by its combatant), a round's divider or name, a side's name. */
export const TURN_KEY_ATTRIBUTE = 'data-turn-key';
/** The mark of a widget's card, the same in the map view's bar and the player window's. */
export function widgetMotionMark(id: string): Record<string, string> {
  return { [TURN_KEY_ATTRIBUTE]: `widget:${id}` };
}
/** Copies of cards sliding out, laid over the list until they are gone. */
export const TURN_GHOST_CLASS = 'atlas-initiative-ghost';

/** How long a card takes to glide one place: a motion watched across the table, longer than a control's. */
export const TURN_MOVE_MS = 460;
/** A soft start and a long settle (`--ease-drawer`), so the cards come to rest rather than stop. */
const MOVE_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Each card starts this much after the one ahead of it in the way they move, at most `WAVE_STEPS` steps. */
const WAVE_MS = 22;
const WAVE_STEPS = 6;
/** Who comes in again waits until the others have begun to make room. */
const ARRIVE_DELAY_MS = 90;
/** Who leaves goes a little quicker than the others move. */
const LEAVE_MS = 360;
/** In a list laid out anew, what is gone fades where it stood while the others close its gap, and what is new grows in. */
const FADE_AWAY_MS = 220;
const FADE_AWAY_SCALE = '0.94';
const GROW_IN_SCALE = '0.94';

/** Where a marked element stood, in its list's frame (the list's scroll left out), with what it showed then. */
interface Place {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  element: HTMLElement;
}

export type TurnSnapshot = ReadonlyMap<string, Place>;

/**
 * How places are read and moves played. `fromRight` reads places from the list's right edge, for a box anchored there
 * whose width changes (the widgets); `wrap` false glides every element to its new place, however far and whichever
 * way, grows in what is new and fades out what is gone where it stood: for a list laid out anew rather than moved on.
 */
export interface MotionOptions {
  fromRight?: boolean;
  wrap?: boolean;
}

/**
 * The offset of `element` from `list`'s padding box, adding up the positioned ancestors between them and the
 * `translate` they are drawn with (a side being dragged carries its cards); null outside it.
 */
function offsetIn(list: HTMLElement, element: HTMLElement): { x: number; y: number } | null {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = element;
  const view = list.ownerDocument.defaultView;
  while (node && node !== list) {
    x += node.offsetLeft;
    y += node.offsetTop;
    if (node !== element && view) {
      const moved = translationOf(view.getComputedStyle(node));
      x += moved.x;
      y += moved.y;
    }
    node = node.offsetParent as HTMLElement | null;
  }
  return node === list ? { x, y } : null;
}

/** The `translate` a running glide gives an element, which its place leaves out. */
function translationOf(style: CSSStyleDeclaration): { x: number; y: number } {
  const [x = '0', y = '0'] = (style.translate || 'none') === 'none' ? [] : style.translate.split(' ');
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 };
}

/** Where every marked element of `list` stands now, as it is seen: a glide under way included. */
export function snapshotTurn(list: HTMLElement | null, { fromRight = false }: MotionOptions = {}): TurnSnapshot {
  const places = new Map<string, Place>();
  if (!list) return places;
  const view = list.ownerDocument.defaultView;
  for (const element of list.querySelectorAll<HTMLElement>(`[${TURN_KEY_ATTRIBUTE}]`)) {
    const key = element.getAttribute(TURN_KEY_ATTRIBUTE);
    const offset = offsetIn(list, element);
    if (!key || !offset || places.has(key)) continue;
    const style = view?.getComputedStyle(element);
    const moved = style ? translationOf(style) : { x: 0, y: 0 };
    places.set(key, {
      x: offset.x + moved.x - (fromRight ? list.offsetWidth : 0),
      y: offset.y + moved.y,
      width: element.offsetWidth,
      height: element.offsetHeight,
      opacity: style ? parseFloat(style.opacity) : 1,
      element,
    });
  }
  return places;
}

type Vector = { x: number; y: number };

/** The move most elements made: one place on or back. Null where nothing moved. */
function commonStep(before: TurnSnapshot, after: TurnSnapshot): Vector | null {
  const counts = new Map<string, { step: Vector; count: number }>();
  for (const [key, place] of after) {
    const was = before.get(key);
    if (!was) continue;
    const step = { x: place.x - was.x, y: place.y - was.y };
    if (Math.hypot(step.x, step.y) < 1) continue;
    // Moves within a few pixels of each other are one (the gap after a round's divider differs)
    const bucket = `${Math.round(step.x / 8)},${Math.round(step.y / 8)}`;
    const counted = counts.get(bucket);
    if (counted) counted.count++;
    else counts.set(bucket, { step, count: 1 });
  }
  let best: { step: Vector; count: number } | null = null;
  for (const counted of counts.values()) if (!best || counted.count > best.count) best = counted;
  return best?.step ?? null;
}

const dot = (a: Vector, b: Vector): number => a.x * b.x + a.y * b.y;

/**
 * An element went round the list (against the way the others moved): it leaves at one end and comes in at the other.
 * One that went further the same way (a reorder, a list drawn again in the middle of a glide) glides like the others.
 */
function wrapped(was: Place, place: Place, step: Vector | null): boolean {
  return step !== null && dot({ x: place.x - was.x, y: place.y - was.y }, step) < 0;
}

/**
 * A copy of `was` laid over `list` where it stood, taking no pointer and hidden from screen readers. One read from the
 * right edge is placed by its distance from that edge, so it stays put while the list's width changes under it.
 */
function ghostOf(list: HTMLElement, was: Place, fromRight: boolean): HTMLElement {
  const ghost = was.element.cloneNode(true) as HTMLElement;
  ghost.removeAttribute(TURN_KEY_ATTRIBUTE);
  ghost.querySelectorAll(`[${TURN_KEY_ATTRIBUTE}]`).forEach((inner) => inner.removeAttribute(TURN_KEY_ATTRIBUTE));
  ghost.removeAttribute('role');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.addClass(TURN_GHOST_CLASS);
  Object.assign(ghost.style, {
    position: 'absolute', top: `${was.y}px`, width: `${was.width}px`, height: `${was.height}px`,
    margin: '0', pointerEvents: 'none', translate: 'none',
    ...(fromRight ? { right: `${-was.x - was.width}px` } : { left: `${was.x}px` }),
  });
  list.append(ghost);
  return ghost;
}

/** A copy of `was` where it stood, sliding on out by one place as it fades. */
function leave(list: HTMLElement, was: Place, step: Vector, fromRight: boolean): void {
  const ghost = ghostOf(list, was, fromRight);
  const gone = (): void => ghost.remove();
  // It stays clear for the first stretch of its slide, so the eye follows it out before it fades
  ghost.animate(
    [{ translate: '0 0', opacity: was.opacity }, { offset: 0.35, opacity: was.opacity }, { translate: `${step.x}px ${step.y}px`, opacity: 0 }],
    { duration: LEAVE_MS, easing: MOVE_EASING, fill: 'forwards' },
  ).finished.then(gone, gone);
}

/** A copy of `was` fades and shrinks a little where it stood, quicker than the others close its gap. */
function fadeAway(list: HTMLElement, was: Place, fromRight: boolean): void {
  const ghost = ghostOf(list, was, fromRight);
  const gone = (): void => ghost.remove();
  ghost.animate(
    [{ opacity: was.opacity, scale: '1' }, { opacity: 0, scale: FADE_AWAY_SCALE }],
    { duration: FADE_AWAY_MS, easing: MOVE_EASING, fill: 'forwards' },
  ).finished.then(gone, gone);
}

/** `element` grows in where it stands once the others have begun to make room, to how it rests. */
function growIn(element: HTMLElement): void {
  element.animate(
    [{ opacity: 0, scale: GROW_IN_SCALE, offset: 0 }],
    { duration: TURN_MOVE_MS, delay: ARRIVE_DELAY_MS, easing: MOVE_EASING, fill: 'backwards' },
  );
}

/** `element` comes in from one place back along the way the others move, as it fades in. */
function arrive(element: HTMLElement, step: Vector): void {
  element.animate(
    [{ translate: `${-step.x}px ${-step.y}px`, opacity: 0, offset: 0 }],
    { duration: TURN_MOVE_MS, delay: ARRIVE_DELAY_MS, easing: MOVE_EASING, fill: 'backwards' },
  );
}

/**
 * Moves the marked elements of `list` from where `before` saw them to where they stand now. Elements that did not move
 * stay still; with reduced motion nothing moves, the lists change at once. Every motion ends on what the element shows
 * at rest (its opacity, say, in a stack whose lower cards are hidden), never on a value of its own.
 */
export function playTurnMotion(list: HTMLElement | null, before: TurnSnapshot, options: MotionOptions = {}): void {
  if (!list || before.size === 0 || typeof list.animate !== 'function' || prefersReducedMotion(list)) return;
  const fromRight = options.fromRight === true;
  const after = snapshotTurn(list, options);
  const step = options.wrap === false ? null : commonStep(before, after);
  const gliding: { place: Place; from: Vector; opacity: number }[] = [];
  for (const [key, place] of after) {
    const was = before.get(key);
    if (was && !wrapped(was, place, step)) {
      const from = { x: was.x - place.x, y: was.y - place.y };
      if (Math.hypot(from.x, from.y) >= 0.5 || was.opacity < 0.99) gliding.push({ place, from, opacity: was.opacity });
    } else if (step) {
      if (was) leave(list, was, step, fromRight);
      arrive(place.element, step);
    } else if (!was) {
      growIn(place.element);
    }
  }
  for (const [key, was] of before) {
    if (after.has(key)) continue;
    if (step) leave(list, was, step, fromRight);
    else if (options.wrap === false) fadeAway(list, was, fromRight);
  }
  // The wave runs the way they move: who is furthest along goes first
  const along = step ?? { x: 0, y: 0 };
  gliding.sort((a, b) => dot(b.place, along) - dot(a.place, along));
  gliding.forEach(({ place, from, opacity }, index) => {
    place.element.animate(
      [{ translate: `${from.x}px ${from.y}px`, opacity, offset: 0 }],
      { duration: TURN_MOVE_MS, delay: Math.min(index, WAVE_STEPS) * WAVE_MS, easing: MOVE_EASING, fill: 'backwards' },
    );
  });
}

/** The copies still sliding out of `list`, to be laid over the list that replaces it (`adoptGhosts`). */
export function ghostsOf(list: HTMLElement | null): HTMLElement[] {
  return list ? [...list.querySelectorAll<HTMLElement>(`:scope > .${TURN_GHOST_CLASS}`)] : [];
}

/** Lays copies still sliding out over `list`; their slides go on where they were. */
export function adoptGhosts(list: HTMLElement | null, ghosts: readonly HTMLElement[]): void {
  if (list) list.append(...ghosts);
}
