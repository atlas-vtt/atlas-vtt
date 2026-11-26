/** What tells which click a press is: a DOM pointer or mouse event, or a PIXI federated one. */
export interface PressButtons {
  readonly button: number;
  readonly ctrlKey: boolean;
}

let ctrlClickIsSecondary = false;

/**
 * macOS sends a Ctrl+click as a press of the primary button with Ctrl held, followed by `contextmenu`: it is that
 * system's secondary click for a trackpad or a mouse with one button. Elsewhere Ctrl is a modifier of the primary click.
 * The application says once whether it runs on macOS; returns a function that restores the previous answer.
 */
export function setCtrlClickIsSecondary(on: boolean): () => void {
  const previous = ctrlClickIsSecondary;
  ctrlClickIsSecondary = on;
  return () => { ctrlClickIsSecondary = previous; };
}

/** A secondary click made with the primary button. Unlike the right button's it cannot pan, so nothing waits for its release. */
export function isCtrlClick(event: PressButtons, mac: boolean = ctrlClickIsSecondary): boolean {
  return mac && event.button === 0 && event.ctrlKey;
}

/** Whether a press asks for a context menu: the right button, or a Ctrl+click on macOS. */
export function isSecondaryPress(event: PressButtons, mac: boolean = ctrlClickIsSecondary): boolean {
  return event.button === 2 || isCtrlClick(event, mac);
}

/** Whether a press may start a tool's gesture, a drag or a selection: the primary button, unless it is a Ctrl+click on macOS. */
export function isPrimaryPress(event: PressButtons, mac: boolean = ctrlClickIsSecondary): boolean {
  return event.button === 0 && !isCtrlClick(event, mac);
}
