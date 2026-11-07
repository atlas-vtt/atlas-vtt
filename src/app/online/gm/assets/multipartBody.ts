/** One part of a form: its name, and its bytes with their type. */
export interface FormPart {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly type: string;
}

const encoder = new TextEncoder();

/**
 * A `multipart/form-data` body of `parts` (RFC 7578), each a file part under its name, as one
 * buffer `requestUrl` sends as it is, with the content type naming its boundary. `boundary` must
 * not occur in any part (a random one of 32 hex characters never does in practice).
 */
export function multipartBody(parts: readonly FormPart[], boundary: string): { readonly body: ArrayBuffer; readonly contentType: string } {
  const chunks: Uint8Array[] = [];
  for (const part of parts) {
    const filename = part.name.replace(/\//g, '_');
    chunks.push(encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${filename}"\r\nContent-Type: ${part.type}\r\n\r\n`), part.bytes, encoder.encode('\r\n'));
  }
  chunks.push(encoder.encode(`--${boundary}--\r\n`));
  const body = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return { body: body.buffer, contentType: `multipart/form-data; boundary=${boundary}` };
}
