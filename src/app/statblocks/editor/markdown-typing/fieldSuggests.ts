/** A suggestion list on a field: closed when the panel stops watching. */
interface FieldSuggest {
  close(): void;
}

/**
 * A suggest for every field of `host` that `fieldOf` names: each gets its own the first time it
 * takes focus. Returns the stop, which closes a list still open.
 */
export function watchFieldSuggests(host: HTMLElement, fieldOf: (target: EventTarget | null) => HTMLElement | null, make: (field: HTMLElement) => FieldSuggest): () => void {
  const suggests = new WeakMap<HTMLElement, FieldSuggest>();
  let current: FieldSuggest | null = null;
  const onFocusIn = (event: FocusEvent): void => {
    const field = fieldOf(event.target);
    if (!field) return;
    current = suggests.get(field) ?? make(field);
    suggests.set(field, current);
  };
  host.addEventListener('focusin', onFocusIn);
  return () => {
    host.removeEventListener('focusin', onFocusIn);
    current?.close();
    current = null;
  };
}
