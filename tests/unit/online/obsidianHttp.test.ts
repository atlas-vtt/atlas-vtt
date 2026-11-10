import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestUrl } from 'obsidian';
import { obsidianHttp } from '../../../src/app/online/gm/account/obsidianHttp.ts';

vi.mock('obsidian', async (original) => ({ ...(await original<typeof import('obsidian')>()), requestUrl: vi.fn() }));

const request = { url: 'https://play.atlas-vtt.dev/api/me', method: 'GET', authorization: 'Bearer secret' } as const;

describe('obsidianHttp', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs why a request failed, without the token, and still throws', async () => {
    vi.mocked(requestUrl).mockRejectedValue(new Error('net::ERR_CONNECTION_RESET'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(obsidianHttp(request)).rejects.toThrow('net::ERR_CONNECTION_RESET');
    expect(warn).toHaveBeenCalledWith('[Atlas] Online play: GET https://play.atlas-vtt.dev/api/me failed: net::ERR_CONNECTION_RESET');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
  });

  it('logs a rate limit or server error, but not an expected refusal', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(requestUrl).mockResolvedValue({ status: 429, json: { error: 'account-rate' } } as never);
    expect(await obsidianHttp(request)).toEqual({ status: 429, json: { error: 'account-rate' } });
    vi.mocked(requestUrl).mockResolvedValue({ status: 401, json: { error: 'signed-out' } } as never);
    await obsidianHttp(request);
    expect(warn.mock.calls).toEqual([['[Atlas] Online play: GET https://play.atlas-vtt.dev/api/me answered 429 (account-rate)']]);
  });
});
