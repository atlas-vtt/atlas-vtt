import { isRecord } from '../utils/guards';
import { isListingUid } from './armariumRequest';

/**
 * The requests the Armarium site's My uploads page may have Atlas send for it while it runs in Atlas' Armarium tab:
 * reading My uploads, editing a listing's text, taking a listing down, discarding an upload. The page has no session
 * in Atlas' frame, so Atlas sends these with its own account; it sends nothing else the page names.
 */

const PREFIX = '/v1/armarium';
/** A submission id as the Armarium makes them (UUIDs). */
const SUBMISSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The longest request id a page makes. */
const MAX_ID = 64;

export type PageRequestMethod = 'GET' | 'PATCH' | 'POST' | 'DELETE';

/** One of those requests, its path below the Armarium API (`/mine`, `/listings/<uid>`). */
export interface PageRequest {
  method: PageRequestMethod;
  path: string;
  /** A write's JSON body; an edit's fields, an empty object for the others. */
  body?: Record<string, unknown>;
}

/** The path below the API that `method` and the page's `path` name, where it is one of My uploads' requests; else null. */
function allowedPath(method: unknown, path: string): string | null {
  if (!path.startsWith(`${PREFIX}/`)) return null;
  const [kind, id, action, ...rest] = path.slice(PREFIX.length + 1).split('/');
  if (rest.length > 0) return null;
  if (method === 'GET' && kind === 'mine' && id === undefined) return '/mine';
  if (kind === 'listings' && isListingUid(id)) {
    if (method === 'PATCH' && action === undefined) return `/listings/${id}`;
    if (method === 'POST' && action === 'unpublish') return `/listings/${id}/unpublish`;
  }
  if (method === 'DELETE' && kind === 'uploads' && id !== undefined && SUBMISSION_ID.test(id) && action === undefined) return `/uploads/${id}`;
  return null;
}

/** The page's request `id` and what it asks, when it is one of My uploads' requests; null for anything else. */
export function readPageRequest(data: Record<string, unknown>): { id: string; request: PageRequest } | null {
  const { id, method, path, body } = data;
  if (typeof id !== 'string' || id === '' || id.length > MAX_ID || typeof path !== 'string') return null;
  const allowed = allowedPath(method, path);
  if (allowed === null) return null;
  const verb = method as PageRequestMethod;
  if (verb === 'GET') return { id, request: { method: verb, path: allowed } };
  if (body !== undefined && !isRecord(body)) return null;
  return { id, request: { method: verb, path: allowed, body: verb === 'PATCH' ? body ?? {} : {} } };
}
