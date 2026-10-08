import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ASSET_MANAGER_OPEN_CLASS, useOverlayBodyClass } from '../../src/app/packages/components/asset-manager/hooks/useOverlayBodyClass';

let seen: HTMLDivElement | null = null;

/** The asset manager's overlay as `AssetManager` mounts it: a motion element inside `AnimatePresence`. */
function Overlay({ isOpen }: { isOpen: boolean }): React.JSX.Element {
  const overlay = useRef<HTMLDivElement>(null);
  const ref = useOverlayBodyClass(overlay);
  seen = overlay.current;
  return (
    <AnimatePresence>
      {isOpen && <motion.div key="overlay" ref={ref} className="atlas-asset-manager-modal" exit={{ opacity: 0, transition: { duration: 0 } }} />}
    </AnimatePresence>
  );
}

describe('the body class that lifts Obsidian menus above the asset manager', () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    host = document.body.appendChild(document.createElement('div'));
    root = createRoot(host);
  });

  afterEach(() => {
    flushSync(() => root.unmount());
    host.remove();
  });

  it('is on the body exactly while the overlay is in the document', async () => {
    expect(document.body.classList.contains(ASSET_MANAGER_OPEN_CLASS)).toBe(false);

    flushSync(() => root.render(<Overlay isOpen />));
    expect(document.body.classList.contains(ASSET_MANAGER_OPEN_CLASS)).toBe(true);

    flushSync(() => root.render(<Overlay isOpen={false} />));
    await expect.poll(() => host.querySelector('.atlas-asset-manager-modal')).toBeNull();
    expect(document.body.classList.contains(ASSET_MANAGER_OPEN_CLASS)).toBe(false);
  });

  it('goes with an overlay that is unmounted while open', () => {
    flushSync(() => root.render(<Overlay isOpen />));
    flushSync(() => root.render(<div />));
    expect(document.body.classList.contains(ASSET_MANAGER_OPEN_CLASS)).toBe(false);
  });

  it('still hands the overlay element to the ref the asset manager reads', () => {
    flushSync(() => root.render(<Overlay isOpen />));
    flushSync(() => root.render(<Overlay isOpen />));
    expect(seen).toBe(host.querySelector('.atlas-asset-manager-modal'));
  });
});
