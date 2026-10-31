import { useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LogUnreadTab } from './LogUnreadTab.tsx';
import type { TableLogPanelProps } from './panelTypes.ts';
import { TableLogPanel } from './TableLogPanel.tsx';

/** The log as a host without a button for it shows it: the floating panel's props, whether it is open, and how the tab opens it. */
export interface LogSurfaceProps extends Omit<TableLogPanelProps, 'variant'> {
  readonly open: boolean;
  readonly onOpen: () => void;
}

/**
 * The floating panel while it is open; while it is closed, a tab that counts what came in meanwhile
 * and opens it, drawn in `tabHost`, which the host places where the tab stands.
 */
function LogSurface({ open, onOpen, tabHost, ...panel }: LogSurfaceProps & { readonly tabHost: HTMLElement }): ReactElement | null {
  const { unread } = useSyncExternalStore(panel.state.subscribe, panel.state.snapshot);
  if (open) return <TableLogPanel {...panel} variant="floating" />;
  return unread > 0 ? createPortal(<LogUnreadTab count={unread} onOpen={onOpen} />, tabHost) : null;
}

/** A log surface standing in a host's element: `show` draws it with new props, `unmount` takes it away. */
export interface LogSurfaceMount {
  show(props: LogSurfaceProps): void;
  unmount(): void;
}

/**
 * Mounts the log's surface for a host that is not written in React (the GM's Obsidian): the panel
 * in `host`, the unread tab in `tabHost`.
 */
export function mountLogSurface(host: HTMLElement, tabHost: HTMLElement): LogSurfaceMount {
  const root = createRoot(host);
  return {
    show: (props) => root.render(<LogSurface {...props} tabHost={tabHost} />),
    unmount: () => root.unmount(),
  };
}
