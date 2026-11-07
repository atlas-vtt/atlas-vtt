// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { STARTER_FOLDER } from '../../../src/app/soundLibrary/starterPack';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

let rig: LibraryRig;

// The download itself is `starterPack.test.ts`'s: here it only lays the files down.
vi.mock('../../../src/app/soundLibrary/starterPack', async (original) => ({
  ...(await original<typeof import('../../../src/app/soundLibrary/starterPack')>()),
  installStarterPack: vi.fn(async (library: SoundLibrary) => {
    rig.locations.ambience.addFile(`${STARTER_FOLDER}/Cave.ogg`);
    rig.locations.ambience.addFile(`${STARTER_FOLDER}/Campfire.ogg`);
    await library.reread('ambience');
    await library.settle('ambience', [`${STARTER_FOLDER}/Cave.ogg`, `${STARTER_FOLDER}/Campfire.ogg`]);
  }),
}));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

let host: HTMLElement;

beforeEach(async () => {
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  rig.locations.ambience.addFile('Rain.ogg');
  host = document.body.createDiv({ cls: 'workspace-leaf mod-active' });
});

afterEach(() => {
  rig.unmount();
  host.remove();
});

describe('the starter ambience, once downloaded', () => {
  it('has its copies made at once, and only its own, so the first press plays without waiting', async () => {
    const request = vi.spyOn(rig.director.shelf, 'request');
    await act(async () => rig.mount(host));
    await waitFor(() => expect(host.querySelector('.atlas-sound-lib__starter')).not.toBeNull());
    await act(async () => host.querySelector<HTMLButtonElement>('.atlas-sound-lib__starter')?.click());
    await waitFor(() => expect(request).toHaveBeenCalled());
    const asked = request.mock.calls.flatMap(([sounds]) => sounds.map((sound) => sound.filePath));
    expect(asked.sort()).toEqual([`atlas-sound:ambience/${STARTER_FOLDER}/Campfire.ogg`, `atlas-sound:ambience/${STARTER_FOLDER}/Cave.ogg`]);
  });
});
