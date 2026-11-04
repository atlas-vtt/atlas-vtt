/**
 * Picking a block up with the keyboard (§7.7: dnd-kit's Space-to-lift,
 * offered beside the menu and Alt+arrow moves). dnd-kit's own keyboard sensor
 * scrolls by the global window's height and listens where the editor's keys
 * act first; this one listens on the view's own document in the capture
 * phase, so a popout gets its keys and no other handler moves the selection
 * meanwhile, and leaves choosing and scrolling to the drag's controller,
 * which steps through the drop targets in reading order.
 */

import type React from 'react';
import type { Activators, SensorInstance, SensorProps } from '@dnd-kit/core';
import type { Point } from './dropGeometry';

/** What the sensor asks of the drag while a block is held. */
export interface KeyboardStepper {
  /** Moves to the next (1) or previous (-1) place; the overlay's new top-left in client coordinates, or null to stay. */
  step(direction: 1 | -1): Point | null;
}

export interface ViewKeyboardOptions {
  stepper: { current: KeyboardStepper | null };
}

const STEPS: Readonly<Record<string, 1 | -1>> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

function isSpace(event: { key: string; code: string }): boolean {
  return event.key === ' ' || event.code === 'Space';
}

/** Whether the keyboard event comes from a block frame of the canvas, where Enter edits the label. */
function onFrame(target: EventTarget | null): boolean {
  return typeof (target as Element | null)?.hasAttribute === 'function' && (target as Element).hasAttribute('data-block-id');
}

export class ViewKeyboardSensor implements SensorInstance {
  autoScrollEnabled = false;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly origin: Point;
  private timer = 0;

  constructor(private readonly props: SensorProps<ViewKeyboardOptions>) {
    const target = props.event.target as Node | null;
    this.doc = target?.ownerDocument ?? document;
    this.win = this.doc.defaultView ?? window;
    const rect = props.activeNode.node.current?.getBoundingClientRect();
    this.origin = { x: rect?.left ?? 0, y: rect?.top ?? 0 };
    props.onStart({ x: 0, y: 0 });
    this.win.addEventListener('resize', this.cancel);
    this.win.addEventListener('blur', this.cancel);
    // Not the press that lifted the block.
    this.timer = this.win.setTimeout(() => this.doc.addEventListener('keydown', this.onKeyDown, true));
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) return;
    event.stopPropagation();
    const step = STEPS[event.key];
    if (step !== undefined && !event.altKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const to = this.props.options.stepper.current?.step(step);
      if (to) this.props.onMove({ x: to.x - this.origin.x, y: to.y - this.origin.y });
    } else if (isSpace(event) || event.key === 'Enter') {
      event.preventDefault();
      this.detach();
      this.props.onEnd();
    } else if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      this.cancel();
    }
  };

  private readonly cancel = (): void => {
    this.detach();
    this.props.onCancel();
  };

  private detach(): void {
    this.win.clearTimeout(this.timer);
    this.doc.removeEventListener('keydown', this.onKeyDown, true);
    this.win.removeEventListener('resize', this.cancel);
    this.win.removeEventListener('blur', this.cancel);
  }

  /** Space on the focused block or its handle lifts it; Enter only on the handle (on a block, Enter edits its label). */
  static activators: Activators<ViewKeyboardOptions> = [{
    eventName: 'onKeyDown',
    handler: (event: React.KeyboardEvent, _options, { active }) => {
      const native = event.nativeEvent;
      const lifts = isSpace(native) || (native.key === 'Enter' && !onFrame(event.target));
      if (!lifts || native.repeat || native.altKey || native.metaKey || native.ctrlKey || native.shiftKey) return false;
      const activator = active.activatorNode.current;
      if (activator && event.target !== activator) return false;
      event.preventDefault();
      return true;
    },
  }];
}
