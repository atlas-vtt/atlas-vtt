import { detachedEl, type OwnWindow } from './dockDom.ts';
import type { QrDrawing } from './qrDrawing.ts';

/**
 * The QR code as a picture to send: the card's own drawing (the same path data, the same icon) painted
 * large on a canvas, so nothing is scaled up from the screen. A full white square without a transparent
 * pixel: the quiet zone must stay white on a dark chat background, where a rounded plate's open corners
 * would show dark. It holds the code alone, so the invite link and nothing else: no join code, no text.
 */

/** The picture's side the module size aims at, in pixels. */
const IMAGE_SIDE = 1024;

/** How the card draws the code, read from it, so the picture cannot differ. */
export interface QrImageLook {
  readonly dark: string;
  readonly light: string;
  /** The Atlas icon, built into the plugin. */
  readonly icon: HTMLImageElement;
}

/** The picture's pixels per module: whole, so every edge lies on a pixel's. */
export const qrImageModule = (drawing: Pick<QrDrawing, 'side'>): number => Math.max(1, Math.round(IMAGE_SIDE / drawing.side));

/** Painted in the window `el` lives in, on a canvas that stands nowhere. */
function paint(el: HTMLElement, drawing: QrDrawing, look: QrImageLook): HTMLCanvasElement {
  const win = el.win as OwnWindow;
  const module = qrImageModule(drawing);
  const canvas = detachedEl(el, 'canvas');
  canvas.width = canvas.height = module * drawing.side;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('No canvas to draw the QR code on');
  context.fillStyle = look.light;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(module, module);
  context.fillStyle = look.dark;
  context.fill(new win.Path2D(drawing.modules));
  context.fill(new win.Path2D(drawing.finders), 'evenodd');
  context.imageSmoothingQuality = 'high';
  context.drawImage(look.icon, drawing.icon.x, drawing.icon.y, drawing.icon.side, drawing.icon.side);
  return canvas;
}

/** The picture as a PNG; it fails where the icon cannot be drawn, rather than give a code without it. */
export async function qrImageBlob(el: HTMLElement, drawing: QrDrawing, look: QrImageLook): Promise<Blob> {
  await look.icon.decode();
  const canvas = paint(el, drawing, look);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) reject(new Error('The QR code could not be made a picture'));
      else resolve(blob);
    }, 'image/png');
  });
}
