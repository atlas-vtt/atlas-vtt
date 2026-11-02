import type { DungeonModel, DungeonRequest } from '../model';
import type { DungeonStyle, DungeonView } from '../style';
import type { DungeonJob, DungeonRendered } from '../worker/dungeonJob';

/** A box's size in pixels. */
export interface PixelSize {
  width: number;
  height: number;
}

/** What the scene's map shows of its entry floor. */
export interface SceneThumbnailSource {
  request: DungeonRequest;
  model?: DungeonModel;
  style: DungeonStyle;
  view: DungeonView;
}

/** The picture is drawn at twice the thumbnail's pixels and then halved, so it keeps its fine lines. */
const OVERSAMPLE = 2;

/** Where `source` is drawn so that it covers `target`, centred: the crop a scene's thumbnail is (`thumbnailFrame`). */
export function coverRect(source: PixelSize, target: PixelSize): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  return { x: (target.width - width) / 2, y: (target.height - height) / 2, width, height };
}

/**
 * The thumbnail a scene of this dungeon shows before it was ever opened (note pin hovers, scene
 * cards): its entry floor drawn by the dungeon worker and cropped to `size` as a map view's
 * thumbnail is, as JPEG bytes. Opening the scene later replaces it with a picture of the view.
 */
export async function dungeonSceneThumbnail(
  render: (job: DungeonJob) => Promise<DungeonRendered>,
  source: SceneThumbnailSource,
  size: PixelSize,
): Promise<ArrayBuffer | null> {
  const { image } = await render({
    request: source.request,
    ...(source.model && { model: source.model }),
    style: source.style,
    view: source.view,
    output: { kind: 'preview', width: size.width * OVERSAMPLE, height: size.height * OVERSAMPLE, floor: 0 },
  });
  if (image.type !== 'bitmap') return null;
  try {
    const canvas = new OffscreenCanvas(size.width, size.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    const { x, y, width, height } = coverRect(image.bitmap, size);
    ctx.drawImage(image.bitmap, x, y, width, height);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return await blob.arrayBuffer();
  } finally {
    image.bitmap.close();
  }
}
