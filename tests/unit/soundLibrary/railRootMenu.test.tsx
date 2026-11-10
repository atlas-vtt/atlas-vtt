// @vitest-environment jsdom
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OriginalsChoice } from '../../../src/app/soundLibrary/SoundRoots';
import { libraryRig, type LibraryRig } from '../../helpers/libraryRig';

let rig: LibraryRig;
let host: HTMLElement;

async function mounted(originals: OriginalsChoice | null): Promise<void> {
  rig = await libraryRig({ local: { music: '/m' }, originals });
  rig.locations.music.addFile('a.mp3');
  host = document.body.createDiv();
  rig.mount(host);
  await waitFor(() => expect(host.querySelector('section[aria-label="Music"] .atlas-sound-lib__more')).not.toBeNull());
}

/** Opens the music root's menu and gives the labels of its items. */
async function menuItems(): Promise<string[]> {
  fireEvent.click(host.querySelector<HTMLElement>('section[aria-label="Music"] .atlas-sound-lib__more')!);
  await waitFor(() => expect(document.body.querySelector('[role="menuitem"]')).not.toBeNull());
  return [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => item.textContent ?? '');
}

function press(label: string): void {
  const item = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((one) => one.textContent === label);
  if (!item) throw new Error(`No item ${label}`);
  fireEvent.click(item);
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});

afterEach(() => {
  rig.unmount();
  cleanup();
  host.remove();
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
});

describe('a root\'s menu in the rail', () => {
  it('offers to keep the originals from now on where they go to the trash', async () => {
    await mounted('trash');
    const items = await menuItems();
    expect(items).toContain('Keep originals from now on');
    expect(items).not.toContain('Move originals to the trash from now on');
    press('Keep originals from now on');
    expect(rig.roots.originalsOf('music')).toBe('keep');
  });

  it('offers the trash from now on where the originals are kept and the folder has a trash', async () => {
    await mounted('keep');
    const items = await menuItems();
    expect(items).toContain('Move originals to the trash from now on');
    expect(items).not.toContain('Keep originals from now on');
    press('Move originals to the trash from now on');
    expect(rig.roots.originalsOf('music')).toBe('trash');
  });

  it('never offers the trash where the folder has none', async () => {
    await mounted('keep');
    rig.locations.music.trashable = false;
    const items = await menuItems();
    expect(items.filter((item) => item.includes('originals'))).toEqual([]);
  });

  it('offers neither before the GM chose', async () => {
    await mounted(null);
    const items = await menuItems();
    expect(items.filter((item) => item.includes('originals'))).toEqual([]);
    expect(items).toEqual(['Prepare all', 'Change folder', 'Unlink']);
  });
});
