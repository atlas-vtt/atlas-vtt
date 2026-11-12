import { useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { LogTab } from './LogTab.tsx';
import type { TableLogPanelProps } from './panelTypes.ts';
import { TableLogPanel } from './TableLogPanel.tsx';

/** The log as a host without a button for it shows it: the floating panel's props, whether it is open, and how the tab opens it. */
export interface LogSurfaceProps extends Omit<TableLogPanelProps, 'variant'> {
  readonly open: boolean;
  readonly onOpen: () => void;
}

/**
 * The floating panel while it is open; while it is closed, a tab that opens it and counts what came
 * in meanwhile, drawn in `tabHost`, which the host places where the tab stands. The tab stays while
 * nothing is unread: the log is always one press away.
 */
function LogSurface({ open, onOpen, tabHost, ...panel }: LogSurfaceProps & { readonly tabHost: HTMLElement }): ReactElement {
  const { unread } = useSyncExternalStore(panel.state.subscribe, panel.state.snapshot);
  if (open) return <TableLogPanel {...panel} variant="floating" />;
  return createPortal(<LogTab count={unread} onOpen={onOpen} />, tabHost);
}

/** A log surface standing in a host's element: `show` draws it with new props, `unmount` takes it away. */
export interface LogSurfaceMount {
  show(props: LogSurfaceProps): void;
  unmount(): void;
}

/**
 * Mounts the log's surface for a host that is not written in React (the GM's Obsidian): the panel
 * in `host`, its tab in `tabHost`.
 */
export function mountLogSurface(host: HTMLElement, tabHost: HTMLElement): LogSurfaceMount {
  const root = createRoot(host);
  return {
    show: (props) => root.render(<LogSurface {...props} tabHost={tabHost} />),
    unmount: () => root.unmount(),
  };
}
