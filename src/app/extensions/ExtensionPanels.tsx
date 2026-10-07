import React, { useEffect, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from 'zustand';
import { useAtlasUI } from '../react/root/AtlasUIContext';
import { useAtlasStore, useViewStoreHook } from '../react/ViewStoreContext';
import { ExtensionPanelFrame } from './ExtensionPanelFrame';
import { closePanel, closeViewPanels, panelState } from './panelState';
import { panelSlot } from './slots';
import { useSlot } from './useSlot';
import { viewContextOf } from './viewContext';

/** Unique keys for the open panels: the registered objects themselves, numbered as first met. */
const keys = new WeakMap<object, number>();
let nextKey = 0;
function keyOf(panel: object): number {
  let key = keys.get(panel);
  if (key === undefined) {
    key = nextKey++;
    keys.set(panel, key);
  }
  return key;
}

/** The extension panels open in this map view, floating at its top right; the GM's view only. */
export function ExtensionPanels(): React.ReactElement | null {
  const { view } = useAtlasUI();
  const store = useViewStoreHook();
  const isPlayerView = useAtlasStore((state) => state.isPlayerView);
  const registered = useSlot(panelSlot);
  const open = useStore(panelState, (state) => state.open);
  const viewId = view?.viewId;

  // The view closes: its panels close with it, and their disposers run as the frames unmount.
  useEffect(() => () => { if (viewId) closeViewPanels(viewId); }, [viewId]);

  const ctx = useMemo(() => (viewId ? viewContextOf({ viewId }, store) : null), [viewId, store]);
  // Nothing registered: nothing in the view's tree, so Atlas draws exactly what it does without extensions.
  if (!ctx || isPlayerView || registered.length === 0) return null;
  const shown = open.flatMap((entry) => {
    const owner = registered.find((candidate) => candidate.item === entry.panel)?.owner;
    return entry.viewId === ctx.viewId && owner !== undefined ? [{ owner, panel: entry.panel }] : [];
  });

  return (
    <div className="atlas-extension-panels">
      <AnimatePresence>
        {shown.map(({ owner, panel }) => (
          <ExtensionPanelFrame
            key={keyOf(panel)}
            owner={owner}
            panel={panel}
            ctx={ctx}
            onClose={() => closePanel(panel, ctx.viewId)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
