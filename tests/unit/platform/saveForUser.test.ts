import { describe, expect, it, vi } from 'vitest';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { EXPORTS_FOLDER, fileShare, saveForUser, type FileSharing, type SaveDevice } from '../../../src/app/platform/saveForUser';

const ZIP = 'application/zip';

interface Told { message: string; share: (() => void) | null }

/** A device as a test wants it, with what it downloaded and what it told the user. */
function device(desktop: boolean, sharing?: Partial<FileSharing>): SaveDevice & { downloads: Array<{ blob: Blob; name: string }>; said: Told[] } {
  const downloads: Array<{ blob: Blob; name: string }> = [];
  const said: Told[] = [];
  return { desktop, sharing, downloads, said, download: (blob, name) => { downloads.push({ blob, name }); }, told: (message, share) => { said.push({ message, share }); } };
}

describe('a file for the user in the desktop app', () => {
  it('is downloaded as it is, and the vault is left alone', async () => {
    const { app, files, folders } = createInMemoryApp();
    const blob = new Blob(['zip'], { type: ZIP });
    const desktop = device(true);

    expect(await saveForUser(app, 'Crypt v2.atlas-collection.zip', blob, ZIP, desktop)).toEqual({ kind: 'download' });

    expect(desktop.downloads).toEqual([{ blob, name: 'Crypt v2.atlas-collection.zip' }]);
    expect(desktop.downloads[0]?.blob).toBe(blob);
    expect(desktop.said).toEqual([]);
    expect([...files.keys()]).toEqual([]);
    expect(folders.has(EXPORTS_FOLDER)).toBe(false);
  });

  it('wraps bytes handed over as a buffer in a blob of their type', async () => {
    const { app } = createInMemoryApp();
    const desktop = device(true);

    await saveForUser(app, 'report.txt', new TextEncoder().encode('abc').buffer, 'text/plain', desktop);

    expect(desktop.downloads[0]?.blob.type).toBe('text/plain');
    expect(await desktop.downloads[0]?.blob.text()).toBe('abc');
  });
});

describe('a file for the user on a tablet', () => {
  it('is written into the exports folder byte for byte, and the user is told where', async () => {
    const { app } = createInMemoryApp();
    const bytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00, 0x80]);
    const tablet = device(false);

    const saved = await saveForUser(app, 'Crypt v2.atlas-collection.zip', new Blob([bytes], { type: ZIP }), ZIP, tablet);

    expect(saved).toEqual({ kind: 'vault', path: 'atlas-vtt/exports/Crypt v2.atlas-collection.zip' });
    expect(tablet.downloads).toEqual([]);
    const file = app.vault.getFileByPath('atlas-vtt/exports/Crypt v2.atlas-collection.zip');
    expect(file).not.toBeNull();
    expect(new Uint8Array(await app.vault.readBinary(file!))).toEqual(bytes);
    expect(tablet.said).toEqual([{ message: 'Saved Crypt v2.atlas-collection.zip in atlas-vtt/exports.', share: null }]);
  });

  it('numbers a name that is taken, in any letter case', async () => {
    const { app } = createInMemoryApp({ files: { 'atlas-vtt/exports/crypt.ZIP': 'old' } });
    const tablet = device(false);

    const first = await saveForUser(app, 'Crypt.zip', new Blob(['a']), ZIP, tablet);
    const second = await saveForUser(app, 'Crypt.zip', new Blob(['b']), ZIP, tablet);

    expect(first).toEqual({ kind: 'vault', path: 'atlas-vtt/exports/Crypt-2.zip' });
    expect(second).toEqual({ kind: 'vault', path: 'atlas-vtt/exports/Crypt-3.zip' });
    expect(tablet.said.map(({ message }) => message)).toEqual(['Saved Crypt-2.zip in atlas-vtt/exports.', 'Saved Crypt-3.zip in atlas-vtt/exports.']);
  });

  it('gives the file a name the vault takes', async () => {
    const { app } = createInMemoryApp();

    const saved = await saveForUser(app, 'Inn: "The Gilded #1"?.zip', new Blob(['a']), ZIP, device(false));

    expect(saved).toEqual({ kind: 'vault', path: 'atlas-vtt/exports/Inn- -The Gilded -1--.zip' });
  });

  it('offers the share sheet where the system takes the file, and shares the saved file on a press', async () => {
    const { app } = createInMemoryApp();
    const share = vi.fn(async (_data?: ShareData): Promise<void> => undefined);
    const canShare = vi.fn((data?: ShareData) => (data?.files?.length ?? 0) === 1);
    const tablet = device(false, { share, canShare });

    await saveForUser(app, 'Crypt.zip', new Blob(['zip'], { type: ZIP }), ZIP, tablet);

    expect(share).not.toHaveBeenCalled();
    tablet.said[0]?.share?.();
    const shared = share.mock.calls[0]?.[0]?.files?.[0];
    expect(shared?.name).toBe('Crypt.zip');
    expect(shared?.type).toBe(ZIP);
    expect(await shared?.text()).toBe('zip');
  });
});

describe('the share sheet', () => {
  const file = new File(['zip'], 'Crypt.zip', { type: ZIP });

  it.each<[string, Partial<FileSharing> | undefined]>([
    ['a web view without it', undefined],
    ['one that shares but cannot be asked', { share: async () => undefined }],
    ['one that takes no files of the type', { share: async () => undefined, canShare: () => false }],
    ['one whose answer throws', { share: async () => undefined, canShare: () => { throw new TypeError('files'); } }],
  ])('is not offered by %s', (_what, sharing) => {
    expect(fileShare(sharing, file)).toBeNull();
  });

  it('says nothing when the user closes it', async () => {
    const share = vi.fn(async () => { throw new DOMException('Share canceled', 'AbortError'); });
    const offered = fileShare({ share, canShare: () => true }, file);

    expect(() => offered?.()).not.toThrow();
    await Promise.resolve();
    expect(share).toHaveBeenCalledOnce();
  });
});
