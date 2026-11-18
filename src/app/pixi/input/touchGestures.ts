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
 * How long two fingers rest on a map that is only looked at before they end the looking: longer
 * than a long press, since hands lie on a tablet on the table, and never the start of a pinch.
 */
export const PAIR_HOLD_MS = 600;

/**
 * - `settling`: just down, its press held back;
 * - `tool`: the tools have its press, and its moves and release are theirs;
 * - `waiting`: on the empty map, where it becomes a pan, a tap or a long press, or its press held
 *   back until it lifts or moves (`'place'`, and on what acts as it is pressed);
 * - `pan`: it pans the map alone;
 * - `navigate`: one of the two fingers that pan and zoom;
 * - `spent`: nothing until it is lifted.
 */
type Role = 'settling' | 'tool' | 'waiting' | 'pan' | 'navigate' | 'spent';

interface Finger {
  readonly id: number;
  readonly start: PressPoint;
  /** When it came down, by its event's own time. */
  readonly downAt: number;
  x: number;
  y: number;
  role: Role;
  /** The tools were handed its press and have not been told it ended. */
  pressed: boolean;
  /** What its long press does. */
  longPress: 'menu' | 'marquee' | null;
  /** It waits on the empty map of a tool whose finger takes objects: its tap may be half of a double tap. */
  onEmptyMap: boolean;
  /** Its long press began a marquee, which it has not drawn yet. */
  heldForMarquee: boolean;
  /** It waits with its press held back, and once it leaves its place the press is the tools': a drag of theirs, no pan. */
  dragsTool: boolean;
  /** It came down on a map that is only looked at: the tools never hear of it. */
  looks: boolean;
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
  /** Two fingers resting on a map that is only looked at. */
  private readonly pairHold: LongPress;
  private readonly taps: TouchTaps;
  /** The finger of a one-finger gesture. */
  private single: Finger | null = null;
  private pair: [Finger, Finger] | null = null;
  /** The pair has moved far enough to be a pinch or a pan, not a tap. */
  private pairMoves = false;
  private settleTimer: number | null = null;
  private ringShown = false;
  private penDown = false;
  /** From the first finger down to the last one up: the most fingers at once and when it began. */
  private mostFingers = 0;
  private beganAt = 0;
  /** Those fingers are no tap of several: one moved or was taken away, they rested, or a pen was down beside them. */
  private noTap = false;
  private tapX = 0;
  private tapY = 0;

  constructor(host: GestureHost, private readonly effects: GestureEffects, private readonly clock: GestureClock) {
    this.host = host;
    this.longPress = new LongPress(clock, () => this.longPressed());
    this.pairHold = new LongPress(clock, () => this.pairHeld(), PAIR_HOLD_MS);
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
    if (!down) return;
    // The hand that holds the pen taps nothing, and a tap that waited is not what the pen's press is for
    this.noTap = true;
    this.taps.pressed();
    const finger = this.single;
    if (finger?.role === 'settling') this.spend(finger);
  }

  /** `at` is the event's own time (as `up`'s): how long a finger was down is read from the two, not from when they were heard. */
  down(id: number, x: number, y: number, at?: number): void {
    if (this.fingers.has(id)) return;
    const finger: Finger = {
      id, start: { x, y }, downAt: this.stamp(at), x, y, role: 'spent', pressed: false,
      longPress: null, onEmptyMap: false, heldForMarquee: false, dragsTool: false, looks: false,
    };
    this.fingers.set(id, finger);
    if (this.fingers.size === 1) {
      this.mostFingers = 1;
      this.beganAt = this.clock.now();
      this.noTap = this.penDown;
      this.taps.pressed();
    } else {
      this.mostFingers = Math.max(this.mostFingers, this.fingers.size);
      this.endPairHold();
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
    if (!this.noTap && movedPast(finger.start, finger)) this.noTap = true;
    if (finger === this.single && this.longPress.pending && !this.longPress.move(finger)) this.hideRing();

    if (finger.role === 'settling' && movedPast(finger.start, finger, SETTLE_SLOP_PX)) this.settle(finger);
    switch (finger.role) {
      case 'tool':
        return true;
      case 'waiting':
        if (!movedPast(finger.start, finger)) return false;
        if (finger.dragsTool) return this.beginDrag(finger);
        this.beginPan(finger);
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
  up(id: number, x: number, y: number, at?: number): boolean {
    const finger = this.fingers.get(id);
    if (!finger) return true;
    finger.x = x;
    finger.y = y;
    if (finger.role === 'settling') this.settle(finger);
    const forwarded = this.lift(finger, this.stamp(at) - finger.downAt);
    this.fingers.delete(id);
    if (this.fingers.size === 0) this.allLifted();
    return forwarded;
  }

  /** The finger is taken away (a system gesture, a palm): nothing it began stays. `byBrowser` unless the browser never said so. */
  cancel(id: number, byBrowser = true): void {
    const finger = this.fingers.get(id);
    if (!finger) return;
    this.noTap = true;
    this.fingers.delete(id);
    if (finger === this.single) {
      this.endSingle();
      if (finger.pressed) this.effects.cancelPress(id, byBrowser);
      if (finger.role === 'pan') this.effects.endNavigation(false);
    } else if (finger.role === 'navigate') {
      this.endPair(false);
    }
  }

  /**
   * Every finger is gone without a word from the browser (the window lost focus): the tools are
   * told that what they were handed is lost. Returns the fingers forgotten, which may still be down.
   */
  reset(): number[] {
    const ids = Array.from(this.fingers.keys());
    for (const id of ids) this.cancel(id, false);
    return ids;
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
    if (mode === 'look') {
      finger.role = 'waiting';
      finger.onEmptyMap = true;
      finger.looks = true;
      this.longPress.cancel();
      return;
    }
    // What acts as it is pressed is pressed by a tap alone, as where a tap places: a finger that leaves it pans
    const acts = this.host.pressActsAt?.(finger.start.x, finger.start.y) === true;
    if (mode === 'navigate' || mode === 'place' || acts) {
      finger.role = 'waiting';
      finger.dragsTool = mode === 'place' && !acts;
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
      finger.heldForMarquee = true;
      return;
    }
    if (finger.pressed) this.effects.cancelPress(finger.id, false);
    this.effects.secondaryClick(finger.id);
    this.spend(finger);
  }

  /** The finger whose press was held back left its place: the tools get the press where it came down, and its moves from here on. */
  private beginDrag(finger: Finger): boolean {
    this.effects.press(finger.id);
    finger.pressed = true;
    finger.role = 'tool';
    return true;
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
    if (!panning && this.host.fingerMode() === 'look') {
      this.pairHold.begin({ x: this.tapX, y: this.tapY });
      this.ringShown = true;
      this.effects.showRing(this.tapX, this.tapY, PAIR_HOLD_MS);
    }
  }

  /** The two fingers rested: the looking ends, and they do nothing more until they are lifted. */
  private pairHeld(): void {
    this.hideRing();
    this.noTap = true;
    this.endPair(false);
    this.effects.pairHeld?.();
  }

  private endPairHold(): void {
    if (!this.pairHold.pending) return;
    this.pairHold.cancel();
    this.hideRing();
  }

  private movePair(finger: Finger, fromX: number, fromY: number): void {
    if (!this.pair) return;
    const other = this.pair[0] === finger ? this.pair[1] : this.pair[0];
    if (!this.pairMoves) {
      // The fingers of a tap never move the map; a pinch starts from where they are now, without a jump.
      this.pairMoves = movedPast(finger.start, finger) || movedPast(other.start, other);
      if (this.pairMoves) this.endPairHold();
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
    this.endPairHold();
    for (const finger of this.pair) finger.role = 'spent';
    this.pair = null;
    this.effects.endNavigation(glide && this.pairMoves);
  }

  /** What a finger that was down for `heldMs` ends as it lifts; returns whether the tools get its release. */
  private lift(finger: Finger, heldMs: number): boolean {
    const role = finger.role;
    if (finger === this.single) this.endSingle();
    switch (role) {
      case 'tool':
        finger.pressed = false;
        if (finger.heldForMarquee && !movedPast(finger.start, finger)) {
          // Held and lifted in place: no marquee, but the empty map's own menu. A finger that was down
          // for less tapped, whatever a timer said that woke behind a thread held up
          if (heldMs >= LONG_PRESS_MS) this.effects.heldEmptyMap?.(finger.id);
          else this.tappedEmptyMap(finger);
        }
        return true;
      case 'waiting':
        if (finger.looks) {
          this.taps.emptyMapTap(finger.x, finger.y);
          return false;
        }
        // A tap: the tools get the press they were not handed yet, and the release.
        if (!finger.pressed) this.effects.press(finger.id);
        finger.pressed = false;
        if (finger.onEmptyMap) this.tappedEmptyMap(finger);
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

  /** A tap on the empty map is half of a double tap, unless it acts on what lies there. */
  private tappedEmptyMap(finger: Finger): void {
    if (this.host.tapActsAt?.(finger.start.x, finger.start.y)) this.taps.forgetTap();
    else this.taps.emptyMapTap(finger.x, finger.y);
  }

  private allLifted(): void {
    const tapped = !this.noTap && this.mostFingers > 1 && this.clock.now() - this.beganAt <= MULTI_TAP_MS;
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

  /** An event's own time where it has one, else the time it is heard. */
  private stamp(at: number | undefined): number {
    return at !== undefined && at > 0 ? at : this.clock.now();
  }

  private clearSettle(): void {
    if (this.settleTimer !== null) this.clock.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }
}
