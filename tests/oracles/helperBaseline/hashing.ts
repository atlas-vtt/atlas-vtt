// Frozen from 29c9495a src/app/services/collectionBundle/hashing.ts. Only import paths are adapted.
/** Hex SHA-256 of `data`, the fingerprint bundles and install records compare content by. */
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** JSON with object keys sorted, so equal values always serialise to equal text. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  });
}

/** Fingerprint of a JSON value by content, independent of key order. */
export function hashJson(value: unknown): Promise<string> {
  return sha256(new TextEncoder().encode(canonicalJson(value)));
}
