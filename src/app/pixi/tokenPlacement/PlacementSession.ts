import type { TokenInput } from '../../types/viewState';
import { QUEUE_SHOWN, cycled, facingTowards, footprintCells, formationAt, handCentre, queueCountOffset, queueSlot, type PlacementGrid, type Point } from './placementLayout';
import { HELD_SCALE, type PlacementGhost } from './PlacementGhost';
import type { PlacementMarks } from './PlacementMarks';

/** A token in the GM's hand: what will be added, where the spawn laid it out, its ghost and which way it faces. */
export interface HeldToken {
  readonly input: TokenInput;
  readonly home: Point;
  readonly size: number;
  readonly ghost: PlacementGhost;
  /** Degrees from up, clockwise, as `rotation`; unset while it faces as its input does. */
  rotation: number | undefined;
}

export interface PlacementSessionDeps {
  /** The world point under a point of the canvas. */
  toWorld(screen: Point): Point;
  zoom(): number;
  /** The grid the tokens snap to and light the cells of; null where they are placed freely. */
  grid(): PlacementGrid | null;
  marks: PlacementMarks;
  /** Shows how many waiting tokens the queue leaves unshown, after its last place (world); null hides it. */
  count(at: Point | null, count: number): void;
  /** Adds `tokens` to the scene as they are put down (one undo step) and returns their ids. */
  commit(tokens: TokenInput[]): string[];
  /** Ghosts put down or taken away: they finish their motion outside the hand. */
  release(ghosts: PlacementGhost[]): void;
  /** The session ended with the ids of every token it placed. */
  end(placed: string[]): void;
}

/** A press that will put tokens down when the button is released; moved meanwhile, it turns them. */
interface Press {
  /** How many tokens from the front of the hand it puts down. */
  count: number;
  /** Where the press began, on the canvas. */
  start: Point;
  /** Which way those tokens faced before, for a press that is cancelled. */
  before: Array<number | undefined>;
  turning: boolean;
}

/** How visible held tokens are while the pointer is off the map. */
const AWAY_ALPHA = 0.35;
const HELD_ALPHA = 0.92;
/** While a press turns the token being placed, the queue steps back. */
const QUEUE_PRESSED_ALPHA = 0.4;
/** A token pressed onto the map is held lower, almost down. */
const PRESSED_SCALE = 1.02;
const PRESSED_LIFT = 0.45;
/** How far, in screen pixels, a press moves before it turns the tokens rather than putting them down as they face. */
const TURN_AFTER_PX = 8;
/** Seconds between the ripples of a formation put down, from the pointer outwards, at most `MAX_RIPPLE_DELAY` in all. */
const RIPPLE_DELAY_PER_CELL = 0.035;
const MAX_RIPPLE_DELAY = 0.2;

/**
 * Tokens spawned from the asset manager, held in the GM's hand until a click puts them on the map.
 * They follow the pointer laid out as the spawn arranged them (a formation, all put down at once);
 * while Shift is held they queue up instead, the first at the pointer and the rest waiting beside
 * it, the wheel cycles them, and each click puts down the first. Releasing Shift lays out the rest
 * again. Holding the button and moving the pointer turns the tokens being put down towards it.
 */
export class PlacementSession {
  private hand: HeldToken[];
  private readonly placed: string[] = [];
  private pointer: Point;
  private shift = false;
  private onMap = true;
  private ended = false;
  private press: Press | null = null;
  /** Where each held token would be put down now, by its index in the hand. */
  private places: Point[] = [];

  constructor(private readonly deps: PlacementSessionDeps, hand: HeldToken[], start: Point) {
    this.hand = hand;
    this.pointer = start;
    this.arrange();
  }

  get active(): boolean {
    return !this.ended;
  }

  /** Whether a press holds tokens down, so moving the pointer turns them. */
  get pressing(): boolean {
    return this.press !== null;
  }

  /** Whether the wheel cycles the queue: Shift is held over more than one token, and nothing is pressed. */
  get cycling(): boolean {
    return !this.ended && !this.press && this.queued();
  }

  /** The pointer moved to `screen` (a canvas point) with Shift held or not. */
  moveTo(screen: Point, shift: boolean): void {
    if (this.ended || this.press) return;
    this.pointer = screen;
    this.shift = shift;
    this.onMap = true;
    this.arrange();
  }

  setShift(shift: boolean): void {
    if (this.ended || this.press || shift === this.shift) return;
    this.shift = shift;
    this.arrange();
  }

  /** The pointer left the map or came back to it: held tokens wait faintly where they were. */
  setOnMap(onMap: boolean): void {
    if (this.ended || onMap === this.onMap) return;
    this.onMap = onMap;
    this.arrange();
  }

  /** The map moved or zoomed under the pointer. */
  viewChanged(): void {
    if (!this.ended) this.arrange();
  }

  /** The button went down at `screen`: every held token, or with Shift the first of the queue, is held there to be put down. */
  pressAt(screen: Point, shift: boolean): void {
    if (this.ended || this.press) return;
    this.pointer = screen;
    this.shift = shift;
    this.onMap = true;
    const count = this.queued() ? 1 : this.hand.length;
    this.press = { count, start: screen, before: this.hand.slice(0, count).map(({ rotation }) => rotation), turning: false };
    this.arrange();
  }

  /** The pointer moved to `screen` with the button held: the pressed tokens face it, in 15° steps unless `free`. */
  turn(screen: Point, free: boolean): void {
    const press = this.press;
    if (!press) return;
    if (!press.turning && Math.hypot(screen.x - press.start.x, screen.y - press.start.y) < TURN_AFTER_PX) return;
    press.turning = true;
    const batch = this.hand.slice(0, press.count);
    const centre = handCentre(this.places.slice(0, press.count).map((home, i) => ({ home, size: batch[i]!.size })));
    const facing = facingTowards(centre, this.deps.toWorld(screen), free);
    for (const token of batch) {
      token.rotation = facing;
      token.ghost.turnTo(facing, true);
    }
  }

  /** The button came up: the pressed tokens are put down where they are held, facing as they were turned. */
  release(): void {
    const press = this.press;
    if (!press || this.ended) return;
    this.press = null;
    const batch = this.hand.slice(0, press.count);
    const places = this.places.slice(0, press.count);
    let ids: string[];
    try {
      ids = this.deps.commit(batch.map(({ input, rotation }, i) => ({ ...input, x: places[i]!.x, y: places[i]!.y, ...(rotation !== undefined && { rotation }) })));
    } catch (error) {
      console.error('[TokenPlacement] Could not place the tokens:', error);
      this.cancel();
      return;
    }
    this.placed.push(...ids);
    this.land(batch, places);
    this.hand = this.hand.slice(press.count);
    if (this.hand.length > 0) {
      this.arrange();
      return;
    }
    this.deps.count(null, 0);
    this.finish();
  }

  /** Lets go of a press without putting anything down: the tokens face as before and follow the pointer again. */
  cancelPress(): void {
    const press = this.press;
    if (!press) return;
    this.press = null;
    this.hand.slice(0, press.count).forEach((token, i) => {
      token.rotation = press.before[i];
      token.ghost.turnTo(token.rotation ?? token.input.rotation ?? 0, false);
    });
    this.arrange();
  }

  /** Moves the queue `steps` on: the token being placed goes to the back, the next comes to the pointer. */
  cycle(steps: number): void {
    if (!this.cycling || steps === 0) return;
    this.hand = cycled(this.hand, steps);
    this.arrange();
  }

  /** Takes the held tokens away without placing them. */
  cancel(): void {
    if (this.ended) return;
    this.press = null;
    for (const { ghost } of this.hand) ghost.vanish();
    this.deps.release(this.hand.map(({ ghost }) => ghost));
    this.hand = [];
    this.deps.marks.clear();
    this.deps.count(null, 0);
    this.finish();
  }

  private finish(): void {
    this.ended = true;
    this.deps.end(this.placed);
  }

  private queued(): boolean {
    return this.shift && this.hand.length > 1;
  }

  /** How the `index`th held token is held: pressed onto the map while a press holds it, lifted otherwise. */
  private held(index: number, alpha: number): { scale: number; alpha: number; lift: number } {
    const pressed = this.press !== null && index < this.press.count;
    return { scale: pressed ? PRESSED_SCALE : HELD_SCALE, alpha, lift: pressed ? PRESSED_LIFT : 1 };
  }

  /** Poses every ghost for the pointer and lights the cells the tokens would cover. */
  private arrange(): void {
    const grid = this.deps.grid();
    const at = this.deps.toWorld(this.pointer);
    const alpha = this.onMap ? HELD_ALPHA : AWAY_ALPHA;
    const lit = new Map<string, Point[]>();
    const [head, ...waiting] = this.hand;
    if (!head) return;

    if (this.queued()) {
      const place = grid ? grid.snapToken(at, head.size) : at;
      this.places = [place];
      head.ghost.pose({ at: place, ...this.held(0, alpha) }, 'head');
      // The queue trails the token being placed, a constant size on screen
      const zoom = this.deps.zoom();
      const headRadius = (head.ghost.diameter * HELD_SCALE * zoom) / 2;
      const headOnScreen = { x: this.pointer.x + (place.x - at.x) * zoom, y: this.pointer.y + (place.y - at.y) * zoom };
      const fromHead = (offset: Point): Point => this.deps.toWorld({ x: headOnScreen.x + offset.x, y: headOnScreen.y + offset.y });
      const queueAlpha = (this.onMap ? 1 : AWAY_ALPHA) * (this.press ? QUEUE_PRESSED_ALPHA : 1);
      waiting.forEach(({ ghost }, index) => {
        const slot = queueSlot(index, headRadius);
        ghost.pose({ at: fromHead(slot.offset), scale: slot.diameter / (ghost.diameter * zoom), alpha: slot.alpha * queueAlpha, lift: 0.3 }, `queue-${Math.min(index, QUEUE_SHOWN - 1)}`);
      });
      const unshown = waiting.length - QUEUE_SHOWN;
      this.deps.count(unshown > 0 ? fromHead(queueCountOffset(headRadius)) : null, unshown);
      if (grid && this.onMap) addCells(lit, place, head.size, grid);
    } else {
      this.deps.count(null, 0);
      this.places = formationAt(this.hand, at, grid);
      this.hand.forEach(({ ghost, size }, index) => {
        const place = this.places[index]!;
        ghost.pose({ at: place, ...this.held(index, alpha) }, 'formation');
        if (grid && this.onMap) addCells(lit, place, size, grid);
      });
    }
    this.deps.marks.light(lit);
  }

  /** The ghosts of tokens just put down press into the map; their cells flash and a ripple runs out from the pointer. */
  private land(batch: readonly HeldToken[], places: readonly Point[]): void {
    const grid = this.deps.grid();
    const pointer = this.deps.toWorld(this.pointer);
    const pitch = grid?.cellSize ?? Math.max(1, batch[0]?.ghost.diameter ?? 1);
    const cells = new Map<string, Point[]>();
    const ripples = batch.map(({ ghost, size }, i) => {
      const centre = places[i]!;
      ghost.land(centre);
      if (grid) addCells(cells, centre, size, grid);
      const cellsAway = Math.hypot(centre.x - pointer.x, centre.y - pointer.y) / pitch;
      return { centre, radius: ghost.diameter / 2, delay: Math.min(MAX_RIPPLE_DELAY, cellsAway * RIPPLE_DELAY_PER_CELL) };
    });
    this.deps.marks.land(cells, ripples);
    this.deps.release(batch.map(({ ghost }) => ghost));
  }
}

/** Adds the outlines of the cells a token of `size` covers at `centre`, keyed by their centres. */
function addCells(into: Map<string, Point[]>, centre: Point, size: number, grid: PlacementGrid): void {
  for (const cell of footprintCells(centre, size, grid)) {
    into.set(`${Math.round(cell.x * 8)},${Math.round(cell.y * 8)}`, grid.cellOutline(cell));
  }
}
