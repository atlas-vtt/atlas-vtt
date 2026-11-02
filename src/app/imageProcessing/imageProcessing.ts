import { t } from '../i18n';
import { BAND_FORMATS, BAND_MAX_PIXELS, bandDecodable, DECODED_MAX_PIXELS, DECODER_MAX_SIDE, decodable, scaledJpegDecodeSize } from './decodeLimits';
import type { BandUnsupportedReason } from './band/bandTypes';
import { unsupportedMessage } from './band/unsupportedMessage';
import type { FramePlacement, ImageJob, ImageJobResult, ImageLayout, ThumbnailSpec } from './imageJob';
import { imageHeader, type ImageHeader } from './imageDimensions';
import { withDecodedImage } from './imageElement';
import { fitSize, vectorRasterSize, type Size } from './imageLayout';
import { BandRefusedError, ImageDecodeError, ImageWorkerPool, type ImageJobOptions } from './ImageWorkerPool';
import ImageWorker from './imageWorker?worker&inline';

export type { FramePlacement, ThumbnailSpec, ImageJobResult as ProcessedImage } from './imageJob';

/**
 * Image conversion for imports: decoding, scaling and WebP encoding run in a
 * pool of workers, so Obsidian stays responsive and a batch uses several
 * cores. Browsers encode images on the CPU only; parallel workers are what
 * make a batch faster.
 */

export interface ImagePreset {
  maxWidth: number;
  maxHeight: number;
  /** Pixels in all; unset limits only the sides. */
  maxPixels?: number;
  /** WebP quality, 0–1; Chromium encodes exactly 1 losslessly. */
  quality: number;
}

/**
 * The most pixels a map may have: a gigapixel, seven times Owlbear Rodeo's largest maps (144 MP).
 * Below `DECODED_MAX_PIXELS` the browser decodes a map; from there Atlas' own band decoders read a
 * plain JPEG or a PNG in rows (`BAND_MAX_PIXELS`), kept as uploaded. The tile pyramid draws any
 * size at any zoom, and the online store sends players only the tiles they look at.
 */
export const MAP_MAX_PIXELS = BAND_MAX_PIXELS;
/**
 * The longest side a map may have, for very wide or tall maps within `MAP_MAX_PIXELS`: what the
 * decoders, a canvas and a JPEG take. A map wider than a WebP can be is written as PNG.
 */
export const MAP_MAX_SIDE = DECODER_MAX_SIDE;

export const IMAGE_PRESETS = {
  token: { maxWidth: 400, maxHeight: 400, quality: 0.85 },
  /**
   * A map that fits is kept as uploaded; one that is scaled down is written losslessly (WebP, or
   * PNG beyond WebP's sides), since lossy WebP blurs fine lines and halves the resolution of colour.
   */
  map: { maxWidth: MAP_MAX_SIDE, maxHeight: MAP_MAX_SIDE, maxPixels: MAP_MAX_PIXELS, quality: 1 },
} as const satisfies Record<string, ImagePreset>;

export interface ProcessOptions {
  signal?: AbortSignal | undefined;
  thumbnail?: ThumbnailSpec | undefined;
  preview?: ThumbnailSpec | undefined;
  sourcePreview?: ThumbnailSpec | undefined;
  /** Work nobody waits for yet, such as preview conversions; jobs someone waits for run first. */
  background?: boolean;
  /** The result is stored under a WebP name: a PNG or JPEG that fits is encoded too instead of kept. */
  webpOnly?: boolean;
}

/** Workers beyond this add little for batches of token art and cost memory. */
const MAX_WORKERS = 6;
/**
 * Decoded pixels all running jobs may hold together. Token art runs in
 * parallel; a huge map (150 megapixels hold 1.2 GB while converting, the
 * largest 2.1 GB) runs alone.
 */
export const MEMORY_BUDGET_BYTES = 1024 ** 3;
/** Side assumed for an image that reports no size of its own, such as an SVG without dimensions. */
const UNSIZED_IMAGE_SIDE = 2048;
const SVG = 'image/svg+xml';

/**
 * Main-thread rasters go one at a time, each until its worker is done: the
 * bitmap waits outside the pool's memory budget, and an SVG map's holds up to
 * 576 MB.
 */
let lastRaster: Promise<unknown> = Promise.resolve();

function afterEarlierRasters<T>(task: () => Promise<T>): Promise<T> {
  const result = lastRaster.then(task);
  lastRaster = result.catch(() => undefined);
  return result;
}

let pool: ImageWorkerPool | null = null;
/** Set on unload, so work finishing afterwards cannot start new workers for a plugin that is gone. */
let disposed = false;

function workerPool(): ImageWorkerPool {
  if (disposed) throw new Error('Image processing has stopped.');
  pool ??= new ImageWorkerPool(() => new ImageWorker({ name: 'Atlas image processing' }), {
    maxWorkers: workerCount(),
    memoryBudget: MEMORY_BUDGET_BYTES,
  });
  return pool;
}

/** One core stays free for Obsidian itself. */
function workerCount(): number {
  const cores = navigator.hardwareConcurrency || 2;
  return Math.min(MAX_WORKERS, Math.max(1, cores - 1));
}

/** Stops the workers; called when the plugin unloads. */
export function disposeImageProcessing(): void {
  disposed = true;
  pool?.dispose();
  pool = null;
}

/**
 * Rasterizes `blob` on the main thread for formats workers cannot decode. A
 * vector image is drawn at the size `layout` asks for, so an SVG map gets a
 * map's pixels rather than a token's.
 */
function rasterize(blob: Blob, layout: ImageLayout): Promise<ImageBitmap> {
  return withDecodedImage(blob, (image) => {
    const natural = { width: image.naturalWidth || UNSIZED_IMAGE_SIDE, height: image.naturalHeight || UNSIZED_IMAGE_SIDE };
    const { width, height } = blob.type === SVG ? vectorRasterSize(natural, layout) : natural;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a drawing surface for the image.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.transferToImageBitmap();
  });
}

/** Memory a job holds while it runs: the decoded source plus, at most as large, the output and its scaling steps. */
function jobCost(size: Size | null): number | undefined {
  return size ? size.width * size.height * 4 * 2 : undefined;
}

/** Raised for a source larger than Atlas can read, with a message to show: the band decoders' cap for their formats, the browser's for the rest. */
export class ImageTooLargeError extends Error {
  constructor(readonly size: Size, format?: string) {
    const banded = format !== undefined && BAND_FORMATS.has(format);
    super(t('image.tooLarge', {
      width: size.width,
      height: size.height,
      megapixels: Math.floor((banded ? BAND_MAX_PIXELS : DECODED_MAX_PIXELS) / 1e6),
      side: banded ? MAP_MAX_SIDE : DECODER_MAX_SIDE,
    }));
  }
}

/** Raised for a source larger than the browser decodes that the band decoders refuse, with a message that says what to export. */
export class ImageUnsupportedError extends Error {
  constructor(readonly size: Size, readonly reason: BandUnsupportedReason) {
    super(unsupportedMessage(size.width, size.height, reason));
  }
}

const UNSUPPORTED_REASONS: ReadonlySet<string> = new Set<BandUnsupportedReason>(['progressive', 'interlaced', 'scans', 'coding', 'components', 'orientation', 'corrupt']);
const isUnsupportedReason = (reason: string): reason is BandUnsupportedReason => UNSUPPORTED_REASONS.has(reason);

/**
 * Whether an upload the browser cannot decode goes to a band decoder: a fit of a JPEG or PNG within
 * the band decoders' cap. One that fits the layout as it is is kept; a smaller fit (a thumbnail, a
 * cover, token art) is made from the decode at an eighth.
 */
function bandJobOf(header: ImageHeader | null, layout: ImageLayout): ImageJob['band'] {
  return header && layout.kind === 'fit' && bandDecodable(header) ? { format: header.format } : undefined;
}

/** A JPEG larger than a fit keeps is decoded at the smallest eighth of its size that still has every pixel the fit keeps. */
function scaledDecodeOf(header: ImageHeader | null, layout: ImageLayout): ImageJob['scaledDecode'] {
  if (header?.format !== 'jpeg' || layout.kind !== 'fit') return undefined;
  const source = { width: header.width, height: header.height };
  const decoded = scaledJpegDecodeSize(source, fitSize(source, layout));
  return decoded ? { source, decoded } : undefined;
}

async function process(source: Blob, job: Omit<ImageJob, 'source'>, options: ProcessOptions): Promise<ImageJobResult> {
  const header = await imageHeader(source);
  const band = bandJobOf(header, job.layout);
  if (header && !decodable(header) && !band) throw new ImageTooLargeError(header, header.format);
  const scaledDecode = band ? undefined : scaledDecodeOf(header, job.layout);
  // A band decode holds the file's bytes, an eighth of the image and the decoder's rows: far less than a decode.
  const cost = band ? source.size + (jobCost({ width: Math.ceil(header!.width / 8), height: Math.ceil(header!.height / 8) }) ?? 0) : jobCost(scaledDecode?.decoded ?? header);
  const run: ImageJobOptions = { signal: options.signal, background: options.background ?? false, cost };
  const withCopies = { ...job, thumbnail: options.thumbnail, preview: options.preview, sourcePreview: options.sourcePreview, webpOnly: options.webpOnly, band };
  // One pool for both attempts: after unload it refuses the fallback and frees its bitmap
  const workers = workerPool();
  try {
    return await workers.run({ ...withCopies, source, scaledDecode }, run);
  } catch (error) {
    if (error instanceof BandRefusedError && header && isUnsupportedReason(error.reason)) throw new ImageUnsupportedError(header, error.reason);
    if (!(error instanceof ImageDecodeError)) throw error;
    return afterEarlierRasters(async () => {
      options.signal?.throwIfAborted();
      const bitmap = await rasterize(source, job.layout);
      return workers.run({ ...withCopies, source: bitmap }, { ...run, cost: jobCost(bitmap), transfer: [bitmap] });
    });
  }
}

/** `source` scaled down to fit the preset and encoded as WebP; a PNG, JPEG or WebP that fits is kept as it is (see `webpOnly`). */
export function optimizeImage(source: Blob, preset: ImagePreset, options: ProcessOptions = {}): Promise<ImageJobResult> {
  const { maxWidth, maxHeight, maxPixels, quality } = preset;
  return process(source, { layout: { kind: 'fit', maxWidth, maxHeight, maxPixels }, quality }, options);
}

/**
 * A picture drawn off the main thread (a generated map), encoded as WebP like `optimizeImage`
 * encodes an upload, without a PNG between: the bitmap moves to an image worker, which encodes it
 * as it is where it fits the preset. The bitmap is taken over.
 */
export function optimizeBitmap(source: ImageBitmap, preset: ImagePreset, options: Pick<ProcessOptions, 'signal' | 'thumbnail' | 'background'> = {}): Promise<ImageJobResult> {
  const { maxWidth, maxHeight, maxPixels, quality } = preset;
  const job: ImageJob = { source, layout: { kind: 'fit', maxWidth, maxHeight, maxPixels }, quality, thumbnail: options.thumbnail, webpOnly: true };
  let workers: ImageWorkerPool;
  try {
    workers = workerPool();
  } catch (error) {
    source.close();
    throw error;
  }
  return workers.run(job, { signal: options.signal, background: options.background ?? false, cost: jobCost(source), transfer: [source] });
}

export interface FrameOptions extends ProcessOptions {
  minSize: number;
  maxSize: number;
  quality: number;
}

/** A square WebP of `source` placed in a frame; areas it does not cover stay transparent. */
export function renderFramedImage(source: Blob, placement: FramePlacement, options: FrameOptions): Promise<ImageJobResult> {
  const { minSize, maxSize, quality } = options;
  return process(source, { layout: { kind: 'frame', placement, minSize, maxSize }, quality }, options);
}

/** WebP bytes of `source` whose longer side is at most `spec.size` pixels. */
export async function renderThumbnail(source: Blob, spec: ThumbnailSpec, options: Pick<ProcessOptions, 'signal' | 'background'> = {}): Promise<ArrayBuffer> {
  const { image } = await optimizeImage(source, { maxWidth: spec.size, maxHeight: spec.size, quality: spec.quality }, { ...options, webpOnly: true });
  return image.arrayBuffer();
}
