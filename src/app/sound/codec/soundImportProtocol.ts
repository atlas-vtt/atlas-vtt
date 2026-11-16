import type { SoundRefusal } from './demux/demuxTypes';
import type { GrowingPages, GrowingStart } from './growingCopy';
import type { SoundImportResult } from './soundConvert';

export type SoundImportMessage =
  | { type: 'progress'; share: number }
  | { type: 'start'; start: GrowingStart }
  | { type: 'pages'; pages: GrowingPages }
  | { type: 'done'; result: SoundImportResult }
  | { type: 'failed'; reason: SoundRefusal; detail: string };
