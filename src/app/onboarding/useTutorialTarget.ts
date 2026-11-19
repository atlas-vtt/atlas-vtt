import { useEffect, useState } from 'react';

/**
 * Where a tour step's target stands on screen, or null while it is absent, hidden or of no size.
 * Measured every frame, so the spotlight follows panels that slide in, bars that reflow and
 * elements that arrive late (online play's dock is added after the map).
 */
export function useTutorialTarget(selector: string | undefined, root?: ParentNode | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    let frame = 0;
    let last: DOMRect | null = null;
    const measure = (): void => {
      const target = selector ? (root ?? document).querySelector(selector) : null;
      const bounds = target?.getBoundingClientRect();
      const next = bounds && bounds.width && bounds.height ? bounds : null;
      if (!sameRect(last, next)) { last = next; setRect(next); }
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [selector, root]);
  return rect;
}

function sameRect(a: DOMRect | null, b: DOMRect | null): boolean {
  if (!a || !b) return a === b;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
