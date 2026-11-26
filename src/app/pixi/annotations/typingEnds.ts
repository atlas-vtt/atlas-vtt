/** The browser's presses that ended the typing of a text (`TypingWatch`). */
const enders = new WeakSet<object>();

/** Notes that `press` ended the typing of a text. */
export function markEndedTyping(press: object): void {
  enders.add(press);
}

/**
 * Whether `press` ended the typing of a text. Such a press starts no next text: whoever clicks
 * beside a text they typed wants to be out of its field, not in a new one.
 */
export function endedTyping(press: object | null | undefined): boolean {
  return press !== null && press !== undefined && enders.has(press);
}
