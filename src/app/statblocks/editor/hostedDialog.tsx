/**
 * Dialogs of the statblock editor that belong to no React tree of their own
 * (the template gallery from a command, the layout import report, the
 * question a template editor closed with unsaved changes asks): each is a
 * React root on its document's body that leaves with its exit motion. A
 * window that closes takes its dialogs with it and Atlas unloading takes them
 * all (`registerHostedDialogRelease`), so none stays on screen or keeps its
 * subscriptions, and a closed window's document, alive.
 */

import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'framer-motion';
import type { Plugin } from 'obsidian';

interface HostedRoot {
  doc: Document;
  remove: () => void;
}

const hosted = new Set<HostedRoot>();

/** The dialog, given what closes it; it needs a `key` for its exit motion. */
export type HostedDialogRender = (close: () => void) => React.ReactElement;

/** The dialog and its way out: it leaves with its exit motion, then the host goes. */
function DialogHost({ render, onGone }: { render: HostedDialogRender; onGone: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return <AnimatePresence onExitComplete={onGone}>{open && render(() => setOpen(false))}</AnimatePresence>;
}

/** Shows a dialog in `doc` inside a container of class `cls`; focus goes back where it was once it has left. */
export function showHostedDialog(doc: Document, cls: string, render: HostedDialogRender): void {
  const previous = doc.activeElement;
  const container = doc.body.createDiv({ cls });
  const root = createRoot(container);
  const entry: HostedRoot = {
    doc,
    remove: () => {
      if (!hosted.delete(entry)) return;
      root.unmount();
      container.remove();
    },
  };
  hosted.add(entry);
  const onGone = (): void => {
    // Never inside React's own commit.
    queueMicrotask(() => {
      entry.remove();
      if (previous?.instanceOf(HTMLElement) && previous.isConnected) previous.focus({ preventScroll: true });
    });
  };
  root.render(<DialogHost render={render} onGone={onGone} />);
}

/** Removes the hosted dialogs of `doc` at once, without their exit motion; every one without a document. */
export function removeHostedDialogs(doc?: Document): void {
  for (const entry of [...hosted]) {
    if (!doc || entry.doc === doc) entry.remove();
  }
}

/** A closing window takes its hosted dialogs with it, and Atlas unloading takes them all. */
export function registerHostedDialogRelease(plugin: Plugin): void {
  plugin.registerEvent(plugin.app.workspace.on('window-close', (_workspaceWindow, win) => removeHostedDialogs(win.document)));
  plugin.register(() => removeHostedDialogs());
}
