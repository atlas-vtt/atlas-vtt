import { describe, expect, it } from 'vitest';
import { MANIFEST_URL, readPublishedVersion, type FetchText } from '../../../src/app/updates/publishedVersion';

const answer = (status: number, text: string): FetchText => async () => ({ status, text });
const manifest = (fields: Record<string, unknown>): string => JSON.stringify({ id: 'atlas-vtt', version: '0.9.0', ...fields });
const anyApp = (): boolean => true;

describe('readPublishedVersion', () => {
  it('reads the version of the manifest Obsidian installs from', async () => {
    let asked = '';
    const fetch: FetchText = async (url) => { asked = url; return { status: 200, text: manifest({}) }; };
    expect(await readPublishedVersion(fetch, anyApp)).toBe('0.9.0');
    expect(asked).toBe(MANIFEST_URL);
  });

  it.each([
    ['a missing file', answer(404, 'Not Found')],
    ['a failed request', (async () => { throw new Error('offline'); }) as FetchText],
    ['a page that is no JSON', answer(200, '<html>')],
    ['another plugin', answer(200, manifest({ id: 'other' }))],
    ['a beta', answer(200, manifest({ version: '0.9.0-beta.1' }))],
    ['a version that is no text', answer(200, manifest({ version: 9 }))],
    ['a body far too large', answer(200, manifest({ pad: 'x'.repeat(70_000) }))],
  ])('knows nothing from %s', async (_name, fetch) => {
    expect(await readPublishedVersion(fetch, anyApp)).toBeNull();
  });

  it('knows nothing of a release this Obsidian cannot install', async () => {
    const supports = (min: string): boolean => min !== '9.0.0';
    expect(await readPublishedVersion(answer(200, manifest({ minAppVersion: '9.0.0' })), supports)).toBeNull();
    expect(await readPublishedVersion(answer(200, manifest({ minAppVersion: '1.8.7' })), supports)).toBe('0.9.0');
  });
});
