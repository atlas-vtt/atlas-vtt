import '../setup/obsidianDom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { motion } from 'framer-motion';
import type { Notice } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateNotice } from '../../src/app/ui/noticeMotion';

const h = React.createElement;

interface FaderProps {
  id: string;
  dim: boolean;
}

/** One element whose opacity the browser animates natively, as most of Atlas' panels and bars do. */
const Fader: React.FC<FaderProps> = ({ id, dim }) => h(motion.div, {
  id,
  initial: false,
  animate: { opacity: dim ? 0.25 : 1 },
  transition: { duration: 0.05, ease: 'linear' },
  style: { width: 20, height: 20 },
});

const opacityOf = (id: string): number => Number(getComputedStyle(document.getElementById(id)!).opacity);

async function frames(count: number): Promise<void> {
  for (let i = 0; i < count; i++) await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
}

/** A window beside this one, as a popout is; `close` takes it away with its document. */
function otherWindow(): { doc: Document; close: () => void } {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return { doc: frame.contentDocument!, close: () => frame.remove() };
}

/**
 * An element made in this window that sits in the document of a window that is gone (a notice
 * Obsidian showed in a popout, a view it moved there) can no longer be animated by the browser:
 * Chromium's `element.animate()` answers null for it. Motion took that for an animation, threw
 * while it resolved its keyframes, and kept the failed entry in the list it resolves on every
 * later frame and render: one such element ended every animation of the plugin, and the toolbar
 * and the tool bars with them ("Cannot set properties of null (setting 'startTime')").
 */
describe('an animation on an element whose window is gone', () => {
  let roots: Root[] = [];
  let hosts: HTMLElement[] = [];
  let errors: unknown[] = [];
  const onError = (event: ErrorEvent): void => { errors.push(event.error); };
  const onRejection = (event: PromiseRejectionEvent): void => { errors.push(event.reason); };

  const mount = async (element: React.ReactElement): Promise<{ root: Root; host: HTMLElement }> => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host, { onCaughtError: (error) => { errors.push(error); }, onUncaughtError: (error) => { errors.push(error); } });
    roots.push(root);
    hosts.push(host);
    await act(async () => { root.render(element); });
    return { root, host };
  };

  /** A fader in this window that fades out and in again: the frame loop runs, keyframes resolve, animations end. */
  const animatesHere = async (id: string): Promise<void> => {
    const { root } = await mount(h(Fader, { id, dim: false }));
    await act(async () => { root.render(h(Fader, { id, dim: true })); });
    await vi.waitFor(() => expect(opacityOf(id)).toBeCloseTo(0.25, 2));
    await act(async () => { root.render(h(Fader, { id, dim: false })); });
    await vi.waitFor(() => expect(opacityOf(id)).toBe(1));
  };

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    errors = [];
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
  });

  afterEach(async () => {
    await act(async () => { for (const root of roots) root.unmount(); });
    for (const host of hosts) host.remove();
    roots = [];
    hosts = [];
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    document.body.replaceChildren();
  });

  /** Mounts a fader here, moves it into another window as Obsidian moves a view into a popout, and closes that window. */
  const strand = async (id: string): Promise<{ root: Root; element: HTMLElement }> => {
    const other = otherWindow();
    const { root, host } = await mount(h(Fader, { id, dim: false }));
    const element = host.firstElementChild as HTMLElement;
    other.doc.body.append(host);
    other.close();
    return { root, element };
  };

  it('is an element of this window that the browser no longer animates', async () => {
    const { element } = await strand('stranded');
    expect(element instanceof HTMLElement).toBe(true);
    expect(element.ownerDocument).not.toBe(document);
    expect(element.ownerDocument.defaultView).toBeNull();
    expect(element.animate([{ opacity: 1 }, { opacity: 0 }], 50)).toBeNull();
  });

  it('throws nothing', async () => {
    const { root } = await strand('stranded');
    await act(async () => { root.render(h(Fader, { id: 'stranded', dim: true })); });
    await frames(3);
    expect(errors).toEqual([]);
  });

  it('leaves every other animation of the plugin working', async () => {
    const { root } = await strand('stranded');
    await act(async () => { root.render(h(Fader, { id: 'stranded', dim: true })); });
    await frames(3);

    await animatesHere('other');
    expect(errors).toEqual([]);
  });

  /** A notice as Obsidian makes it: its element made in this window, shown in the window that is active. */
  const noticeIn = (doc: Document): { notice: Notice; el: HTMLElement } => {
    const container = document.createElement('div');
    container.className = 'notice-container';
    const el = container.createDiv({ cls: 'notice atlas-notice', text: 'Atlas runs in the main window' });
    doc.body.append(container);
    return { notice: { containerEl: el, hide: (): void => undefined } as unknown as Notice, el };
  };

  it('is what a notice was that showed in a popout the same task closed, as a map folded back from a new window did', async () => {
    const popout = otherWindow();
    const { notice } = noticeIn(popout.doc);
    animateNotice(notice);
    // The popout's last leaf goes, and the window with it, before the notice's first frame
    popout.close();
    await frames(3);

    await animatesHere('toolbar');
    expect(errors).toEqual([]);
  });

  it('takes a notice away at once that is hidden after its window has closed', async () => {
    const popout = otherWindow();
    const { notice, el } = noticeIn(popout.doc);
    animateNotice(notice);
    await frames(3);
    popout.close();

    notice.hide();

    expect(el.parentElement).toBeNull();
    await frames(3);
    await animatesHere('toolbar');
    expect(errors).toEqual([]);
  });
});
