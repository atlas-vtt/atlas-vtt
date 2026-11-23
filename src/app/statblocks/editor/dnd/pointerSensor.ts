import { PointerSensor, type PointerSensorProps } from '@dnd-kit/core';
import { POINTER_ACTIVATION, TOUCH_ACTIVATION } from './dndConfig';

const isTouch = (event: Event | undefined): boolean => (event as Partial<PointerEvent> | undefined)?.pointerType === 'touch';

/**
 * dnd-kit's pointer sensor with a rule per kind of pointer: a mouse or a pen drags after a few
 * pixels, a finger after resting on the handle, so a swipe that starts on it is no drag. One
 * sensor decides both: dnd-kit keeps one listener per event name, so a second sensor on
 * `pointerdown` would replace the first. The handles carry `touch-action: none`, as the pointer
 * sensor needs for a finger's moves to reach it.
 */
export class PressPointerSensor extends PointerSensor {
  constructor(props: PointerSensorProps) {
    super({ ...props, options: { ...props.options, ...(isTouch(props.event) ? TOUCH_ACTIVATION : POINTER_ACTIVATION) } });
  }
}
