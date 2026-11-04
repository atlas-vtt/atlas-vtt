import { t, type MessageKey } from '../../i18n';

export interface BundleProgress {
  message: string;
  /** 0..1 */
  fraction: number;
}
export type BundleProgressListener = (progress: BundleProgress) => void;

/** Reports step `index` of `total` with `step` ("Writing {n} of {total} files…"), spread over the fraction range `from`..`to`. */
export function reportFileStep(onProgress: BundleProgressListener, step: MessageKey, index: number, total: number, from: number, to: number): void {
  onProgress({ message: t(step, { n: index + 1, total }), fraction: from + (index / Math.max(1, total)) * (to - from) });
}
