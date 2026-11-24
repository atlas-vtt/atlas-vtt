/**
 * Messages between the tessera core (`TesseraEncoderPool`) and a tessera encoder worker
 * (`tesseraEncoderWorker.ts`), over a `MessageChannel` port the page handed to both.
 */

/** A tessera's crop to encode, transferred; null asks whether the encoder runs. */
export interface EncoderRequest {
  id: number;
  bitmap: ImageBitmap | null;
}

/** The encoded tessera (null answering a ping), or why it could not be encoded. */
export type EncoderReply = { id: number; blob: Blob | null } | { id: number; error: string };

/** The page's first message to an encoder: the port the core sends it tesserae on. */
export interface EncoderSetup {
  port: MessagePort;
}
