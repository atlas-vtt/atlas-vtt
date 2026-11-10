import React from 'react';
import type { Notice } from 'obsidian';
import type { RootOptions } from 'react-dom/client';
import { useAtlasStore } from '../ViewStoreContext';
import { showNotice } from '../../ui/notice';

interface BoundaryProps {
  /** The surface as the GM reads it, e.g. "the initiative tracker". */
  name: string;
  /** Whether a scene is loading; a failed surface is tried again when the load ends. */
  loading: boolean;
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };
  /** Whether the failure was reported since the last load began: the retry after a load would repeat it. */
  private reported = false;
  private notice: Notice | null = null;

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    if (this.reported) return;
    this.reported = true;
    console.error(`[Atlas VTT] Could not show ${this.props.name}:`, error, info.componentStack);
    // The notice stays until it is clicked; a surface that fails on every scene would stack one per load
    this.notice?.hide();
    this.notice = showNotice(`Atlas VTT could not show ${this.props.name}. The rest of the map keeps working.`, 0);
  }

  override componentDidUpdate(previous: BoundaryProps): void {
    if (!previous.loading && this.props.loading) this.reported = false;
    // Only now does the store hold the next scene completely; until then it mixes in the scene before
    if (this.state.failed && previous.loading && !this.props.loading) this.setState({ failed: false });
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Keeps an error in one surface of the map UI from unmounting the rest. React removes
 * the whole tree on an uncaught error, and with it the map image and every control.
 * The failed surface shows nothing, the GM is told which one, and it is tried again
 * after every scene load, since most failures come from what a scene holds.
 */
export const PanelBoundary: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  const loading = useAtlasStore((state) => state.isMapLoading);
  return <Boundary name={name} loading={loading}>{children}</Boundary>;
};

/** React logs every caught error itself; the boundaries log theirs with the surface's name, so the root does not. */
export const MAP_UI_ROOT_OPTIONS: RootOptions = { onCaughtError: () => undefined };
