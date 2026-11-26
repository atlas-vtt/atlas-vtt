import type { GmMessage, TableModeMessage } from '../protocol/index.ts';
import type { TableControlsState } from '../../stores/tableControlsStore';

export interface TableModeSource {
  getState(): TableControlsState;
  subscribe(listener: (state: TableControlsState, previous: TableControlsState) => void): () => void;
}

export interface TableModePorts {
  send(body: GmMessage, to?: string): void;
  /** The curtain went down or up: what is shared of the scene follows. */
  curtainChanged(down: boolean): void;
}

/** The table's mode as players are sent it. */
export function tableModeOf(state: TableControlsState): TableModeMessage {
  return { t: 'table-mode', mode: state.playMode, curtain: state.curtain, paused: state.paused };
}

const sameMode = (a: TableControlsState, b: TableControlsState): boolean => a.playMode === b.playMode && a.curtain === b.curtain && a.paused === b.paused;

/**
 * Tells players how the table plays (`TableModeMessage`): every player on each change of the GM's
 * controls (`tableControlsStore`), and one player on its own when it joins (`resend`). A lowered
 * curtain also stops the sharing of the scene (`curtainChanged`), so what the GM prepares behind it
 * never reaches a page.
 */
export class TableModeShare {
  private readonly source: TableModeSource;
  private readonly ports: TableModePorts;
  private unsubscribe: (() => void) | null = null;

  constructor(source: TableModeSource, ports: TableModePorts) {
    this.source = source;
    this.ports = ports;
  }

  /** Whether the curtain is down now. */
  get curtained(): boolean {
    return this.source.getState().curtain;
  }

  start(): void {
    this.unsubscribe ??= this.source.subscribe((state, previous) => {
      if (sameMode(state, previous)) return;
      this.ports.send(tableModeOf(state));
      if (state.curtain !== previous.curtain) this.ports.curtainChanged(state.curtain);
    });
  }

  /** The table's mode to one player, or to all. */
  resend(to?: string): void {
    this.ports.send(tableModeOf(this.source.getState()), to);
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}
