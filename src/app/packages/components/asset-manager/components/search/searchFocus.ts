/** Search fields focused as the window opened, which the user has not used since: no key, no press, no leaving. */
const untouched = new WeakSet<HTMLInputElement>();

/**
 * Focuses the search as the asset manager opens (decision #38), as Spotlight and Raycast do: typing filters at once,
 * while its suggestions wait for the first key or press, and a query kept from the last visit is selected so typing
 * replaces it. Until the field is used (`touchSearch`), one Escape closes the window and the arrows go to the grid.
 */
export function focusSearchUntouched(input: HTMLInputElement): void {
  untouched.add(input);
  input.focus({ preventScroll: true });
  if (input.value !== '') input.select();
}

/** Whether `input` was focused by the window's opening and not used since. */
export function isSearchUntouched(input: EventTarget | null): boolean {
  return untouched.has(input as HTMLInputElement);
}

/** The field was used (a key, a press, focus left it): its keys are its own again. */
export function touchSearch(input: EventTarget | null): void {
  untouched.delete(input as HTMLInputElement);
}
