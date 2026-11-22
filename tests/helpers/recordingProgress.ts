import type { DownloadAmount, DownloadProgress } from '../../src/app/downloads/downloadTypes';

export interface RecordingProgress {
  progress: DownloadProgress;
  controller: AbortController;
  /** Every file reported, in order. */
  files: { bytes: number; fetched: boolean }[];
  total: () => DownloadAmount | null;
}

/** A download's progress that only writes down what the task reports; abort `controller` to cancel. */
export function recordingProgress(onFile?: (count: number) => void): RecordingProgress {
  const controller = new AbortController();
  const files: RecordingProgress['files'] = [];
  let total: DownloadAmount | null = null;
  return {
    controller,
    files,
    total: () => total,
    progress: {
      signal: controller.signal,
      expect: (amount) => { total = amount; },
      fileDone: (bytes, fetched) => {
        files.push({ bytes, fetched });
        onFile?.(files.length);
      },
    },
  };
}
