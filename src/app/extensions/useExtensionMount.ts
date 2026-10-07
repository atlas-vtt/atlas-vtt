import { useEffect, useRef, type RefObject } from 'react';
import { safely } from './SlotRegistry';

/** What an extension renders into an element Atlas gives it: called with the element and a context, it returns its teardown. */
export interface ExtensionMountable<C> {
  mount(container: HTMLElement, ctx: C): unknown;
}

interface MountOptions<C> {
  /** The extension, named in what is logged. */
  owner: string;
  /** What is mounted, named in what is logged, e.g. `panel "dice"`. */
  what: string;
  /** The extension's item (a panel, a tab); mounted again when it is another object. */
  spec: ExtensionMountable<C>;
  ctx: C;
  /** Mounts again (teardown first) when this changes; the context is read only when it mounts. */
  remountKey: string;
  /** False holds the mount back (and tears a mounted one down). */
  active?: boolean;
  /** The mount threw: nothing is mounted. */
  onFailed?: () => void;
  /** Keys pressed inside stay there, all but Escape, so the dialog's own shortcuts never act behind the extension's controls. */
  keepKeys?: boolean;
}

/**
 * Mounts an extension's UI into the element of the returned ref, guarded: a mount that throws is logged and
 * reported, a teardown that throws is logged, and the element is emptied after each teardown. The teardown runs
 * on unmount, when `remountKey` changes and when `active` turns false.
 */
export function useExtensionMount<C>({ owner, what, spec, ctx, remountKey, active = true, onFailed, keepKeys = false }: MountOptions<C>): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const latest = useRef({ ctx, onFailed });
  latest.current = { ctx, onFailed };

  useEffect(() => {
    const container = ref.current;
    if (!container || !active) return undefined;
    let disposer: (() => void) | null = null;
    try {
      const result: unknown = spec.mount(container, latest.current.ctx);
      disposer = typeof result === 'function' ? (result as () => void) : null;
    } catch (error) {
      console.error(`[Atlas API] ${owner}: ${what} mount failed:`, error);
      container.replaceChildren();
      latest.current.onFailed?.();
      return undefined;
    }
    return () => {
      const dispose = disposer;
      if (dispose) safely(owner, `${what} disposer`, () => { dispose(); }, undefined);
      container.replaceChildren();
    };
  }, [spec, owner, what, remountKey, active]);

  useEffect(() => {
    const element = ref.current;
    if (!element || !keepKeys) return undefined;
    const keep = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') event.stopPropagation();
    };
    element.addEventListener('keydown', keep);
    return () => element.removeEventListener('keydown', keep);
  }, [keepKeys]);

  return ref;
}
