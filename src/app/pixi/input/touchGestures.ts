import { LONG_PRESS_MS, LongPress, movedPast, type PressPoint } from '../../input/longPress';
import type { GestureClock, GestureEffects, GestureHost } from './gestureTypes';
import { MULTI_TAP_MS, TouchTaps } from './touchTaps';

/**
 * How long a finger's press is held back from the tools, so that a second finger landing right
 * after it starts a pinch and nothing was pressed. A finger that moves is handed on at once.
 */
export const SETTLE_MS = 50;
const SETTLE_SLOP_PX = 3;

/**
 * - `settling`: just down, its press held back;
 * - `tool`: the tools have its press, and its moves and release are theirs;
 * - `waiting`: on the empty map, where it becomes a pan, a tap or a long press;
 * - `pan`: it pans the map alone;
 * - `navigate`: one of the two fingers that pan and zoom;
 * - `spent`: nothing until it is lifted.
 */
type Role = 'settling' | 'tool' | 'waiting' | 'pan' | 'navigate' | 'spent';

interface Finger {
  readonly id: number;
  readonly start: PressPoint;
  x: number;
  y: number;
  role: Role;
  /** The tools were handed its press and have not been told it ended. */
  pressed: boolean;
  /** What its long press does. */
  longPress: 'menu' | 'marquee' | null;
  /** It waits on the empty map of a tool whose finger takes objects: its tap may be half of a double tap. */
  onEmptyMap: boolean;
}

/**
 * Turns the fingers on the map into what the tools understand. Every decision is made here and
 * nothing is done here: the tools, the camera and the ring are behind `effects`, the tool in hand
 * behind `host`, and time behind `clock`.
 *
 * A finger's press is never passed on as it arrives: `press` hands it to the tools once it is
 * known to be theirs. Moves and releases answer whether the tools get them.
 */
export class TouchGestures {
  private host: GestureHost;
  private readonly fingers = new Map<number, Finger>();
  private readonly longPress: LongPress;
  private readonly taps: TouchTaps;
  /** The finger of a one-finger gesture. */
  private single: Finger | null = null;
  private pair: [Finger, Finger] | null = null;
  /** The pair has moved far enough to be a pinch or a pan, not a tap. */
  private pairMoves = false;
  private settleTimer: number | null = null;
  private ringShown = false;
  private penDown = false;
  /** From the first finger down to the last one up: the most fingers at once, when it began and whether any moved. */
  private mostFingers = 0;
  private beganAt = 0;
  private anyMoved = false;
  private tapX = 0;
  private tapY = 0;

  constructor(host: GestureHost, private readonly effects: GestureEffects, private readonly clock: GestureClock) {
    this.host = host;
    this.longPress = new LongPress(clock, () => this.longPressed());
    this.taps = new TouchTaps(clock, effects);
  }

  setHost(host: GestureHost): void {
    this.host = host;
  }

  /** Whether the finger is one whose moves and release are answered here. */
  tracks(id: number): boolean {
    return this.fingers.has(id);
  }

  /** A pen is the tool while it is down, and a hand resting beside it is no gesture. */
  setPenDown(down: boolean): void {
    this.penDown = down;
    const finger = this.single;
    if (down && finger?.role === 'settling') this.spend(finger);
  }

  down(id: number, x: number, y: number): void {
    if (this.fingers.has(id)) return;
    const finger: Finger = { id, start: { x, y }, x, y, role: 'spent', pressed: false, longPress: null, onEmptyMap: false };
    this.fingers.set(id, finger);
    if (this.fingers.size === 1) {
      this.mostFingers = 1;
      this.beganAt = this.clock.now();
      this.anyMoved = false;
    } else {
      this.mostFingers = Math.max(this.mostFingers, this.fingers.size);
    }
    if (this.penDown) return;
    if (this.fingers.size === 1) this.beginSingle(finger);
    else if (this.fingers.size === 2) this.beginPair();
  }

  /** Returns whether the tools get the move. */
  move(id: number, x: number, y: number): boolean {
    const finger = this.fingers.get(id);
    if (!finger) return true;
    const fromX = finger.x;
    const fromY = finger.y;
    finger.x = x;
    finger.y = y;
    if (!this.anyMoved && movedPast(finger.start, finger)) this.anyMoved = true;
    if (finger === this.single && this.longPress.pending && !this.longPress.move(finger)) this.hideRing();

    if (finger.role === 'settling' && movedPast(finger.start, finger, SETTLE_SLOP_PX)) this.settle(finger);
    switch (finger.role) {
      case 'tool':
        return true;
      case 'waiting':
        if (movedPast(finger.start, finger)) this.beginPan(finger);
        return false;
      case 'pan':
        this.effects.pan(x - fromX, y - fromY);
        return false;
      case 'navigate':
        this.movePair(finger, fromX, fromY);
        return false;
      default:
        return false;
    }
  }

  /** Returns whether the tools get the release. */
  up(id: number, x: number, y: number): boolean {
    const finger = this.fingers.get(id);
    if (!finger) return true;
    finger.x = x;
    finger.y = y;
    if (finger.role === 'settling') this.settle(finger);
    const forwarded = this.lift(finger);
    this.fingers.delete(id);
    if (this.fingers.size === 0) this.allLifted();
    return forwarded;
  }

  /** The browser took the finger away (a system gesture, a palm): nothing it began stays. */
  cancel(id: number): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.anyMoved = true;
    this.fingers.delete(id);
    if (finger === this.single) {
      this.endSingle();
      if (finger.pressed) this.effects.cancelPress(id, true);
      if (finger.role === 'pan') this.effects.endNavigation(false);
    } else if (finger.role === 'navigate') {
      this.endPair(false);
    }
  }

  /** Every finger is gone without a release (the window lost focus). */
  reset(): void {
    for (const id of Array.from(this.fingers.keys())) this.cancel(id);
  }

  destroy(): void {
    this.reset();
    this.taps.destroy();
  }

  private beginSingle(finger: Finger): void {
    this.single = finger;
    if (this.host.fingerMode() === 'direct') {
      finger.role = 'tool';
      finger.pressed = true;
      return;
    }
    finger.role = 'settling';
    this.longPress.begin(finger.start);
    this.settleTimer = this.clock.setTimeout(() => {
      this.settleTimer = null;
      this.settle(finger);
    }, SETTLE_MS);
  }

  /** The press is no pinch's first finger: the tools get it, or it waits on the empty map. */
  private settle(finger: Finger): void {
    this.clearSettle();
    const mode = this.host.fingerMode();
    if (mode === 'navigate') {
      finger.role = 'waiting';
    } else {
      this.effects.press(finger.id);
      finger.pressed = true;
      finger.onEmptyMap = mode === 'objects' && this.host.pressedEmptyMap();
      finger.role = finger.onEmptyMap ? 'waiting' : 'tool';
    }
    if (this.host.menuAt(finger.start.x, finger.start.y)) finger.longPress = 'menu';
    else if (finger.onEmptyMap) finger.longPress = 'marquee';

    if (!finger.longPress) this.longPress.cancel();
    else if (this.longPress.pending) this.showRing(finger);
  }

  private longPressed(): void {
    const finger = this.single;
    if (!finger) return;
    this.hideRing();
    this.taps.forgetTap();
    if (finger.longPress === 'marquee') {
      finger.role = 'tool';
      return;
    }
    if (finger.pressed) this.effects.cancelPress(finger.id, false);
    this.effects.secondaryClick(finger.id);
    this.spend(finger);
  }

  private beginPan(finger: Finger): void {
    this.endSingleGesture(finger);
    this.single = finger;
    finger.role = 'pan';
    this.taps.forgetTap();
    this.effects.beginNavigation();
  }

  /** A second finger is down: whatever the first began ends, and the two navigate. */
  private beginPair(): void {
    const [first, second] = Array.from(this.fingers.values()) as [Finger, Finger];
    const panning = first.role === 'pan';
    if (first === this.single) this.endSingleGesture(first);
    first.role = 'navigate';
    second.role = 'navigate';
    this.pair = [first, second];
    this.pairMoves = panning;
    this.tapX = (first.start.x + second.start.x) / 2;
    this.tapY = (first.start.y + second.start.y) / 2;
    this.taps.forgetTap();
    if (!panning) this.effects.beginNavigation();
  }

  private movePair(finger: Finger, fromX: number, fromY: number): void {
    if (!this.pair) return;
    const other = this.pair[0] === finger ? this.pair[1] : this.pair[0];
    if (!this.pairMoves) {
      // The fingers of a tap never move the map; a pinch starts from where they are now, without a jump.
      this.pairMoves = movedPast(finger.start, finger) || movedPast(other.start, other);
      return;
    }
    this.effects.pinch(
      (fromX + other.x) / 2, (fromY + other.y) / 2, Math.hypot(fromX - other.x, fromY - other.y),
      (finger.x + other.x) / 2, (finger.y + other.y) / 2, Math.hypot(finger.x - other.x, finger.y - other.y),
    );
  }

  /** Ends the pair's navigation; the finger that stays does nothing until it is lifted. */
  private endPair(glide: boolean): void {
    if (!this.pair) return;
    for (const finger of this.pair) finger.role = 'spent';
    this.pair = null;
    this.effects.endNavigation(glide && this.pairMoves);
  }

  /** What a lifted finger ends; returns whether the tools get its release. */
  private lift(finger: Finger): boolean {
    const role = finger.role;
    if (finger === this.single) this.endSingle();
    switch (role) {
      case 'tool':
        finger.pressed = false;
        return true;
      case 'waiting':
        // A tap: the tools get the press they were not handed yet, and the release.
        if (!finger.pressed) this.effects.press(finger.id);
        finger.pressed = false;
        if (!finger.onEmptyMap) return true;
        if (this.host.tapActsAt?.(finger.start.x, finger.start.y)) this.taps.forgetTap();
        else this.taps.emptyMapTap(finger.x, finger.y);
        return true;
      case 'pan':
        this.effects.endNavigation(true);
        return false;
      case 'navigate':
        this.endPair(true);
        return false;
      default:
        return false;
    }
  }

  private allLifted(): void {
    const tapped = !this.anyMoved && this.mostFingers > 1 && this.clock.now() - this.beganAt <= MULTI_TAP_MS;
    if (tapped) this.taps.multiTap(this.mostFingers, this.tapX, this.tapY);
  }

  /** The one-finger gesture is over as a gesture; what the tools were handed is told to end. */
  private endSingleGesture(finger: Finger): void {
    this.endSingle();
    if (finger.pressed) this.effects.cancelPress(finger.id, false);
    finger.pressed = false;
  }

  private endSingle(): void {
    this.clearSettle();
    this.hideRing();
    this.longPress.cancel();
    this.single = null;
  }

  private showRing(finger: Finger): void {
    this.ringShown = true;
    this.effects.showRing(finger.start.x, finger.start.y, LONG_PRESS_MS - (this.clock.now() - this.beganAt));
  }

  private hideRing(): void {
    if (!this.ringShown) return;
    this.ringShown = false;
    this.effects.hideRing();
  }

  private spend(finger: Finger): void {
    this.endSingle();
    finger.pressed = false;
    finger.role = 'spent';
  }

  private clearSettle(): void {
    if (this.settleTimer !== null) this.clock.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }
}
