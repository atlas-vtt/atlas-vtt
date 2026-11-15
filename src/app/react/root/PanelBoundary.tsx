import React from 'react';
import type { Notice } from 'obsidian';
import type { RootOptions } from 'react-dom/client';
import { useAtlasStore } from '../ViewStoreContext';
import { showNotice } from '../../ui/notice';

/** How long a failed surface waits before it is tried again by itself: once per entry, then it stays out. */
export const PANEL_RETRY_DELAYS_MS: readonly number[] = [300, 1000, 3000];
/** A surface that has shown this long since it came back is over its failure: its notice goes, and the next failure is tried afresh. */
export const PANEL_SETTLED_MS = 3000;

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
  /** Tries made by itself since the surface last held; every failure allows one, so they cannot spin. */
  private retries = 0;
  /** Whether this run of failures was logged: its retries would repeat the same error. */
  private logged = false;
  /** Whether the GM was told since the last load began or the surface last held. */
  private told = false;
  private notice: Notice | null = null;
  private retryTimer: number | null = null;
  private settleTimer: number | null = null;

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    this.stopTimer('settleTimer');
    if (!this.logged) {
      this.logged = true;
      console.error(`[Atlas VTT] Could not show ${this.props.name}:`, error, info.componentStack);
    }
    // A surface that is back at its first try was never missed; one that is not, is
    if (this.retries > 0) this.tell();
    // During a load the store mixes two scenes: the end of the load tries again
    if (this.props.loading || this.retries >= PANEL_RETRY_DELAYS_MS.length) return;
    this.stopTimer('retryTimer');
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = null;
      this.retries += 1;
      this.setState({ failed: false });
    }, PANEL_RETRY_DELAYS_MS[this.retries]);
  }

  override componentDidUpdate(previous: BoundaryProps, previousState: BoundaryState): void {
    if (!previous.loading && this.props.loading) {
      this.stopTimer('retryTimer');
      this.startAfresh();
    }
    // Only now does the store hold the next scene completely; until then it mixes in the scene before
    if (this.state.failed && previous.loading && !this.props.loading) {
      this.stopTimer('retryTimer');
      this.setState({ failed: false });
    }
    if (previousState.failed && !this.state.failed) this.shownAgain();
  }

  override componentWillUnmount(): void {
    this.stopTimer('retryTimer');
    this.stopTimer('settleTimer');
  }

  override render(): React.ReactNode {
    return this.state.failed ? null : this.props.children;
  }

  /** The notice stays until it is clicked; a surface that fails on every scene would stack one per load. */
  private tell(): void {
    if (this.told) return;
    this.told = true;
    this.notice?.hide();
    this.notice = showNotice(`Atlas VTT could not show ${this.props.name}. The rest of the map keeps working.`, 0);
  }

  /** The surface rendered again; once it has held a while its failure is over, and what was said of it no longer holds. */
  private shownAgain(): void {
    this.stopTimer('settleTimer');
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      this.notice?.hide();
      this.notice = null;
      this.startAfresh();
    }, PANEL_SETTLED_MS);
  }

  /** The next failure is a new one: logged, tried again by itself and told. */
  private startAfresh(): void {
    this.retries = 0;
    this.logged = false;
    this.told = false;
  }

  private stopTimer(timer: 'retryTimer' | 'settleTimer'): void {
    const id = this[timer];
    if (id === null) return;
    window.clearTimeout(id);
    this[timer] = null;
  }
}

/**
 * Keeps an error in one surface of the map UI from unmounting the rest. React removes
 * the whole tree on an uncaught error, and with it the map image and every control.
 * The failed surface shows nothing and is tried again by itself a few times, since a
 * failure need not come from the scene (an animation that could not start took the
 * toolbar away for good); one that still fails stays out, the GM is told which one,
 * and it is tried again after every scene load, since most failures come from what a
 * scene holds.
 */
export const PanelBoundary: React.FC<{ name: string; children: React.ReactNode }> = ({ name, children }) => {
  const loading = useAtlasStore((state) => state.isMapLoading);
  return <Boundary name={name} loading={loading}>{children}</Boundary>;
};

/** React logs every caught error itself; the boundaries log theirs with the surface's name, so the root does not. */
export const MAP_UI_ROOT_OPTIONS: RootOptions = { onCaughtError: () => undefined };
