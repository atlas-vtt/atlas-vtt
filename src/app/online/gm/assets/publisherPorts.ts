import type { Timers } from '../companionTimers.ts';
import type { ProgressPorts } from './assetProgress.ts';
import type { AssetSalt } from './assetSalt.ts';
import type { UploadClient } from './assetUpload.ts';
import type { FileStat } from './fileHashes.ts';
import type { PyramidSource } from './pyramidPublishing.ts';
import type { AssetStoreClient } from './storeClient.ts';

/** What a table's publisher (`AssetPublisher`) reads of the account, the vault, the socket and the clock. */
export interface AssetPublisherPorts extends Pick<ProgressPorts, 'sendLive' | 'send' | 'connected'> {
  readonly client: UploadClient & Pick<AssetStoreClient, 'offer' | 'putTiles'> & Partial<Pick<AssetStoreClient, 'remove'>>;
  /** This device's map pyramids; without them maps go as images. */
  readonly pyramids?: PyramidSource | undefined;
  readonly salt: Pick<AssetSalt, 'soon'>;
  readonly timers: Timers;
  /** A vault file's bytes as they are, or null where it cannot be read. */
  readFile(path: string): Promise<Uint8Array<ArrayBuffer> | null>;
  stat(path: string): FileStat | null;
  /** The players connected now, and the time the socket's last keep-alive took. */
  connection(): { readonly players: number; readonly latencyMs: number | null };
  /** Tells the GM something (Obsidian's `Notice`). */
  notify(text: string): void;
  /** The relay refused the account's token. */
  signedOutByServer(): void;
  /** Nothing is on its way any more: what the store holds may have changed. */
  settled?(): void;
  /** Assets players were handed can no longer be stored: what names them takes them from players. */
  withdrawn?(): void;
}

