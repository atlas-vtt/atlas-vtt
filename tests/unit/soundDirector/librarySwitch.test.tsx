// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { SettingsService } from '@/app/services/SettingsService';
import { SoundLibrary } from '@/app/soundLibrary/SoundLibrary';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

let rig: LibraryRig;

afterEach(() => rig.unmount());

function setSwitch(app: App, on: boolean): void {
  const settings = SettingsService.forApp(app)!;
  vi.mocked(settings.isExperimentalOn).mockImplementation((id) => id === 'sound' && on);
  settings.setSoundSettings({ masterDb: on ? 0 : -1 });
}

it('with the switch off no library is open and no disk watched; it comes back with the switch', async () => {
  rig = await libraryRig({ local: { music: '/m', ambience: '/a' } });
  const { app, library, locations } = rig;
  library.locationOf('music');
  expect(locations.music.watching).toBe(1);

  setSwitch(app, false);
  expect(SoundLibrary.opened(app)).toBeNull();
  expect(locations.music.watching).toBe(0);
  const walk = vi.spyOn(locations.music, 'list');
  await locations.music.makeFolder('New');
  await new Promise((resolve) => { setTimeout(resolve, 350); });
  expect(walk).not.toHaveBeenCalled();
  expect(rig.director.shelf.hasFile({ filePath: 'atlas-sound:music/a.mp3' } as never)).toBe(false);
  expect(SoundLibrary.opened(app)).toBeNull();

  setSwitch(app, true);
  expect(SoundLibrary.opened(app)).not.toBeNull();
});
