import { Platform } from 'obsidian';

/** What a directory entry says of itself. */
export interface NodeDirent {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface NodeStat {
  size: number;
  mtimeMs: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface NodeFileHandle {
  read(buffer: Uint8Array, offset: number, length: number, position: number | null): Promise<{ bytesRead: number }>;
  write(buffer: Uint8Array): Promise<{ bytesWritten: number }>;
  close(): Promise<void>;
}

export interface NodeWatcher {
  close(): void;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}

/** The part of Node's `fs` a linked folder on disk needs. */
export interface NodeFsModule {
  promises: {
    readdir(path: string, options: { withFileTypes: true }): Promise<NodeDirent[]>;
    stat(path: string): Promise<NodeStat>;
    realpath(path: string): Promise<string>;
    mkdir(path: string, options: { recursive: boolean }): Promise<unknown>;
    rename(from: string, to: string): Promise<void>;
    open(path: string, flags: string): Promise<NodeFileHandle>;
  };
  watch(path: string, options: { recursive: boolean }, listener: (event: string, name: string | Uint8Array | null) => void): NodeWatcher;
}

/** Node's files, and how this system writes a path. */
export interface NodeFiles {
  fs: NodeFsModule;
  sep: string;
  /** The user's home, to shorten what the rail shows. */
  home: string;
}

function required(win: Window, module: string): unknown {
  const load: unknown = Reflect.get(win, 'require');
  return typeof load === 'function' ? Reflect.apply(load, win, [module]) : null;
}

/** Node's files on the desktop app; null anywhere else, where a folder outside the vault cannot be linked. */
export function nodeFilesOf(win: Window): NodeFiles | null {
  if (!Platform.isDesktop || !Platform.isDesktopApp) return null;
  try {
    const fs = required(win, 'fs') as NodeFsModule | null;
    const path = required(win, 'path') as { sep: string } | null;
    const os = required(win, 'os') as { homedir(): string } | null;
    return fs?.promises && path && os ? { fs, sep: path.sep, home: os.homedir() } : null;
  } catch {
    return null;
  }
}
