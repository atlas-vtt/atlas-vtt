import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, AnimatePresence, motion, useIsPresent, useMotionValue, type Variants } from 'framer-motion';
import { EASE_CONTROL_POINTS, EASE_OUT_CONTROL_POINTS, prefersReducedMotion } from '../../../utils/motion';

/**
 * The palette's morph between its list and a settings page, and between pages. The surface
 * (background, border, shadow, corners) springs to the real size of the page it shows, never a
 * scale: a scaled surface stretches its corners, its border and its shadow. Each page is laid out
 * at its own size from its first frame and the surface only clips it, so nothing inside reflows
 * while the surface moves; the place above the toolbar moves on the same spring (`PALETTE_MORPH`).
 */
export const PALETTE_MORPH = { type: 'spring', duration: 0.42, bounce: 0.15 } as const;

/** Going into a page (1) or back to the list (-1). */
export type PaletteDepth = 1 | -1;

interface PageMotion {
  depth: PaletteDepth;
  /** The page changed before the palette was first painted (opened straight into a page): no morph. */
  instant: boolean;
}

// The pages cross in depth: going in, the list grows past the viewer as it fades and the page
// comes up from a little below its size; going back, the reverse. Fading out is quicker than
// fading in, and the new page waits a moment, so the two never read as one muddle.
const PAGE_RECEDE = 0.97;
const PAGE_PASS = 1.025;

const pageVariants: Variants = {
  enter: ({ depth, instant }: PageMotion) =>
    (instant ? { opacity: 1, scale: 1 } : { opacity: 0, scale: depth > 0 ? PAGE_RECEDE : PAGE_PASS }),
  shown: {
    opacity: 1,
    scale: 1,
    transition: { opacity: { duration: 0.2, delay: 0.06, ease: EASE_CONTROL_POINTS }, scale: PALETTE_MORPH },
  },
  leave: ({ depth, instant }: PageMotion) => ({
    opacity: 0,
    scale: depth > 0 ? PAGE_PASS : PAGE_RECEDE,
    transition: instant
      ? { duration: 0 }
      : { opacity: { duration: 0.12, ease: EASE_CONTROL_POINTS }, scale: { duration: 0.2, ease: EASE_OUT_CONTROL_POINTS } },
  }),
};

interface SurfaceContext {
  report: (page: HTMLElement) => void;
  /** Entering pages read it from here; a leaving page gets the current one from AnimatePresence. */
  motion: PageMotion;
}

const Surface = createContext<SurfaceContext>({ report: () => undefined, motion: { depth: 1, instant: true } });

interface PaletteSurfaceProps {
  depth: PaletteDepth;
  surfaceRef: React.Ref<HTMLDivElement>;
  /** The page shown: one `PalettePage` with a key of its own. */
  children: React.ReactElement;
}

/** The palette's visible surface: as large as the page it shows, springing between pages. */
export function PaletteSurface({ depth, surfaceRef, children }: PaletteSurfaceProps): React.ReactElement {
  const width = useMotionValue(0);
  const height = useMotionValue(0);
  const target = useRef<{ width: number; height: number } | null>(null);
  // Until the palette's first frame is painted, a page change is part of the opening, not a morph.
  const [painted, setPainted] = useState(false);
  const paintedRef = useRef(false);
  const ownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const win = ownRef.current?.ownerDocument.defaultView;
    if (!win) return;
    const frame = win.requestAnimationFrame(() => {
      paintedRef.current = true;
      setPainted(true);
    });
    return () => win.cancelAnimationFrame(frame);
  }, []);

  const report = useCallback((page: HTMLElement): void => {
    // Layout sizes: the page's own scale and the window's opening scale do not count.
    const next = { width: page.offsetWidth, height: page.offsetHeight };
    const last = target.current;
    if (last?.width === next.width && last.height === next.height) return;
    target.current = next;
    const jump = !last || !paintedRef.current || prefersReducedMotion(page);
    if (jump) {
      width.jump(next.width);
      height.jump(next.height);
    } else {
      animate(width, next.width, PALETTE_MORPH);
      animate(height, next.height, PALETTE_MORPH);
    }
  }, [width, height]);

  const setRefs = useCallback((node: HTMLDivElement | null): void => {
    ownRef.current = node;
    if (typeof surfaceRef === 'function') surfaceRef(node);
    else if (surfaceRef) surfaceRef.current = node;
  }, [surfaceRef]);

  const instant = !painted;
  const context = useMemo((): SurfaceContext => ({ report, motion: { depth, instant } }), [report, depth, instant]);
  return (
    <motion.div ref={setRefs} className="atlas-command-palette-surface" style={{ width, height }}>
      <Surface.Provider value={context}>
        <AnimatePresence initial={false} custom={context.motion}>
          {children}
        </AnimatePresence>
      </Surface.Provider>
    </motion.div>
  );
}

interface PalettePageProps {
  className: string;
  /** A width of its own; otherwise its stylesheet sizes it. */
  width?: number | undefined;
  children: React.ReactNode;
}

/**
 * One page of the palette, laid out at its own size inside the surface. A page that is leaving
 * is inert and hidden from assistive technology, and no longer sizes the surface.
 */
export function PalettePage({ className, width, children }: PalettePageProps): React.ReactElement {
  const { report, motion: pageMotion } = useContext(Surface);
  const present = useIsPresent();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const page = ref.current;
    if (!page || !present) return;
    report(page);
    const ResizeObserverClass = page.ownerDocument.defaultView?.ResizeObserver;
    if (!ResizeObserverClass) return;
    const observer = new ResizeObserverClass(() => report(page));
    observer.observe(page);
    return () => observer.disconnect();
  }, [present, report]);

  return (
    <motion.div
      ref={ref}
      className={className}
      {...(width === undefined ? {} : { style: { width } })}
      variants={pageVariants}
      custom={pageMotion}
      initial="enter"
      animate="shown"
      exit="leave"
      inert={!present}
      aria-hidden={!present || undefined}
    >
      {children}
    </motion.div>
  );
}
