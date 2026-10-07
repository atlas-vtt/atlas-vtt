/**
 * Every place an extension registers a listener refuses one the same way: a value that is not a function registers
 * nothing, gets a disposer that does nothing, and is logged once, naming the call. (`ui.*` registrations, which are
 * descriptions rather than listeners, throw instead.)
 */
export function acceptsListener(call: string, listener: unknown): boolean {
  if (typeof listener === 'function') return true;
  console.error(`[Atlas API] ${call}: the listener must be a function; nothing was registered.`);
  return false;
}
