import { inThreadPort, type PortFactory, type TilePort } from './tilePorts';
import type { TileEvent, TileMessage, TileReply } from './tileProtocol';

/**
 * Keeps `TileDecoderClient`'s port to the tile core: starts the worker on
 * first use, tells a worker that never started (it failed before its `ready`)
 * from one that crashed later, runs the core in-thread for good after the
 * former and starts a new worker after the latter, up to `MAX_WORKER_CRASHES`.
 */

/** Crashes of a worker that had started after which no new one is started this session. */
export const MAX_WORKER_CRASHES = 3;

/** The worker ended; `beforeReady`: it never started, so nothing sent to it was handled. */
export class TileWorkerCrash extends Error {
  constructor(message: string, readonly beforeReady: boolean) {
    super(message);
  }
}

export interface TilePortKeeperOptions {
  appId: string | null;
  worker: PortFactory;
  /** Used when no worker starts. */
  inThread?: PortFactory;
  receive: (message: TileReply | TileEvent) => void;
  /** The port ended: everything sent to it is lost; the next `current()` starts another. */
  lost: (crash: TileWorkerCrash) => void;
}

export class TilePortKeeper {
  private port: TilePort | null = null;
  private ready = false;
  /** A worker failed to start (or `new Worker` threw): the core runs in-thread from now on. */
  private inThreadOnly = false;
  private crashes = 0;

  constructor(private readonly options: TilePortKeeperOptions) {}

  /** The port that runs now, if any. */
  get running(): TilePort | null {
    return this.port;
  }

  /** The port, started on first use; throws once workers crashed `MAX_WORKER_CRASHES` times. */
  current(): TilePort {
    if (this.port) return this.port;
    if (this.crashes >= MAX_WORKER_CRASHES) {
      throw new Error(`The map tile worker stopped ${this.crashes} times; map images cannot be shown until Obsidian restarts.`);
    }
    const own: { port: TilePort | null } = { port: null };
    const receive = (message: TileMessage): void => {
      if (own.port !== this.port) return;
      if (message.type === 'ready') this.ready = true;
      else this.options.receive(message);
    };
    const crash = (reason: string): void => {
      if (own.port === this.port && own.port) this.crashed(reason);
    };
    const inThread = this.options.inThread ?? inThreadPort();
    let port: TilePort;
    if (this.inThreadOnly) {
      port = inThread(receive, crash);
    } else {
      try {
        port = this.options.worker(receive, crash);
      } catch {
        this.inThreadOnly = true;
        port = inThread(receive, crash);
      }
    }
    own.port = port;
    this.port = port;
    this.ready = false;
    port.post({ type: 'init', appId: this.options.appId }, []);
    return port;
  }

  /** Ends the port without counting it as a crash. */
  terminate(): void {
    this.port?.terminate();
    this.port = null;
  }

  private crashed(reason: string): void {
    const beforeReady = !this.ready;
    if (beforeReady) this.inThreadOnly = true;
    else this.crashes += 1;
    console.warn(`[Atlas] The map tile worker stopped${beforeReady ? ' before it started; maps are decoded on this thread instead' : ''}:`, reason);
    this.terminate();
    this.options.lost(new TileWorkerCrash(reason, beforeReady));
  }
}
