import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { obsidianHttp } from '../../../src/app/account/obsidianHttp.ts';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));

const request = { url: 'https://play.atlas-vtt.dev/api/me', method: 'GET', authorization: 'Bearer secret' } as const;

describe('obsidianHttp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs why a request failed, without the token, and still throws', async () => {
    vi.mocked(requestUrl).mockRejectedValue(new Error('net::ERR_CONNECTION_RESET'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(obsidianHttp(request)).rejects.toThrow('net::ERR_CONNECTION_RESET');
    expect(warn).toHaveBeenCalledWith('[Atlas] GET https://play.atlas-vtt.dev/api/me failed: net::ERR_CONNECTION_RESET');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('logs a rate limit or server error, but not an expected refusal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(requestUrl).mockResolvedValue({ status: 429, json: { error: 'account-rate' } } as never);
    expect(await obsidianHttp(request)).toEqual({ status: 429, json: { error: 'account-rate' } });
    vi.mocked(requestUrl).mockResolvedValue({ status: 401, json: { error: 'signed-out' } } as never);
    await obsidianHttp(request);
    expect(warn.mock.calls).toEqual([['[Atlas] GET https://play.atlas-vtt.dev/api/me answered 429 (account-rate)']]);
  });

  it('sends a part as bytes with its own headers, and the token only from `authorization`', async () => {
    vi.mocked(requestUrl).mockResolvedValue({ status: 204, json: null } as never);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await obsidianHttp({
      url: 'https://api.atlas-vtt.dev/v1/armarium/uploads/u1/parts/1',
      method: 'PUT',
      authorization: 'Bearer secret',
      headers: { 'x-atlas-part-sha256': 'abc', authorization: 'Bearer forged' },
      bytes,
    });
    expect(vi.mocked(requestUrl).mock.calls.at(-1)?.[0]).toEqual({
      url: 'https://api.atlas-vtt.dev/v1/armarium/uploads/u1/parts/1',
      method: 'PUT',
      headers: { 'x-atlas-part-sha256': 'abc', Authorization: 'Bearer secret' },
      body: bytes,
      contentType: 'application/octet-stream',
      throw: false,
    });
  });

  it('names an Armarium refusal\'s code when a server error is logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(requestUrl).mockResolvedValue({ status: 503, json: { code: 'internal' } } as never);
    await obsidianHttp({ url: 'https://api.atlas-vtt.dev/v1/armarium/uploads/eligibility', method: 'DELETE' });
    expect(warn.mock.calls).toEqual([['[Atlas] DELETE https://api.atlas-vtt.dev/v1/armarium/uploads/eligibility answered 503 (internal)']]);
  });
});
