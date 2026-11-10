import { useLayoutEffect, type RefObject } from 'react';

/** The custom property the composer's stylesheet takes the field's height from. */
const FIELD_HEIGHT = '--atlas-online-log-input-height';

/** Makes a text field as tall as its text; its stylesheet caps the height, and it scrolls from there. */
export function useGrowingField(field: RefObject<HTMLTextAreaElement | null>, text: string): void {
  useLayoutEffect(() => {
    const element = field.current;
    if (element === null) return;
    // Back to one line first, where the scroll height is the text's own.
    element.style.removeProperty(FIELD_HEIGHT);
    element.style.setProperty(FIELD_HEIGHT, `${element.scrollHeight}px`);
  }, [field, text]);
}

/** Whether a key press belongs to a text being composed (an input method's candidate window), not to the field. */
export function isComposing(event: { readonly nativeEvent: KeyboardEvent }): boolean {
  // Safari sends the Enter that ends a composition with `isComposing` false and this key code. The
  // event's own field for it is deprecated and has no successor, so it is read by name.
  const keyCode: unknown = Reflect.get(event.nativeEvent, 'keyCode');
  return event.nativeEvent.isComposing || keyCode === 229;
}
