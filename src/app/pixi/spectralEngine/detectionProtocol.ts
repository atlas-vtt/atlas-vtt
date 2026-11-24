import type { AlignmentResult } from '../gridAlignmentMath';
import type { ImageSize, MapGray } from './detectGrid';
import type { DetectionEvent, DetectionOutcome } from './detectionJob';
import type { GrayImage } from './grayImage';
import type { FitRequest } from './proposalFits';
import type { RefinedGrid } from './refineGrid';

/** What `SpectralEngineClient` asks of the detection worker: one job at a time. */
export interface DetectionRequest {
  id: number;
  /** Names the map image; its pixels come along only where the worker does not hold them yet. */
  imageKey: number;
  gray?: MapGray;
  /** Or its picture, to read them from: the worker closes it. */
  picture?: { bitmap: ImageBitmap; size: ImageSize };
  candidates?: AlignmentResult[];
  ink: boolean;
  /** Whether the outcome should say where the map's lines lie (`DetectionOutcome.lines`). */
  lines: boolean;
  /** Fits the worker may have under way on helpers at once (`FitHelpers`), besides its own. */
  helpers: number;
  /** Whether the helpers lack this image, which the worker then sends along (`share`) before its first fit. */
  share: boolean;
}

export type DetectionReply =
  | { id: number; event: DetectionEvent }
  | { id: number; outcome: DetectionOutcome }
  | { id: number; error: string }
  /** The image the detection's fits are run on, for the helpers. */
  | { id: number; share: GrayImage }
  /** A fit for a helper to run, answered with a `FitAnswer` of the same ticket. */
  | { id: number; fit: { ticket: number; request: FitRequest } };

/** A fit a helper runs on the image named `imageKey`, which comes along where the helper does not hold it yet. */
export interface FitTask {
  ticket: number;
  imageKey: number;
  image?: GrayImage;
  request: FitRequest;
}

/** A helper's answer to a `FitTask`, which the client hands on to the detection worker. */
export type FitAnswer = { ticket: number; fitted: RefinedGrid | null } | { ticket: number; error: string };
