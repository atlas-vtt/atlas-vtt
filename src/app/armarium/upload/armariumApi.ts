import { ACCOUNTS_ORIGIN } from '../../account/accountServers';
import { field, type Http, type HttpRequest, type HttpResponse } from '../../account/http';
import { DECLARATION, type ListingFields, type OwnListing, type SubmissionView, type UploadEligibility, type UploadTicket } from './uploadContract';
import { parseEligibility, parseOwnListing, parseSubmission, parseTicket, readFieldProblems } from './uploadReaders';

/** The Armarium's API, on the account service's origin: the only place the plugin sends the token for it. */
export const ARMARIUM_API = `${ACCOUNTS_ORIGIN}/v1/armarium`;

/** A refusal of the Armarium API with its code; `network` when no answer came, `internal` for one Atlas cannot read. */
export class ArmariumError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly until: string | null = null,
    /** With `bad-fields`: each listing field that is wrong, and its problem. */
    readonly problems: Readonly<Record<string, string>> | null = null,
  ) {
    super(code);
    this.name = 'ArmariumError';
  }
}

/** The code of whatever stopped a call: an `ArmariumError`'s own, `internal` for anything else. */
export function failureOf(error: unknown): { status: number; code: string; until: string | null } {
  if (error instanceof ArmariumError) return { status: error.status, code: error.code, until: error.until };
  return { status: 0, code: 'internal', until: null };
}

export interface ArmariumApiPorts {
  readonly http: Http;
  /** The account's token, read at each call; null while signed out. */
  readonly token: () => string | null;
  /** A route refused the token (401): the account forgets it. */
  readonly signedOut: () => void;
}

const uploadPath = (id: string): string => `/uploads/${encodeURIComponent(id)}`;

/**
 * The upload and publish routes a signed-in GM uses from Atlas, each with the account's token as a bearer and no
 * cookie (a device request). Answers are read through `uploadReaders`, which refuses a shape it does not know as
 * `internal`. A 401 forgets the token for everyone, except on the optional read of one's own listings.
 */
export class ArmariumApi {
  constructor(private readonly ports: ArmariumApiPorts) {}

  async eligibility(): Promise<UploadEligibility> {
    return parseEligibility(await this.json({ method: 'GET', path: '/uploads/eligibility' }));
  }

  async ticket(fileName: string, bytes: number): Promise<UploadTicket> {
    return parseTicket(await this.json({ method: 'POST', path: '/uploads', json: { fileName, bytes } }));
  }

  async putPart(id: string, n: number, bytes: ArrayBuffer, sha256: string): Promise<void> {
    await this.call({ method: 'PUT', path: `${uploadPath(id)}/parts/${n}`, bytes, headers: { 'x-atlas-part-sha256': sha256 } });
  }

  /** Joins the parts and asks for the check. Safe to send again. */
  async complete(id: string): Promise<SubmissionView> {
    return parseSubmission(await this.json({ method: 'POST', path: `${uploadPath(id)}/complete`, json: {} }));
  }

  async submission(id: string): Promise<SubmissionView> {
    return parseSubmission(await this.json({ method: 'GET', path: uploadPath(id) }));
  }

  /** Takes back what is neither under a check nor public. */
  async discard(id: string): Promise<void> {
    await this.call({ method: 'DELETE', path: uploadPath(id), json: {} });
  }

  async putListing(id: string, fields: ListingFields): Promise<SubmissionView> {
    return parseSubmission(await this.json({ method: 'PUT', path: `${uploadPath(id)}/listing`, json: { ...fields } }));
  }

  /** Publishes a checked bundle with the declaration in the wording Atlas showed (`DECLARATION`). */
  async publish(id: string): Promise<SubmissionView> {
    return parseSubmission(await this.json({ method: 'POST', path: `${uploadPath(id)}/publish`, json: { declaration: true, declarationVersion: DECLARATION.version } }));
  }

  /**
   * The account's listing of the collection `uid`, from My uploads: what an update's form starts from, and where its
   * page is. Optional: whatever stops it answers null, and a refusal here never signs the GM out.
   */
  async ownListing(uid: string): Promise<OwnListing | null> {
    try {
      const mine = await this.json({ method: 'GET', path: '/mine' }, { optional: true });
      const listings = field(mine, 'listings');
      if (!Array.isArray(listings)) return null;
      return listings.map(parseOwnListing).find((listing) => listing?.uid === uid) ?? null;
    } catch {
      return null;
    }
  }

  private async json(request: ApiRequest, options: CallOptions = {}): Promise<unknown> {
    return (await this.call(request, options)).json;
  }

  private async call(request: ApiRequest, { optional = false }: CallOptions = {}): Promise<HttpResponse> {
    const token = this.ports.token();
    if (token === null) throw new ArmariumError(401, 'signed-out');
    const { path, ...rest } = request;
    const sent: HttpRequest = { ...rest, url: `${ARMARIUM_API}${path}`, authorization: `Bearer ${token}` };
    let response: HttpResponse;
    try {
      response = await this.ports.http(sent);
    } catch {
      throw new ArmariumError(0, 'network');
    }
    if (response.status >= 200 && response.status < 300) return response;
    const code = field(response.json, 'code') ?? field(response.json, 'error');
    const until = field(response.json, 'until');
    if (response.status === 401 && !optional && this.ports.token() === token) this.ports.signedOut();
    throw new ArmariumError(
      response.status,
      typeof code === 'string' && code !== '' ? code : response.status === 401 ? 'signed-out' : 'internal',
      typeof until === 'string' ? until : null,
      readFieldProblems(response.json),
    );
  }
}

type ApiRequest = Omit<HttpRequest, 'url' | 'authorization'> & { readonly path: string };

interface CallOptions {
  readonly optional?: boolean;
}
