import { createImageEncoder } from '../../imageProcessing/imageEncoder';
import { serveWorker } from '../../utils/nodeFreeWorker';
import type { EncoderReply, EncoderRequest, EncoderSetup } from './tesseraEncoderProtocol';
import { TESSERA_QUALITY } from './tesseraGraphics';

/**
 * Entry of a tessera encoder worker (`startTesseraEncoders`): encodes the crops the tessera core
 * sends on its port as `TesseraGraphics.encodeTessera` does. Bundled inline into main.js by Vite.
 */

const encoder = createImageEncoder();

async function encode(bitmap: ImageBitmap): Promise<Blob> {
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a drawing surface for a map tessera.');
    context.drawImage(bitmap, 0, 0);
    return await encoder.encode(canvas, TESSERA_QUALITY);
  } finally {
    bitmap.close();
  }
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
