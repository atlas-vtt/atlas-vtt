import { createImageEncoder } from '../../imageProcessing/imageEncoder';
import { serveWorker } from '../../utils/nodeFreeWorker';
import type { EncoderReply, EncoderRequest, EncoderSetup } from './tesseraEncoderProtocol';
import { TESSERA_QUALITY } from './tesseraGraphics';

/**
 * Entry of a tessera encoder worker (`startTesseraEncoders`): encodes the crops the tessera core
 * sends on its port as `TesseraGraphics.encodeTessera` does. Bundled inline into main.js by Vite.
 */

const encoder = createImageEncoder();

/**
 * The crop is handed to the canvas, not drawn: nothing is rastered on the graphics card, whose
 * process may restart meanwhile (it runs out of memory on a large canvas elsewhere in the window), and
 * a canvas drawn there before such a restart encodes as an empty picture without a word.
 */
async function encode(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const renderer = canvas.getContext('bitmaprenderer');
  if (!renderer) {
    bitmap.close();
    throw new Error('Could not create a drawing surface for a map tessera.');
  }
  renderer.transferFromImageBitmap(bitmap);
  return encoder.encode(canvas, TESSERA_QUALITY);
}

function serve(port: MessagePort): void {
  port.onmessage = async (event: MessageEvent<EncoderRequest>) => {
    const { id, bitmap } = event.data;
    let reply: EncoderReply;
    try {
      reply = { id, blob: bitmap ? await encode(bitmap) : null };
    } catch (error) {
      reply = { id, error: error instanceof Error ? error.message : String(error) };
    }
    port.postMessage(reply);
  };
}

serveWorker<EncoderSetup>((setup) => serve(setup.port));
