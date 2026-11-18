import { EventBoundary, FederatedPointerEvent, type Container, type EventSystem, type FederatedEvent } from 'pixi.js';

/**
 * Stands where every pointer event enters PIXI (`EventBoundary.mapEvent`, before the hit test and
 * before any listener of the map hears it) and decides for the fingers what the tools get.
 *
 * A finger's press never passes as it arrives: it is kept, and `press` hands it on once the
 * gestures know it is the tools' (`TouchGestures`). Its moves and release pass or not as
 * `admits` says. Mouse and pen events pass untouched.
 *
 * While the map is only looked at (`look`, Table mode) nothing passes at all: a finger is the
 * gestures', and a mouse or pen is handed to `look`, which pans.
 *
 * What the tools are handed later is the press PIXI itself made of the browser's event, sent
 * through PIXI's own mapping again, so hit tests, press tracking and taps are PIXI's.
 */
/** What the gate asks while the map may only be looked at. */
export interface LookGate {
  active(): boolean;
  /** A mouse's or a pen's event, which the tools do not get. */
  hear(event: FederatedPointerEvent): void;
}

export class PointerGate {
  private readonly boundary: EventBoundary;
  /** PIXI's own mapping, which the gate stands in front of. */
  private readonly mapEvent: (event: FederatedEvent) => void;
  private readonly presses = new Map<number, FederatedPointerEvent>();
  private readonly spare: FederatedPointerEvent[] = [];
  private passing = false;

  constructor(
    events: EventSystem,
    private readonly cancelTarget: Container,
    private readonly admits: (native: object) => boolean,
    private readonly look?: LookGate,
  ) {
    const boundary = events.rootBoundary;
    this.boundary = boundary;
    this.mapEvent = (event) => EventBoundary.prototype.mapEvent.call(boundary, event);
    boundary.mapEvent = (event: FederatedEvent): void => this.receive(event);
  }

  /** The press of the finger as the tools would get it; null where PIXI never saw it. */
  pressOf(id: number): FederatedPointerEvent | null {
    return this.presses.get(id) ?? null;
  }

  /** The tools get the finger's press, as a press of the primary button. */
  press(id: number): void {
    const press = this.presses.get(id);
    if (press) this.pass(press, 'pointerdown', 0, 1);
  }

  /** The tools get a press and a release of the secondary button where the finger came down. */
  secondaryClick(id: number): void {
    const press = this.presses.get(id);
    if (!press) return;
    this.pass(press, 'pointerdown', 2, 2);
    this.pass(press, 'pointerup', 2, 0);
  }

  /**
   * The press the tools were handed is over without a release. PIXI maps no `pointercancel`, so
   * the map's listeners hear it on the viewport, as pixi-viewport's own input does.
   */
  cancel(id: number): void {
    const press = this.presses.get(id);
    if (!press) return;
    press.type = 'pointercancel';
    this.cancelTarget.emit('pointercancel', press);
  }

  /**
   * The finger is gone: its press is kept no longer. Unless the tools get its release (`released`),
   * which PIXI then maps itself, PIXI is told to forget what the finger pressed: a press that was
   * taken back never has a release, and PIXI would keep its targets for good.
   */
  forget(id: number, released = false): void {
    if (!released) this.releaseTargets(id);
    const press = this.presses.get(id);
    if (!press) return;
    this.presses.delete(id);
    this.spare.push(press);
  }

  destroy(): void {
    this.boundary.mapEvent = this.mapEvent;
    this.presses.clear();
    this.spare.length = 0;
  }

  private receive(event: FederatedEvent): void {
    if (!this.passing && this.look?.active()) {
      if (event instanceof FederatedPointerEvent && event.pointerType !== 'touch') this.look.hear(event);
      return;
    }
    if (this.passing || !(event instanceof FederatedPointerEvent) || event.pointerType !== 'touch') {
      this.mapEvent(event);
      return;
    }
    if (event.type === 'pointerdown') {
      if (this.admits(event.nativeEvent)) this.mapEvent(event);
      else this.keep(event);
      return;
    }
    if (!this.admits(event.nativeEvent)) return;
    this.mapEvent(event);
    // Every finger has an id of its own: what PIXI keeps of a press until the next one of its pointer would stay for good
    if (event.type === 'pointerup' || event.type === 'pointerupoutside') this.releaseTargets(event.pointerId);
  }

  /**
   * Drops the display objects PIXI remembers as pressed by the pointer (`EventBoundary.trackingData`,
   * read by its next release alone). PIXI offers nothing that forgets them without telling them of
   * a release outside, which a press that was taken back must not be followed by.
   */
  private releaseTargets(id: number): void {
    const pressed = this.boundary['trackingData'](id).pressTargetsByButton;
    for (const button in pressed) delete pressed[button];
  }

  private keep(event: FederatedPointerEvent): void {
    const press = this.presses.get(event.pointerId) ?? this.spare.pop() ?? new FederatedPointerEvent(this.boundary);
    copyPointer(event, press);
    this.presses.set(event.pointerId, press);
  }

  private pass(press: FederatedPointerEvent, type: string, button: number, buttons: number): void {
    press.type = type;
    press.button = button;
    press.buttons = buttons;
    this.passing = true;
    try {
      this.mapEvent(press);
    } finally {
      this.passing = false;
    }
  }
}

/** Copies what PIXI writes into a pointer event it makes of a browser's (`EventSystem._bootstrapEvent`). */
function copyPointer(from: FederatedPointerEvent, to: FederatedPointerEvent): void {
  to.nativeEvent = from.nativeEvent;
  to.pointerId = from.pointerId;
  to.width = from.width;
  to.height = from.height;
  to.isPrimary = from.isPrimary;
  to.pointerType = from.pointerType;
  to.pressure = from.pressure;
  to.tangentialPressure = from.tangentialPressure;
  to.tiltX = from.tiltX;
  to.tiltY = from.tiltY;
  to.twist = from.twist;
  to.isTrusted = from.isTrusted;
  to.timeStamp = from.timeStamp;
  to.type = from.type;
  to.altKey = from.altKey;
  to.ctrlKey = from.ctrlKey;
  to.metaKey = from.metaKey;
  to.shiftKey = from.shiftKey;
  to.button = from.button;
  to.buttons = from.buttons;
  to.detail = from.detail;
  to.client.copyFrom(from.client);
  to.movement.copyFrom(from.movement);
  to.page.copyFrom(from.page);
  to.screen.copyFrom(from.screen);
  to.global.copyFrom(from.global);
  to.offset.copyFrom(from.offset);
}
