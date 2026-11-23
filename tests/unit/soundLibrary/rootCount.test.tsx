// @vitest-environment jsdom
import { cleanup, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

describe('the count beside a root in the rail', () => {
  let rig: LibraryRig;
  let host: HTMLElement;

  beforeEach(async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
    rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
    for (const path of ['Night/01 Dawn.opus', 'Night/01 Dawn.mp3', 'Night/02 Dusk.opus', 'Night/02 Dusk.mp3', 'Rain.opus']) rig.locations.music.addFile(path);
  });

  afterEach(() => {
    rig.unmount();
    host.remove();
    cleanup();
    Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  it('counts what the library lists: a kept original hidden behind its copy is not counted', async () => {
    // Converted with originals kept: each mp3 is its opus's twin, which the library does not list.
    vi.spyOn(rig.library, 'isCopied').mockImplementation((kind, path) => kind === 'music' && path.endsWith('.mp3'));
    host = document.body.createDiv();
    rig.mount(host);
    const rows = (): number => host.querySelectorAll('.atlas-sound-lib__row').length;
    await waitFor(() => expect(rows()).toBe(3));
    const music = host.querySelector<HTMLElement>('section[aria-label="Music"]')!;
    expect(music.querySelector('.atlas-sound-lib__root small')?.textContent).toBe('3');
    expect(music.querySelector('.atlas-sound-lib__tag small')?.textContent).toBe('2');
  });
});
