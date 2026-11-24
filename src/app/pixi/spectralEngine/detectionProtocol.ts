import type { AlignmentResult } from '../gridAlignmentMath';
import type { ImageSize, MapGray } from './detectGrid';
import type { DetectionEvent, DetectionOutcome } from './detectionJob';

/** What `SpectralEngineClient` asks of a detection worker: one job at a time. */
export interface DetectionRequest {
  id: number;
  /** Names the map image; its pixels come along only where the worker does not hold them yet. */
  imageKey: number;
  gray?: MapGray;
  /** Or its picture, to read them from: the worker closes it. */
  picture?: { bitmap: ImageBitmap; size: ImageSize };
  candidates?: AlignmentResult[];
  ink: boolean;
  /** Whether only where the map's lines lie is wanted (`DetectionJob.linesOnly`). */
  linesOnly: boolean;
}

export type DetectionReply =
  | { id: number; event: DetectionEvent }
  | { id: number; outcome: DetectionOutcome }
  | { id: number; error: string };
