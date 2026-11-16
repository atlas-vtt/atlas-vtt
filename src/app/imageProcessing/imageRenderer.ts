import type { ImageJob, ImageJobResult, ImageLayout, ThumbnailSpec } from './imageJob';
import { bandDecoderFor } from './band/bandDecoders';
import { reducedSize } from './band/bandTypes';
import { decodable, WEBP_MAX_SIDE } from './decodeLimits';
import { fitSize, frameImageRect, frameSize, scaleDown, type Size } from './imageLayout';
import { imageHeader, type ImageFormat } from './imageDimensions';

const KEPT_FORMATS: ReadonlySet<ImageFormat> = new Set(['png', 'jpeg', 'webp']);

/**
 * Runs inside an image worker: one decode per job, scaling on a 2D canvas,
 * WebP encoding on the worker's thread (browsers encode on the CPU only).
 * Nothing here may touch the DOM or Obsidian.
 */

const WEBP = 'image/webp';
const PNG = 'image/png';

/** Raised when the worker cannot read the source format, so the main thread can decode it instead. */
export class SourceDecodeError extends Error {}

type Drawable = ImageBitmap | OffscreenCanvas;

/**
 * A JPEG decoded at `size` by DCT scaling, which reads only what that size
 * needs; null where WebCodecs is missing, so the caller decodes it whole.
 */
async function decodeScaledJpeg(source: Blob, size: Size): Promise<ImageBitmap | null> {
  if (typeof ImageDecoder === 'undefined') return null;
  const decoder = new ImageDecoder({ data: source.stream(), type: 'image/jpeg', desiredWidth: size.width, desiredHeight: size.height });
  try {
    const { image } = await decoder.decode();
    try {
      return await createImageBitmap(image);
    } finally {
      image.close();
    }
  } finally {
    decoder.close();
  }
}

async function decode(job: ImageJob): Promise<ImageBitmap> {
  const { source, scaledDecode } = job;
  if (source instanceof ImageBitmap) return source;
  // The main thread refuses such a source before it gets here; a decoder asked anyway would end the process.
  if (scaledDecode && !decodable(scaledDecode.source)) throw new Error('The image is too large to decode.');
  try {
    return (scaledDecode && await decodeScaledJpeg(source, scaledDecode.decoded)) ?? await createImageBitmap(source);
  } catch (error) {
    throw new SourceDecodeError(error instanceof Error ? error.message : 'Could not decode the image.');
  }
}

/**
 * The browser picks the backing: with GPU raster the scaling runs on the GPU
 * and only the small result is read back for encoding, which measured faster
 * than a software canvas. `high` is Chromium's best downscaling filter; the
 * canvas default, `low`, aliases.
 */
function context(canvas: OffscreenCanvas): OffscreenCanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a drawing surface for the image.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return ctx;
}

/**
 * `canvas` as WebP at `quality`. A picture wider or taller than a WebP can be (`convertToBlob` would
 * crop it without a word) is written as PNG, lossless as the lossless WebP it stands in for; only
 * maps scaled down to a long side ever are.
 */
async function encode(canvas: OffscreenCanvas, quality: number): Promise<Blob> {
  const type = canvas.width > WEBP_MAX_SIDE || canvas.height > WEBP_MAX_SIDE ? PNG : WEBP;
  const blob = await canvas.convertToBlob(type === WEBP ? { type, quality } : { type });
  if (blob.type !== type) throw new Error(`This system cannot encode ${type === WEBP ? 'WebP' : 'PNG'} images.`);
  return blob;
}

/**
 * `source` halved until it is less than four times `size`, so the final draw
 * reduces it at most fourfold. A single draw over a larger reduction samples
 * too few source pixels and aliases.
 */
function reduced(source: Drawable, size: Size): Drawable {
  let current = source;
  while (Math.min(current.width / size.width, current.height / size.height) >= 4) {
    const half = new OffscreenCanvas(Math.round(current.width / 2), Math.round(current.height / 2));
    context(half).drawImage(current, 0, 0, half.width, half.height);
    freeIntermediate(current, source);
    current = half;
  }
  return current;
}

/** Releases a halving step's pixels now instead of at garbage collection; for maps they are tens of megabytes. */
function freeIntermediate(drawable: Drawable, source: Drawable): void {
  if (drawable !== source && drawable instanceof OffscreenCanvas) {
    drawable.width = 0;
    drawable.height = 0;
  }
}

function renderFit(source: Drawable, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const scaled = reduced(source, size);
  context(canvas).drawImage(scaled, 0, 0, size.width, size.height);
  freeIntermediate(scaled, source);
  return canvas;
}

function renderFrame(bitmap: ImageBitmap, layout: Extract<ImageLayout, { kind: 'frame' }>): OffscreenCanvas {
  const frame = frameSize(bitmap, layout.placement, layout.minSize, layout.maxSize);
  const rect = frameImageRect(bitmap, layout.placement, frame);
  const canvas = new OffscreenCanvas(frame, frame);
  const scaled = reduced(bitmap, rect);
  context(canvas).drawImage(scaled, rect.left, rect.top, rect.width, rect.height);
  freeIntermediate(scaled, bitmap);
  return canvas;
}

function scaledCopy(source: Drawable, spec: ThumbnailSpec): OffscreenCanvas {
  return renderFit(source, fitSize(source, { kind: 'fit', maxWidth: spec.size, maxHeight: spec.size }));
}

async function renderCopy(source: Drawable, spec: ThumbnailSpec | undefined): Promise<Blob | null> {
  return spec ? encode(scaledCopy(source, spec), spec.quality) : null;
}

/**
 * The thumbnail and preview of `output`. A preview at least as large as the
 * thumbnail is its source, so a large map is reduced once rather than twice.
 */
async function renderCopies(output: Drawable, job: ImageJob): Promise<Pick<ImageJobResult, 'thumbnail' | 'preview'>> {
  const previewCanvas = job.preview ? scaledCopy(output, job.preview) : null;
  const preview = previewCanvas && job.preview ? await encode(previewCanvas, job.preview.quality) : null;
  const thumbnailSource = previewCanvas && job.thumbnail && Math.max(previewCanvas.width, previewCanvas.height) >= job.thumbnail.size
    ? previewCanvas : output;
  const thumbnail = job.thumbnail ? await encode(scaledCopy(thumbnailSource, job.thumbnail), job.thumbnail.quality) : null;
  return { thumbnail, preview };
}

/**
 * A source that needs no scaling is kept as it is: re-encoding would only lose quality, and
 * players notice. Only formats every Atlas view shows are kept; others (GIF, BMP) are encoded,
 * and so is everything but a WebP where the job's result must be one.
 */
async function keepsSource(job: ImageJob, source: Blob, bitmap: ImageBitmap): Promise<boolean> {
  if (!fitsAsItIs(bitmap, job.layout)) return false;
  const format = (await imageHeader(source))?.format;
  return job.webpOnly ? format === 'webp' : format !== undefined && KEPT_FORMATS.has(format);
}

/**
 * The natural size of the source as it is shown. Header sizes are stored
 * sizes, while decoders apply a JPEG's EXIF rotation: a bitmap decoded with
 * swapped sides is a turned image. The bitmap has the scaled size, or the
 * full one where `ImageDecoder` is missing and the JPEG was decoded whole.
 */
function shownSource(bitmap: ImageBitmap, scaledDecode: ImageJob['scaledDecode']): Size {
  if (!scaledDecode) return bitmap;
  const { source, decoded } = scaledDecode;
  const swaps = (size: Size): boolean => bitmap.width === size.height && bitmap.height === size.width;
  const turned = bitmap.width !== bitmap.height && (swaps(decoded) || swaps(source));
  return turned ? { width: source.height, height: source.width } : source;
}

/** A fit is sized from the natural source, so a JPEG decoded at a smaller scale comes out as a whole decode would. */
function render(bitmap: ImageBitmap, source: Size, layout: ImageLayout): OffscreenCanvas {
  return layout.kind === 'fit' ? renderFit(bitmap, fitSize(source, layout)) : renderFrame(bitmap, layout);
}

/**
 * A bitmap that needs no scaling (a generated map), encoded as it is: handed to a canvas instead of
 * drawn onto one, so its pixels are neither copied nor held twice.
 */
async function encodeAsItIs(bitmap: ImageBitmap, job: ImageJob): Promise<ImageJobResult> {
  const sourcePreview = await renderCopy(bitmap, job.sourcePreview);
  const copies = await renderCopies(bitmap, job);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const renderer = canvas.getContext('bitmaprenderer');
  if (!renderer) throw new Error('Could not create a drawing surface for the image.');
  renderer.transferFromImageBitmap(bitmap);
  return { image: await encode(canvas, job.quality), sourcePreview, ...copies };
}

function fitsAsItIs(bitmap: ImageBitmap, layout: ImageLayout): boolean {
  if (layout.kind !== 'fit') return false;
  const fitted = fitSize(bitmap, layout);
  return fitted.width === bitmap.width && fitted.height === bitmap.height;
}

/**
 * A source the browser cannot decode, read in bands at an eighth of its size. A map it fits as it
 * is (the layout is a map's) is kept, its thumbnail and preview made from the eighth; anything
 * smaller (a thumbnail of a vault image, a cover, token art) is fit from the eighth, which holds
 * every pixel such a fit needs, and encoded like any scaled picture.
 */
async function renderBandJob(job: ImageJob, band: { format: string }): Promise<ImageJobResult> {
  if (!(job.source instanceof Blob) || job.layout.kind !== 'fit') throw new Error('A band job needs the image bytes and a fit.');
  const decoder = bandDecoderFor(band.format);
  if (!decoder) throw new Error(`No band decoder reads ${band.format}.`);
  const bytes = new Uint8Array(await job.source.arrayBuffer());
  const natural = decoder.inspect(bytes);
  const { width, height } = reducedSize(natural, 8);
  const pixels = new Uint8ClampedArray(width * height * 4);
  await decoder.decode(bytes, { reduce: 8, onBand: (rows) => { pixels.set(rows.data.subarray(0, rows.rows * width * 4), rows.y * width * 4); } });
  const reduced = await createImageBitmap(new ImageData(pixels, width, height));
  try {
    const sourcePreview = await renderCopy(reduced, job.sourcePreview);
    const target = fitSize(natural, job.layout);
    const kept = target.width === natural.width && target.height === natural.height;
    if (kept && !job.webpOnly) return { image: job.source, sourcePreview, ...await renderCopies(reduced, job) };
    if (target.width > width || target.height > height) throw new Error(`A fit of ${target.width} × ${target.height} needs more than an eighth of the image.`);
    const canvas = renderFit(reduced, target);
    return { image: await encode(canvas, job.quality), sourcePreview, ...await renderCopies(canvas, job), scaledDown: scaleDown(job.layout, natural, canvas) };
  } finally {
    reduced.close();
  }
}

export async function renderImageJob(job: ImageJob): Promise<ImageJobResult> {
  if (job.band) return renderBandJob(job, job.band);
  const bitmap = await decode(job);
  try {
    if (job.source instanceof ImageBitmap && fitsAsItIs(bitmap, job.layout)) return await encodeAsItIs(bitmap, job);
    const source = shownSource(bitmap, job.scaledDecode);
    const sourcePreview = await renderCopy(bitmap, job.sourcePreview);
    if (job.source instanceof Blob && !job.scaledDecode && await keepsSource(job, job.source, bitmap)) {
      return { image: job.source, sourcePreview, ...await renderCopies(bitmap, job) };
    }
    const canvas = render(bitmap, source, job.layout);
    const scaledDown = scaleDown(job.layout, source, canvas);
    // The output no longer needs the decoded source; free it before the slow encode.
    bitmap.close();
    return { image: await encode(canvas, job.quality), sourcePreview, ...await renderCopies(canvas, job), scaledDown };
  } finally {
    bitmap.close();
  }
}
