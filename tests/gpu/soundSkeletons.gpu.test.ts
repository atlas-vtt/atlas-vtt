import { act } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { SoundPane } from '@/app/react/components/dm-screen/sound/SoundPane';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import type { LibraryRig } from '../helpers/libraryRig';
import { ATLAS_DARK, mockLibrary, settled, stageFrame } from './sound/libraryScene';

/** What the Sound page shows while it loads: skeletons in the shape of what comes, moved by the compositor alone. */

/** The properties every animation running inside `root` changes, pseudo-elements included. */
function animatedProperties(root: Element): string[] {
  const properties = new Set<string>();
  for (const animation of root.getAnimations({ subtree: true })) {
    if (!(animation.effect instanceof KeyframeEffect)) continue;
    for (const keyframe of animation.effect.getKeyframes()) {
      for (const property of Object.keys(keyframe)) {
        if (!['offset', 'computedOffset', 'easing', 'composite'].includes(property)) properties.add(property);
      }
    }
  }
  return [...properties].sort();
}

/** Something moves, and only what the compositor moves without the main thread. */
function expectCompositorOnly(root: Element): void {
  const moved = animatedProperties(root);
  expect(moved.length).toBeGreaterThan(0);
  for (const property of moved) expect(['opacity', 'transform']).toContain(property);
}

const gate = (): { wait: Promise<void>; open: () => void } => {
  let open = (): void => undefined;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
};

const boxOf = (element: Element | null): DOMRect => {
  if (!element) throw new Error('Nothing there');
  return element.getBoundingClientRect();
};

describe('the Sound page while it loads', () => {
  let rig: LibraryRig | null = null;
  let frame: ReturnType<typeof stageFrame> | null = null;

  afterEach(() => {
    rig?.unmount();
    rig = null;
    frame?.remove();
    frame = null;
  });

  it('stands the tags still to come in the rail, in the tags\' own shape, while a root is first read', async () => {
    await page.viewport(1644, 960);
    const walk = gate();
    rig = await mockLibrary();
    const music = rig.locations.music;
    const list = music.list.bind(music);
    music.list = async (folder) => {
      if (folder !== '') await walk.wait;
      return list(folder);
    };
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, createElement(SoundPane, { active: true }));
    await expect.poll(() => document.querySelectorAll('section[aria-label="Music"] .atlas-sound-lib__tags-waiting .atlas-sound-lib__tag').length).toBe(5);
    const group = document.querySelector('section[aria-label="Music"] .atlas-sound-lib__tags-waiting')!;
    expect(group.getAttribute('role')).toBe('status');
    const waiting = [...group.querySelectorAll('.atlas-sound-lib__tag')].map((line) => boxOf(line));
    expectCompositorOnly(group);

    walk.open();
    await expect.poll(() => rig!.library.isWalked('music')).toBe(true);
    await settled();
    expect(document.querySelector('section[aria-label="Music"] .atlas-sound-lib__tags-waiting')).toBeNull();
    const tags = [...document.querySelectorAll('section[aria-label="Music"] button.atlas-sound-lib__tag')].map((tag) => boxOf(tag));
    // The first tag takes the first line's place, in its height and width.
    expect(tags[0]?.top).toBeCloseTo(waiting[0]!.top, 0);
    expect(tags[0]?.left).toBeCloseTo(waiting[0]!.left, 0);
    expect(tags[0]?.width).toBeCloseTo(waiting[0]!.width, 0);
    for (const line of waiting) expect(line.height).toBeCloseTo(tags[0]!.height, 0);
  });

  it('holds a length\'s place with a breathing bar while it is read, and the length takes it without a shift', async () => {
    await page.viewport(1644, 960);
    const lengths = gate();
    rig = await mockLibrary({ probe: async () => { await lengths.wait; return 222; } });
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, createElement(SoundPane, { active: true }));
    await expect.poll(() => rig!.library.isWalked('music')).toBe(true);
    await expect.poll(() => document.querySelectorAll('.atlas-sound-lib__length .atlas-skeleton[data-live]').length, { timeout: 5000 }).toBeGreaterThan(5);
    const cell = document.querySelector('.atlas-sound-lib__row[role="row"] .atlas-sound-lib__length')!;
    const before = boxOf(cell);
    expectCompositorOnly(cell);
    lengths.open();
    await expect.poll(() => cell.textContent).toBe('3:42');
    expect(cell.querySelector('.atlas-skeleton')).toBeNull();
    const after = boxOf(cell);
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.left).toBeCloseTo(before.left, 0);
  });

  it('stands tiles in the grid\'s own cells while the moods are read, and the moods take their places', async () => {
    await page.viewport(1644, 960);
    rig = await mockLibrary();
    const store = MoodStore.forApp(rig.app);
    await store.whenLoaded();
    const loaded = store.isLoaded.bind(store);
    let read = false;
    store.isLoaded = () => read && loaded();
    frame = stageFrame(ATLAS_DARK);
    rig.mount(frame.host, createElement(SoundPane, { active: true }));
    await settled();
    const placeholders = [...document.querySelectorAll('.atlas-sound-mood__wait')];
    expect(placeholders).toHaveLength(6);
    expectCompositorOnly(document.querySelector('.atlas-sound-moods')!);
    const first = boxOf(placeholders[0]!);
    expect(first.height).toBe(104);

    read = true;
    act(() => {
      for (let index = 0; index < 4; index++) store.createMood({ name: `Mood ${index}`, fadeSeconds: 2, music: 'none', layers: [] });
    });
    await expect.poll(() => document.querySelectorAll('.atlas-sound-mood').length).toBe(4);
    expect(document.querySelector('.atlas-sound-mood__wait')).toBeNull();
    const tile = boxOf(document.querySelector('.atlas-sound-mood'));
    expect(tile.top).toBeCloseTo(first.top, 0);
    expect(tile.left).toBeCloseTo(first.left, 0);
    expect(tile.width).toBeCloseTo(first.width, 0);
    expect(tile.height).toBeCloseTo(first.height, 0);
  });
});
