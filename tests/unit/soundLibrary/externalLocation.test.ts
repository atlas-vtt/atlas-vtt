import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalLocation } from '../../../src/app/soundLibrary/externalLocation';
import type { NodeFsModule } from '../../../src/app/soundLibrary/nodeFiles';
import { SoundPathError, SoundPathTakenError, TrashUnavailableError } from '../../../src/app/soundLibrary/soundLocation';

let base: string;
let root: string;
const trashed: string[] = [];

const location = (trash = true): ExternalLocation => new ExternalLocation(root, {
  files: { fs: fs as unknown as NodeFsModule, sep: path.sep, home: os.homedir() },
  trashItem: trash ? async (absolute) => {
    trashed.push(absolute);
    fs.rmSync(absolute, { recursive: true });
  } : null,
  resourceUrl: (absolute) => `app://local${absolute}`,
});

const write = (relative: string, content = 'AUDIO'): void => {
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), content);
};

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-sound-'));
  root = path.join(base, 'Music');
  fs.mkdirSync(root);
  trashed.length = 0;
});

afterEach(() => fs.rmSync(base, { recursive: true, force: true }));

describe('listing a folder on disk', () => {
  it('gives folders and audio with size and time, in reading order, and nothing else', async () => {
    write('Track 10.mp3', 'LONGER');
    write('Track 2.flac');
    write('cover.jpg');
    write('.DS_Store');
    write('Battle/a.ogg');
    fs.mkdirSync(path.join(root, '.hidden'));
    const listing = await location().list('');
    expect(listing?.folders).toEqual([{ name: 'Battle', path: 'Battle' }]);
    expect(listing?.files.map((file) => file.name)).toEqual(['Track 2.flac', 'Track 10.mp3']);
    expect(listing?.files[1]).toMatchObject({ path: 'Track 10.mp3', size: 6 });
    expect(listing?.files[1]?.mtime).toBeGreaterThan(0);
  });

  it('reads a folder that is not there as nothing', async () => {
    await expect(location().list('gone')).resolves.toBeNull();
    fs.rmSync(root, { recursive: true });
    await expect(location().list('')).resolves.toBeNull();
  });
});

describe('a path that would leave the root', () => {
  it.each(['..', '../secret.mp3', 'a/../../secret.mp3', '/etc/passwd', 'a\\..\\b'])('is refused for %s', async (hostile) => {
    fs.writeFileSync(path.join(base, 'secret.mp3'), 'SECRET');
    const place = location();
    await expect(place.read(hostile)).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.stat(hostile)).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.trash(hostile)).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.move(hostile, 'x.mp3')).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.move('x.mp3', hostile)).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.makeFolder(hostile)).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.write(hostile, new Blob(['X']))).rejects.toBeInstanceOf(SoundPathError);
    expect(fs.readFileSync(path.join(base, 'secret.mp3'), 'utf8')).toBe('SECRET');
  });

  it('is refused through a symbolic link, and such a link is not listed', async () => {
    fs.mkdirSync(path.join(base, 'Outside'));
    fs.writeFileSync(path.join(base, 'Outside', 'secret.mp3'), 'SECRET');
    fs.symlinkSync(path.join(base, 'Outside'), path.join(root, 'link'));
    fs.symlinkSync(path.join(base, 'Outside', 'secret.mp3'), path.join(root, 'file.mp3'));
    const place = location();
    const listing = await place.list('');
    expect(listing?.folders).toEqual([]);
    expect(listing?.files).toEqual([]);
    await expect(place.read('link/secret.mp3')).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.read('file.mp3')).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.stat('link/secret.mp3')).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.write('link/new.mp3', new Blob(['X']))).rejects.toBeInstanceOf(SoundPathError);
    await expect(place.trash('link/secret.mp3')).rejects.toBeInstanceOf(SoundPathError);
    expect(fs.existsSync(path.join(base, 'Outside', 'new.mp3'))).toBe(false);
  });

  it('a link that stays inside is followed', async () => {
    write('Real/a.mp3');
    fs.symlinkSync(path.join(root, 'Real'), path.join(root, 'Alias'));
    fs.symlinkSync(path.join(root, 'Real', 'a.mp3'), path.join(root, 'b.mp3'));
    const listing = await location().list('');
    expect(listing?.folders.map((folder) => folder.name)).toEqual(['Alias', 'Real']);
    expect(listing?.files.map((file) => file.name)).toEqual(['b.mp3']);
  });
});

describe('reading and writing', () => {
  it('reads a file larger than a chunk whole', async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024 + 17, 'atlas');
    fs.writeFileSync(path.join(root, 'long.flac'), bytes);
    const blob = await location().read('long.flac');
    expect(blob.size).toBe(bytes.length);
    expect(Buffer.compare(Buffer.from(await blob.arrayBuffer()), bytes)).toBe(0);
  });

  it('writes a new file and never over one', async () => {
    const place = location();
    await place.write('new.mp3', new Blob(['NEW']));
    expect(fs.readFileSync(path.join(root, 'new.mp3'), 'utf8')).toBe('NEW');
    await expect(place.write('new.mp3', new Blob(['OTHER']))).rejects.toBeInstanceOf(SoundPathTakenError);
    expect(fs.readFileSync(path.join(root, 'new.mp3'), 'utf8')).toBe('NEW');
  });

  it('moves, and never over what is there', async () => {
    write('a.mp3', 'A');
    write('b.mp3', 'B');
    const place = location();
    await expect(place.move('a.mp3', 'b.mp3')).rejects.toBeInstanceOf(SoundPathTakenError);
    expect(fs.readFileSync(path.join(root, 'b.mp3'), 'utf8')).toBe('B');
    await place.move('a.mp3', 'c.mp3');
    expect(fs.existsSync(path.join(root, 'c.mp3'))).toBe(true);
  });
});

describe('deleting', () => {
  it('goes to the system trash', async () => {
    write('a.mp3');
    await location().trash('a.mp3');
    expect(trashed).toEqual([path.join(root, 'a.mp3')]);
  });

  it('is refused plainly without one, and the file stays', async () => {
    write('a.mp3');
    await expect(location(false).trash('a.mp3')).rejects.toBeInstanceOf(TrashUnavailableError);
    expect(fs.existsSync(path.join(root, 'a.mp3'))).toBe(true);
  });
});

it('watches the folder and lets go', async () => {
  const heard = vi.fn();
  const release = location().watch(heard);
  await new Promise((resolve) => { setTimeout(resolve, 50); });
  write('Battle/a.mp3');
  await vi.waitFor(() => expect(heard).toHaveBeenCalled(), { timeout: 5000 });
  release();
});

it('without a recursive watch on this system falls back on rescans', () => {
  const thrower = { ...fs, watch: () => { throw new Error('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'); } };
  const place = new ExternalLocation(root, { files: { fs: thrower as unknown as NodeFsModule, sep: path.sep, home: '' }, trashItem: null, resourceUrl: null });
  expect(() => place.watch(() => undefined)()).not.toThrow();
});
