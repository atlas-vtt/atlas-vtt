/** A file whose length does not show by then is taken as of unknown length. */
const METADATA_TIMEOUT_MS = 5000;

/** How long an audio file plays, in seconds, from its metadata alone; null when the browser cannot tell. */
export function readAudioSecondsAt(url: string): Promise<number | null> {
  const audio = createEl('audio', { attr: { preload: 'metadata' } });
  return new Promise<number | null>((resolve) => {
    const timer = window.setTimeout(() => resolve(null), METADATA_TIMEOUT_MS);
    const finish = (seconds: number | null): void => {
      window.clearTimeout(timer);
      resolve(seconds);
    };
    audio.addEventListener('loadedmetadata', () => finish(Number.isFinite(audio.duration) ? audio.duration : null), { once: true });
    audio.addEventListener('error', () => finish(null), { once: true });
    audio.src = url;
  }).finally(() => {
    audio.removeAttribute('src');
    audio.load();
  });
}
