import type { SoundRefusal } from './demux/demuxTypes';
import type { SoundImportResult } from './soundConvert';

export type SoundImportMessage =
  | { type: 'progress'; share: number }
  | { type: 'done'; result: SoundImportResult }
  | { type: 'failed'; reason: SoundRefusal; detail: string };
