import { Texture } from 'pixi.js';
import { WIDGET_ICON_PATHS } from '../../types/widgetIcons';
import { textureCanvas } from '../utils/textureCanvas';

/** Edge length of the rasterised emblem, large enough for big tokens on high-density screens. */
export const DOWNED_EMBLEM_TEXTURE_SIZE = 384;

/** Widget icons are drawn on a 512×512 canvas. */
const ICON_SPACE = 512;
/** Skull height as a share of the emblem, which spans the token's diameter. */
const SKULL_SHARE = 0.46;
/** Eye socket centres of the skull icon, in icon space. */
const EYE_SOCKETS = [[166, 256], [346, 256]] as const;
const EYE_GLOW_RADIUS = 70;
const OUTLINE_COLOR = '#120c0a';

/**
 * Rasterises the downed-creature emblem: the set's skull in muted, aged bone with a dark
 * outline, a soft vignette that keeps it legible on any artwork and embers in the
 * eye sockets. Drawn with Path2D, so no image has to load.
 */
export function createDownedEmblemTexture(size: number = DOWNED_EMBLEM_TEXTURE_SIZE): Texture {
  const drawn = textureCanvas(size, size);
  if (!drawn) throw new Error('[downedEmblemTexture] Could not acquire 2D context');
  const { canvas, context: ctx } = drawn;

  drawVignette(ctx, size);
  const scale = (size * SKULL_SHARE) / ICON_SPACE;
  ctx.translate(size / 2 - (ICON_SPACE / 2) * scale, size / 2 - (ICON_SPACE / 2) * scale);
  ctx.scale(scale, scale);

  const skull = new Path2D(WIDGET_ICON_PATHS.skull);
  drawEyeEmbers(ctx);
  drawOutline(ctx, skull, size);
  drawBone(ctx, skull);
  return Texture.from(canvas);
}

function drawVignette(ctx: CanvasRenderingContext2D, size: number): void {
  const centre = size / 2;
  const vignette = ctx.createRadialGradient(centre, centre, 0, centre, centre, centre);
  vignette.addColorStop(0, 'rgba(10, 5, 5, 0.45)');
  vignette.addColorStop(0.6, 'rgba(10, 5, 5, 0.2)');
  vignette.addColorStop(1, 'rgba(10, 5, 5, 0)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
}

/** Glows behind the skull that show through its eye sockets. */
function drawEyeEmbers(ctx: CanvasRenderingContext2D): void {
  for (const [x, y] of EYE_SOCKETS) {
    const ember = ctx.createRadialGradient(x, y, 0, x, y, EYE_GLOW_RADIUS);
    ember.addColorStop(0, 'rgba(230, 95, 55, 0.7)');
    ember.addColorStop(0.45, 'rgba(150, 28, 18, 0.45)');
    ember.addColorStop(1, 'rgba(120, 10, 10, 0)');
    ctx.fillStyle = ember;
    ctx.fillRect(x - EYE_GLOW_RADIUS, y - EYE_GLOW_RADIUS, EYE_GLOW_RADIUS * 2, EYE_GLOW_RADIUS * 2);
  }
}

function drawOutline(ctx: CanvasRenderingContext2D, skull: Path2D, size: number): void {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur = size * 0.05;
  ctx.shadowOffsetY = size * 0.015;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 28;
  ctx.strokeStyle = OUTLINE_COLOR;
  ctx.fillStyle = OUTLINE_COLOR;
  ctx.stroke(skull);
  ctx.fill(skull);
  ctx.restore();
}

/** Bone gradient, a top-left highlight and a faint inner edge for depth. */
function drawBone(ctx: CanvasRenderingContext2D, skull: Path2D): void {
  const bone = ctx.createLinearGradient(0, 16, 0, ICON_SPACE - 16);
  bone.addColorStop(0, '#d6cebd');
  bone.addColorStop(0.5, '#b3a892');
  bone.addColorStop(1, '#7c705c');
  ctx.fillStyle = bone;
  ctx.fill(skull);

  ctx.save();
  ctx.clip(skull);
  const highlight = ctx.createRadialGradient(200, 90, 0, 200, 90, 260);
  highlight.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
  highlight.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = highlight;
  ctx.fillRect(0, 0, ICON_SPACE, ICON_SPACE);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(60, 40, 30, 0.35)';
  ctx.stroke(skull);
  ctx.restore();
}
