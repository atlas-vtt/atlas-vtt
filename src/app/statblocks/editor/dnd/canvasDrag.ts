/**
 * One drag over the template editor's canvas: it measures the drawn blocks,
 * follows the pointer (or the keyboard's steps), works out the drop target,
 * slides the siblings of the starting list and scrolls the canvas near its
 * edges. Everything it binds is on the stage's own document and window, so a
 * popout works the same; `finish` takes every mark and listener away again.
 */

import { observeResize } from '../../../utils/observeResize';
import type { StatblockTemplate } from '../../model/templateTypes';
import { PANEL_SCROLL_SELECTOR } from '../panel-frame/panelSelectors';
import { blockFrame } from '../template-editor/editorChrome';
import { revealInScroller, scrollNearEdge } from './autoScroll';
import { measureScene, SHIFT_ATTRIBUTE, toClient, toStage } from './collision';
import { contains, lineBox, type Box, type Point } from './dropGeometry';
import { dropTargetAt, keyboardTargets, sameTarget, type DragSubject, type DropScene, type DropTarget } from './dropTargets';
import { dropView, shiftPlanFor, type DropView } from './dropView';
import type { KeyboardStepper } from './keyboardSensor';

export interface CanvasDragHost {
  stage: HTMLElement;
  /** The template as the session holds it now. */
  template: () => StatblockTemplate;
  readOnly: boolean;
  /** The target changed: draw it, say it. */
  onTarget: (target: DropTarget | null, view: DropView | null) => void;
}

/** Marks the frame of the block being moved: it stays in place, dimmed. */
export const DRAGGING_ATTRIBUTE = 'data-te-dragging';
/** How far a slid frame moves; its stylesheet turns them into its transform. */
const SHIFT_X = '--atlas-te-shift-x';
const SHIFT_Y = '--atlas-te-shift-y';
/** The card's padding around its blocks still counts as the card: a drop there lands at the nearest place. */
const CARD_MARGIN = 16;

function grown(box: Box, by: number): Box {
  return { left: box.left - by, top: box.top - by, right: box.right + by, bottom: box.bottom + by };
}

export class CanvasDrag implements KeyboardStepper {
  target: DropTarget | null = null;
  private scene: DropScene;
  private pointer: Point | null = null;
  private keyboard: { targets: DropTarget[]; start: number; at: number } | null = null;
  private shifted = new Set<HTMLElement>();
  private frame = 0;
  private measureFrame = 0;
  private readonly stops: Array<() => void> = [];
  private readonly scroller: HTMLElement | null;

  constructor(private readonly host: CanvasDragHost, private readonly subject: DragSubject, keyboard: boolean) {
    this.scroller = host.stage.closest<HTMLElement>(PANEL_SCROLL_SELECTOR);
    this.scene = measureScene(host.stage, host.template().layout);
    if (keyboard) this.keyboard = { ...keyboardTargets(this.scene, subject), at: -1 };
  }

  start(): void {
    const { stage } = this.host;
    const doc = stage.doc;
    const moving = this.subject.movingId ? blockFrame(stage, this.subject.movingId) : null;
    moving?.setAttribute(DRAGGING_ATTRIBUTE, '');
    if (!this.keyboard) {
      const move = (event: PointerEvent): void => {
        this.pointer = { x: event.clientX, y: event.clientY };
        this.schedule();
      };
      doc.addEventListener('pointermove', move, { passive: true });
      this.stops.push(() => doc.removeEventListener('pointermove', move));
    }
    const scrolled = (): void => this.schedule();
    this.scroller?.addEventListener('scroll', scrolled, { passive: true });
    this.stops.push(() => this.scroller?.removeEventListener('scroll', scrolled));
    // The card changing under the drag (another view's edit, a new preview) is measured again; the
    // drop indicator, which shares the stage, is not part of the card.
    const Observer = (stage.win as Window & { MutationObserver?: typeof MutationObserver }).MutationObserver;
    const sheet = stage.querySelector('.atlas-statblock');
    if (Observer && sheet) {
      const observer = new Observer(() => this.remeasure());
      observer.observe(sheet, { childList: true, subtree: true, characterData: true });
      this.stops.push(() => observer.disconnect());
    }
    this.stops.push(observeResize([stage], () => this.remeasure()));
  }

  /** Steps a keyboard drag to the next or previous place and scrolls it into view. */
  step(direction: 1 | -1): Point | null {
    const keys = this.keyboard;
    if (!keys || keys.targets.length === 0) return null;
    const next = keys.at === -1 ? (direction === 1 ? keys.start : keys.start - 1) : keys.at + direction;
    keys.at = Math.min(Math.max(next, 0), keys.targets.length - 1);
    const target = keys.targets[keys.at] ?? null;
    this.show(target);
    return this.anchor();
  }

  /** The target to drop on, with every mark and listener taken away; the slid frames snap back without a transition. */
  finish(): DropTarget | null {
    const { stage } = this.host;
    stage.win.cancelAnimationFrame(this.frame);
    stage.win.cancelAnimationFrame(this.measureFrame);
    for (const stop of this.stops.splice(0)) stop();
    for (const frame of stage.querySelectorAll(`[${DRAGGING_ATTRIBUTE}]`)) frame.removeAttribute(DRAGGING_ATTRIBUTE);
    // Without the mark the transition goes too, so the frames snap back as the card takes the drop.
    for (const frame of stage.querySelectorAll<HTMLElement>(`[${SHIFT_ATTRIBUTE}]`)) {
      frame.removeAttribute(SHIFT_ATTRIBUTE);
      frame.style.removeProperty(SHIFT_X);
      frame.style.removeProperty(SHIFT_Y);
    }
    this.shifted.clear();
    return this.target;
  }

  private schedule(): void {
    const win = this.host.stage.win;
    win.cancelAnimationFrame(this.frame);
    this.frame = win.requestAnimationFrame(() => this.update());
  }

  private remeasure(): void {
    const win = this.host.stage.win;
    win.cancelAnimationFrame(this.measureFrame);
    this.measureFrame = win.requestAnimationFrame(() => {
      this.scene = measureScene(this.host.stage, this.host.template().layout);
      if (!this.keyboard) {
        this.update(true);
        return;
      }
      const { targets, start } = keyboardTargets(this.scene, this.subject);
      const at = targets.findIndex((target) => sameTarget(target, this.target));
      this.keyboard = { targets, start, at: at === -1 ? Math.min(this.keyboard.at, targets.length - 1) : at };
      this.show(this.keyboard.targets[this.keyboard.at] ?? null, true);
    });
  }

  private update(force = false): void {
    if (!this.pointer) return;
    this.scroll(this.pointer);
    this.show(this.targetAt(this.pointer), force);
  }

  /** The target under the pointer; none outside the visible card, where letting go cancels (§7.3). */
  private targetAt(client: Point): DropTarget | null {
    const view = (this.scroller ?? this.host.stage).getBoundingClientRect();
    if (client.x < view.left || client.x > view.right || client.y < view.top || client.y > view.bottom) return null;
    const point = toStage(this.host.stage, client);
    const { card } = this.scene;
    if (card && !contains(grown(card, CARD_MARGIN), point)) return null;
    if (this.host.readOnly) return { kind: 'refused' };
    return dropTargetAt(this.scene, this.subject, point);
  }

  private show(target: DropTarget | null, force = false): void {
    if (!force && sameTarget(target, this.target)) return;
    this.target = target;
    const plan = target ? shiftPlanFor(this.scene, this.subject, target) : null;
    this.slide(plan?.shifts ?? new Map());
    this.host.onTarget(target, target ? dropView(target, plan?.line ?? null) : null);
  }

  /** Slides the frames of the starting list; frames no longer in `shifts` slide back (they keep their mark until the end). */
  private slide(shifts: ReadonlyMap<string, { x: number; y: number }>): void {
    const next = new Set<HTMLElement>();
    for (const [id, shift] of shifts) {
      const frame = blockFrame(this.host.stage, id);
      if (!frame) continue;
      next.add(frame);
      frame.setAttribute(SHIFT_ATTRIBUTE, '');
      frame.style.setProperty(SHIFT_X, `${shift.x}px`);
      frame.style.setProperty(SHIFT_Y, `${shift.y}px`);
    }
    for (const frame of this.shifted) {
      if (next.has(frame)) continue;
      frame.style.removeProperty(SHIFT_X);
      frame.style.removeProperty(SHIFT_Y);
    }
    this.shifted = next;
  }

  /** Where the overlay goes for the target: just past its line or inside its outline, in client coordinates. */
  private anchor(): Point | null {
    const target = this.target;
    if (!target || target.kind === 'refused') return null;
    const { stage } = this.host;
    const area = target.kind === 'into' ? target.outline : lineBox(target.line);
    this.reveal(toClient(stage, area));
    const box = toClient(stage, area);
    return target.kind === 'into' ? { x: box.left + 8, y: box.top + 8 } : { x: box.left + 4, y: box.top + 4 };
  }

  /** Scrolls the canvas so a box shows, with some room around it. */
  private reveal(box: { top: number; bottom: number }): void {
    if (this.scroller) revealInScroller(this.scroller, box);
  }

  /** Scrolls while the pointer rests near the canvas's top or bottom edge. */
  private scroll(client: Point): void {
    if (this.scroller && scrollNearEdge(this.scroller, client)) this.schedule();
  }
}
