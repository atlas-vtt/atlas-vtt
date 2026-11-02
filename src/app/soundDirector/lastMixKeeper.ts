import { saveLastMix, type DeviceStorage, type LastMix } from './deviceFacts';

const SAVE_LAST_MS = 1000;

/** Notes what plays for the next start, at most once a second. */
export class LastMixKeeper {
  private timer: number | null = null;

  constructor(
    private readonly storage: DeviceStorage,
    private readonly mixNow: () => LastMix | null,
  ) {}

  schedule(): void {
    this.timer ??= window.setTimeout(() => {
      this.timer = null;
      this.flush();
    }, SAVE_LAST_MS);
  }

  cancel(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  /** A mix that has gone quiet by itself leaves the note of when it last played. */
  flush(): void {
    this.cancel();
    const last = this.mixNow();
    if (last) saveLastMix(this.storage, last);
  }

  /** What the GM ended is not offered back. */
  forget(): void {
    this.cancel();
    saveLastMix(this.storage, null);
  }
}
