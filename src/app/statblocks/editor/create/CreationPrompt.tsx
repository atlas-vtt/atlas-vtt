import React from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence } from 'framer-motion';
import { NewStatblockPopover } from './NewStatblockPopover';

/** The name step alone, for a template chosen in the modal (§12.2): resolves with the name, or null. */
export function promptStatblockName(doc: Document, at: { x: number; y: number }, templateName: string): Promise<string | null> {
  const previous = doc.activeElement;
  const container = doc.body.createDiv({ cls: ['atlas-vtt-plugin', 'atlas-sb-create-host'] });
  const root = createRoot(container);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (name: string | null): void => {
      if (settled) return;
      settled = true;
      if (name === null && previous?.instanceOf(HTMLElement) && previous.isConnected) previous.focus({ preventScroll: true });
      resolve(name);
      render(false);
    };
    const gone = (): void => queueMicrotask(() => {
      root.unmount();
      container.remove();
    });
    const render = (shown: boolean): void => {
      root.render(
        <AnimatePresence onExitComplete={gone}>
          {shown && (
            <div key="name" className="atlas-sb-create-spot" style={{ left: at.x, top: at.y }}>
              <NewStatblockPopover roleName={templateName} onCreate={(name) => finish(name)} onCancel={() => finish(null)} />
            </div>
          )}
        </AnimatePresence>,
      );
    };
    render(true);
  });
}
