/** Framing in creator-well units, applied to the unmodified source image. */
export interface TokenImageCrop {
  imageScale: number;
  imagePosition: { x: number; y: number };
}

/** Owned artwork kept separately from the rendered image used on maps. */
export interface TokenImageSource {
  path: string;
  /** Fresh uploads start at 1; artwork saved by older versions starts at 0.8. */
  ringedDefaultScale: number;
  framed: TokenImageCrop;
  unframed: TokenImageCrop;
}
