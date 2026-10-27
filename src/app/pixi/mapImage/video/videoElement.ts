import { getDomHost } from '../../../host/dom';

/** A muted, looping video of a map, with its first frame decoded; nothing plays until asked. */
export interface OpenedVideo {
  readonly element: HTMLVideoElement;
  /** Stops the video and gives its memory back: the element loses its source and the object URL is revoked. Once only. */
  release(): void;
}

/** Where object URLs come from: `URL`, or a test's own. */
export interface ObjectUrls {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/** A video that neither loads nor fails within this long is given up. */
const LOAD_TIMEOUT_MS = 30_000;

/**
 * Makes a video of `bytes` in `doc` (the document of the view that shows it, so a popout's map
 * plays in the popout) through an object URL, never a resource URL: the vault's bytes stay the
 * one way a map reaches the view. The element is never attached; PIXI draws its frames.
 * Resolves once its first frame is decoded; rejects when it cannot be played, the URL revoked.
 */
export function openVideoElement(doc: Document, bytes: BlobPart, mime: string, urls: ObjectUrls = URL): Promise<OpenedVideo> {
  const url = urls.createObjectURL(new Blob([bytes], { type: mime }));
  const element = getDomHost().createVideo(doc);
  element.muted = true;
  element.loop = true;
  element.playsInline = true;
  element.preload = 'auto';

  let released = false;
  const release = (): void => {
    if (released) return;
    released = true;
    element.pause();
    element.removeAttribute('src');
    element.load();
    urls.revokeObjectURL(url);
  };

  return new Promise<OpenedVideo>((resolve, reject) => {
    const settle = (): void => {
      window.clearTimeout(timer);
      element.removeEventListener('loadeddata', onLoaded);
      element.removeEventListener('error', onError);
    };
    const fail = (error: Error): void => {
      settle();
      release();
      reject(error);
    };
    const onLoaded = (): void => {
      settle();
      resolve({ element, release });
    };
    const onError = (): void => fail(new Error(element.error?.message || 'The video cannot be played.'));
    const timer = window.setTimeout(() => fail(new Error('The video did not load.')), LOAD_TIMEOUT_MS);
    element.addEventListener('loadeddata', onLoaded);
    element.addEventListener('error', onError);
    element.src = url;
  });
}
