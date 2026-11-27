import { useEffect, useState } from 'react';
import { ARM_MS } from '../../gm/armedCards.ts';

/**
 * Whether a control takes a press yet. It does not for `ARM_MS` after `layout` last changed, nor from
 * the first draw unless `armedAtFirst`: a control that appeared or moved may stand under a pointer, or
 * the second press of a double-click, meant for what stood there before, and that press does nothing.
 */
export function useArmed(layout: string, armedAtFirst: boolean): boolean {
  const [armed, setArmed] = useState<string | null>(armedAtFirst ? layout : null);
  useEffect(() => {
    if (armed === layout) return undefined;
    const timer = window.setTimeout(() => setArmed(layout), ARM_MS);
    return () => window.clearTimeout(timer);
  }, [layout, armed]);
  return armed === layout;
}
