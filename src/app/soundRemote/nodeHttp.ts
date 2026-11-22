import { isDesktopApp } from '../platform/desktopOnly';
import type { RequestHeaders } from './remoteAccess';

/** The part of Node's `http` request the remote reads. */
export interface NodeRequest {
  method?: string;
  url?: string;
  headers: RequestHeaders;
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  on(event: 'end' | 'error', listener: () => void): unknown;
  pause(): unknown;
}

/** The part of Node's `http` response the remote writes. */
export interface NodeResponse {
  readonly writableEnded: boolean;
  readonly headersSent: boolean;
  writeHead(status: number, headers: Record<string, string>): unknown;
  write(chunk: string): boolean;
  end(chunk?: string): void;
  on(event: 'close', listener: () => void): unknown;
}

export interface NodeServer {
  listen(port: number, host: string, listener: () => void): unknown;
  on(event: 'error', listener: (error: unknown) => void): unknown;
  close(): unknown;
  /** Node 18.2 and later. */
  closeAllConnections?(): void;
}

export interface NodeHttpModule {
  createServer(handler: (request: NodeRequest, response: NodeResponse) => void): NodeServer;
}

/** Node's `http` in the desktop app; null anywhere else, where nothing can listen. */
export function nodeHttpOf(win: Window): NodeHttpModule | null {
  if (!isDesktopApp()) return null;
  try {
    const load: unknown = Reflect.get(win, 'require');
    const http = typeof load === 'function' ? (Reflect.apply(load, win, ['http']) as Partial<NodeHttpModule> | null) : null;
    return typeof http?.createServer === 'function' ? (http as NodeHttpModule) : null;
  } catch {
    return null;
  }
}
