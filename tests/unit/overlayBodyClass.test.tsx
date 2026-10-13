import React, { useRef } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AnimatePresence, motion } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ASSET_MANAGER_OPEN_CLASS, releaseOverlayBodyClass, useOverlayBodyClass,
} from '../../src/app/packages/components/asset-manager/hooks/useOverlayBodyClass';

/** Long enough for a test to act while the overlay is still closing. */
const EXIT_SECONDS = 0.2;

interface OverlayProps {
  isOpen: boolean;
  seen?: (element: HTMLDivElement | null) => void;
  broken?: boolean;
}

function Broken(): React.JSX.Element {
  throw new Error('a render inside the overlay failed');
}

/** The asset manager's overlay as `AssetManager` mounts it: a motion element inside `AnimatePresence`. */
function Overlay({ isOpen, seen, broken = false }: OverlayProps): React.JSX.Element {
  const overlay = useRef<HTMLDivElement>(null);
  const ref = useOverlayBodyClass(overlay);
  seen?.(overlay.current);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div key="overlay" ref={ref} className="atlas-asset-manager-modal" exit={{ opacity: 0, transition: { duration: EXIT_SECONDS } }}>
          {broken && <Broken />}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

const marked = (body: HTMLElement = document.body): boolean => body.classList.contains(ASSET_MANAGER_OPEN_CLASS);

describe('the body class that lifts Obsidian menus above the asset manager', () => {
  const mounted: { root: Root; host: HTMLElement }[] = [];

  /** A root of its own, as every opening of the global asset manager has. */
  function mount(body: HTMLElement = document.body): { root: Root; host: HTMLElement } {
    const host = body.appendChild(body.ownerDocument.createElement('div'));
    const entry = { root: createRoot(host), host };
    mounted.push(entry);
    return entry;
  }

  const overlays = (body: HTMLElement = document.body): number => body.querySelectorAll('.atlas-asset-manager-modal').length;

  beforeEach(() => expect(marked()).toBe(false));

  afterEach(() => {
    for (const { root, host } of mounted.splice(0)) {
      flushSync(() => root.unmount());
      host.remove();
    }
    releaseOverlayBodyClass();
    vi.restoreAllMocks();
  });

  it('is on the body exactly while the overlay is in the document, its closing animation included', async () => {
    const { root } = mount();
    flushSync(() => root.render(<Overlay isOpen />));
    expect(marked()).toBe(true);

    flushSync(() => root.render(<Overlay isOpen={false} />));
    expect(overlays()).toBe(1);
    expect(marked()).toBe(true);

    await expect.poll(overlays).toBe(0);
    expect(marked()).toBe(false);
  });

  it('stays when the asset manager is opened again while open: the old overlay leaves after the new one came', async () => {
    const old = mount();
    flushSync(() => old.root.render(<Overlay isOpen />));
    flushSync(() => old.root.render(<Overlay isOpen={false} />));
    const reopened = mount();
    flushSync(() => reopened.root.render(<Overlay isOpen />));
    expect(overlays()).toBe(2);

    await expect.poll(overlays).toBe(1);
    expect(marked()).toBe(true);

    flushSync(() => reopened.root.unmount());
    expect(marked()).toBe(false);
  });

  it('stays while one of two overlays is unmounted, and goes with the last', () => {
    const [first, second] = [mount(), mount()];
    flushSync(() => first.root.render(<Overlay isOpen />));
    flushSync(() => second.root.render(<Overlay isOpen />));

    flushSync(() => first.root.unmount());
    expect(marked()).toBe(true);

    flushSync(() => second.root.unmount());
    expect(marked()).toBe(false);
  });

  it('is counted per document: a popout has a body of its own', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const [main, other] = [mount(), mount(popout.body)];
    flushSync(() => main.root.render(<Overlay isOpen />));
    flushSync(() => other.root.render(<Overlay isOpen />));
    expect([marked(), marked(popout.body)]).toEqual([true, true]);

    flushSync(() => main.root.unmount());
    expect([marked(), marked(popout.body)]).toEqual([false, true]);

    flushSync(() => other.root.unmount());
    expect(marked(popout.body)).toBe(false);
  });

  it('goes with an overlay that is unmounted while it is closing', () => {
    const { root } = mount();
    flushSync(() => root.render(<Overlay isOpen />));
    flushSync(() => root.render(<Overlay isOpen={false} />));
    expect(overlays()).toBe(1);

    flushSync(() => root.unmount());
    expect(marked()).toBe(false);
  });

  it('goes when a render inside the open overlay fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { root } = mount();
    flushSync(() => root.render(<Boundary><Overlay isOpen /></Boundary>));
    expect(marked()).toBe(true);

    flushSync(() => root.render(<Boundary><Overlay isOpen broken /></Boundary>));
    expect(overlays()).toBe(0);
    expect(marked()).toBe(false);
  });

  it('is taken off every body when the plugin unloads, whatever is still closing', () => {
    const popout = document.implementation.createHTMLDocument('popout');
    const [main, other] = [mount(), mount(popout.body)];
    flushSync(() => main.root.render(<Overlay isOpen />));
    flushSync(() => other.root.render(<Overlay isOpen />));
    flushSync(() => main.root.render(<Overlay isOpen={false} />));

    releaseOverlayBodyClass();
    expect([marked(), marked(popout.body)]).toEqual([false, false]);

    // The overlays of the unloaded plugin leave later, and must not take the class of a plugin loaded since.
    document.body.classList.add(ASSET_MANAGER_OPEN_CLASS);
    flushSync(() => main.root.unmount());
    flushSync(() => other.root.unmount());
    expect(marked()).toBe(true);
    document.body.classList.remove(ASSET_MANAGER_OPEN_CLASS);
  });

  it('still hands the overlay element to the ref the asset manager reads', () => {
    let seen: HTMLDivElement | null = null;
    const see = (element: HTMLDivElement | null): void => { seen = element; };
    const { root, host } = mount();
    flushSync(() => root.render(<Overlay isOpen seen={see} />));
    flushSync(() => root.render(<Overlay isOpen seen={see} />));
    expect(seen).toBe(host.querySelector('.atlas-asset-manager-modal'));
  });
});
