/**
 * Messages between the tessera core (`TesseraEncoderPool`) and a tessera encoder worker
 * (`tesseraEncoderWorker.ts`), over a `MessageChannel` port the page handed to both.
 */

/** A tessera's crop to encode, transferred; null asks whether the encoder runs. */
export interface EncoderRequest {
  id: number;
  bitmap: ImageBitmap | null;
}

/**
 * The encoded tessera's bytes and type, transferred (null answering a ping), or why it could not be
 * encoded. Not a Blob: an encoder allocates too little to collect garbage often, and a Blob it
 * handed out kept its bytes alive there until it did (the renderer held some 170 MB more at the end
 * of an 8200 × 6800 map's build).
 */
export type EncoderReply = { id: number; encoded: { bytes: ArrayBuffer; type: string } | null } | { id: number; error: string };

/** The page's first message to an encoder: the port the core sends it tesserae on. */
export interface EncoderSetup {
  port: MessagePort;
}
