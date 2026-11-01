import type { SoundRefusal } from './demux/demuxTypes';
import type { SoundImportJob, SoundImportResult } from './soundConvert';

export type SoundImportRequest = SoundImportJob;

export type SoundImportMessage =
  | { type: 'progress'; share: number }
  | { type: 'done'; result: SoundImportResult }
  | { type: 'failed'; reason: SoundRefusal; detail: string };
