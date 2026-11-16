// @vitest-environment jsdom
import { act, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { registerSoundDirector } from '../../../src/app/plugin/soundDirector';
import { SettingsService } from '../../../src/app/services/SettingsService';
import type { SoundKind } from '../../../src/app/sound/soundTypes';
import { ConversionConsentModal, type ConversionConsentOptions } from '../../../src/app/soundLibrary/ConversionConsentModal';
import { SoundLibrary } from '../../../src/app/soundLibrary/SoundLibrary';
import { SoundRoots, type OriginalsChoice } from '../../../src/app/soundLibrary/SoundRoots';
import { FakeSoundLocation } from '../../helpers/fakeSoundLocation';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn(() => ({ setMessage: vi.fn(), hide: vi.fn() })) }));

interface Made {
  library: SoundLibrary;
  destroyed: boolean;
  /** Roots opened on a disk after the library was destroyed: a walk and a watch nobody lets go of. */
  openedAfter: number;
}

let rig: LibraryRig;
let made: Made[];
let asked: ConversionConsentOptions[];

/** Opens the app's library as `SoundLibrary.forApp` would, over one disk and this device's facts, which outlive it. */
function libraries(app: App): void {
  const location = new FakeSoundLocation();
  location.addFile('Battle/a.mp3');
  location.addFile('Calm/b.mp3');
  const local: Partial<Record<SoundKind, string>> = { music: '/m' };
  let originals: OriginalsChoice | null = null;
  const open = (): SoundLibrary => {
    const roots = new SoundRoots({
      shared: () => ({ music: { type: 'external' } }),
      setShared: () => undefined,
      onSharedChange: () => () => undefined,
      local: (kind) => local[kind] ?? null,
      setLocal: () => undefined,
      localOriginals: () => originals,
      setLocalOriginals: (_kind, choice) => { originals = choice; },
      vaultBase: () => null,
      realPath: async (path) => path,
    });
    const entry: Made = { library: null as unknown as SoundLibrary, destroyed: false, openedAfter: 0 };
    entry.library = new SoundLibrary({
      roots,
      open: () => {
        if (entry.destroyed) entry.openedAfter++;
        return location;
      },
      probeSeconds: async () => null,
    });
    const destroy = entry.library.destroy.bind(entry.library);
    entry.library.destroy = (): void => {
      entry.destroyed = true;
      destroy();
    };
    made.push(entry);
    SoundLibrary.provide(app, entry.library);
    return entry.library;
  };
  SoundLibrary.release(app);
  vi.spyOn(SoundLibrary, 'forApp').mockImplementation((asking) => SoundLibrary.opened(asking) ?? open());
}

const setSwitch = (on: boolean): void => {
  act(() => SettingsService.forApp(rig.app)?.setExperimental('sound', on));
};

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  made = [];
  asked = [];
  rig = await libraryRig();
  libraries(rig.app);
  vi.spyOn(ConversionConsentModal.prototype, 'open').mockImplementation(function (this: ConversionConsentModal) {
    asked.push((this as unknown as { options: ConversionConsentOptions }).options);
  });
  vi.mocked(SettingsService.forApp(rig.app)!.isExperimentalOn).mockRestore();
  // Settings read late would put the switch back.
  await SettingsService.forApp(rig.app)!.initialize();
  setSwitch(true);
});

afterEach(() => {
  rig.unmount();
  vi.restoreAllMocks();
});

describe('sound switched off and on again', () => {
  it('consent and the folder watch follow the live library: a choice given then converts in the background', async () => {
    const request = vi.spyOn(rig.director.shelf, 'request');
    registerSoundDirector({
      app: rig.app,
      addCommand: vi.fn(),
      removeCommand: vi.fn(),
      addStatusBarItem: () => document.createElement('div'),
      register: vi.fn(),
      registerInterval: vi.fn(),
    } as never);
    SoundLibrary.forApp(rig.app).rescan();
    await waitFor(() => expect(asked).toHaveLength(1));

    setSwitch(false);
    expect(made[0]?.destroyed, 'switching off releases the library').toBe(true);
    setSwitch(true);
    SoundLibrary.forApp(rig.app).rescan();
    await waitFor(() => expect(asked, 'the folder is asked about on the live library').toHaveLength(2));
    request.mockClear();
    act(() => asked[1]!.onChoose('keep'));

    expect(SoundLibrary.forApp(rig.app).roots.originalsOf('music')).toBe('keep');
    await waitFor(() => expect(request.mock.calls.flatMap(([sounds]) => sounds.map((sound) => sound.filePath)).sort()).toEqual([
      'atlas-sound:music/Battle/a.mp3',
      'atlas-sound:music/Calm/b.mp3',
    ]), { timeout: 4000 });
    expect(made, 'one library per time sound is on').toHaveLength(2);
    expect(made[0]?.openedAfter, 'nothing opens roots on the library released').toBe(0);
  });
});
