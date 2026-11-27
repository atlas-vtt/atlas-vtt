/** A debounced function; `flush` runs a pending call immediately, `cancel` drops it. */
export interface DebouncedFunction<A extends unknown[]> {
  (...args: A): void;
  flush: () => void;
  cancel: () => void;
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 *
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns The debounced function
 */
export function debounce<A extends unknown[]>(
  func: (...args: A) => unknown,
  wait: number
): DebouncedFunction<A> {
  let timeout: number | undefined;
  let lastArgs: A | undefined;

  const invoke = (): void => {
    timeout = undefined;
    const args = lastArgs;
    // Drop the arguments once used: a debounced save would otherwise keep a whole map snapshot alive
    lastArgs = undefined;
    if (args) {
      func(...args);
    }
  };

  const debounced = (...args: A): void => {
    lastArgs = args;
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(invoke, wait);
  };

  debounced.flush = (): void => {
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      invoke();
    }
  };

  debounced.cancel = (): void => {
    window.clearTimeout(timeout);
    timeout = undefined;
    lastArgs = undefined;
  };

  return debounced;
}
