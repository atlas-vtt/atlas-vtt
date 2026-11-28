import { describe, expect, it, vi } from 'vitest';
import { BackdropScreen } from '../../../../src/app/online/gmScreen/backdrop/BackdropScreen.ts';
import { backdropCut } from '../../../../src/app/online/gmScreen/backdrop/cutBackdrop.ts';
import { parseDeviceMessage, parseGmScreenMessage, type BackdropPicture, type GmScreenMessage } from '../../../../src/app/online/protocol/index.ts';

/** A screen whose campaign shows `art`, cutting a picture that names the image and the size it was cut to. */
function rig(art: string | null = 'Maps/World.webp') {
  const world = { art };
  const sent: { message: GmScreenMessage; to: string | undefined }[] = [];
  const devices = ['phone', 'tablet'];
  const cut = vi.fn((path: string, width: number, height: number): Promise<BackdropPicture> => Promise.resolve({ mime: 'image/webp', data: btoa(`${path}@${width}x${height}`.padEnd(24, '.')) }));
  const screen = new BackdropScreen({ art: () => Promise.resolve(world.art), cut, outlet: { send: (message, to) => sent.push({ message, to }), devices } });
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  const pictures = (to: string): (string | null)[] => sent.filter((each) => each.to === to && each.message.t === 'backdrop').map((each) => {
    const message = each.message as Extract<GmScreenMessage, { t: 'backdrop' }>;
    return message.picture === null ? null : atob(message.picture.data).replace(/\.+$/, '');
  });
  return { screen, world, cut, pictures, settle };
}

describe('the picture behind Sidekick\'s screens, on Atlas\'s side', () => {
  it('sends a device the played campaign\'s world map cut to its screen, once for each size it asks', async () => {
    const { screen, cut, pictures, settle } = rig();
    screen.message('phone', { t: 'backdrop-ask', width: 1170, height: 2532 });
    screen.message('phone', { t: 'backdrop-ask', width: 1170, height: 2532 });
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532']);
    // Turned on its side: another cut
    screen.message('phone', { t: 'backdrop-ask', width: 2532, height: 1170 });
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532', 'Maps/World.webp@2532x1170']);
    expect(cut).toHaveBeenCalledTimes(2);
  });

  it('sends it again when the channel opens anew, from the cut it kept, and to nobody it does not know the size of', async () => {
    const { screen, cut, pictures, settle } = rig();
    screen.message('phone', { t: 'backdrop-ask', width: 1170, height: 2532 });
    await settle();
    screen.opened('phone');
    screen.opened('tablet');
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532', 'Maps/World.webp@1170x2532']);
    expect(pictures('tablet')).toEqual([]);
    expect(cut).toHaveBeenCalledTimes(1);
  });

  it('follows the played campaign: another world map, or none, goes to every device whose size it knows; the same one goes to nobody', async () => {
    const { screen, world, pictures, settle } = rig();
    screen.message('phone', { t: 'backdrop-ask', width: 1170, height: 2532 });
    screen.message('tablet', { t: 'backdrop-ask', width: 2048, height: 1536 });
    await settle();
    screen.changed();
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532']);
    world.art = 'Maps/Coast.webp';
    screen.changed();
    await settle();
    world.art = null;
    screen.changed();
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532', 'Maps/Coast.webp@1170x2532', null]);
    expect(pictures('tablet')).toEqual(['Maps/World.webp@2048x1536', 'Maps/Coast.webp@2048x1536', null]);
  });

  it('forgets a removed device\'s size: the next campaign is not sent to it', async () => {
    const { screen, world, pictures, settle } = rig();
    screen.message('phone', { t: 'backdrop-ask', width: 1170, height: 2532 });
    await settle();
    screen.forgotten('phone');
    world.art = 'Maps/Coast.webp';
    screen.changed();
    await settle();
    expect(pictures('phone')).toEqual(['Maps/World.webp@1170x2532']);
  });
});

describe('where a screen cuts a map', () => {
  it('reads the map so it covers the screen at the screen\'s pixels, and takes its middle', () => {
    // A wide map on a phone held upright: as tall as the screen, its middle the screen's width
    const upright = backdropCut(6600, 5098, 1170, 2532);
    expect(upright.readSide).toBe(Math.round(6600 * (2532 / 5098)));
    expect(upright.crop(3278, 2532)).toEqual({ x: 1054, y: 0, width: 1170, height: 2532 });
    // A gigapixel map is never read past 8192 px, and the cut keeps the screen's shape
    const huge = backdropCut(100_000, 20_000, 1170, 2532);
    expect(huge.readSide).toBe(8192);
    const crop = huge.crop(8192, 1638);
    expect(crop.height).toBe(1638);
    expect(Math.abs(crop.width / crop.height - 1170 / 2532)).toBeLessThan(0.002);
  });

  it('reads both messages as sent, and nothing malformed', () => {
    expect(parseDeviceMessage({ t: 'backdrop-ask', width: 1170, height: 2532 })).toEqual({ t: 'backdrop-ask', width: 1170, height: 2532 });
    for (const bad of [{ t: 'backdrop-ask', width: 0, height: 10 }, { t: 'backdrop-ask', width: 5000, height: 10 }, { t: 'backdrop-ask', width: 1.5, height: 10 }]) expect(parseDeviceMessage(bad)).toBeNull();
    expect(parseGmScreenMessage({ t: 'backdrop', picture: null })).toEqual({ t: 'backdrop', picture: null });
    expect(parseGmScreenMessage({ t: 'backdrop', picture: { mime: 'image/webp', data: 'UklGRg==' } })).toEqual({ t: 'backdrop', picture: { mime: 'image/webp', data: 'UklGRg==' } });
    for (const bad of [{ mime: 'image/svg+xml', data: 'UklGRg==' }, { mime: 'image/webp', data: 'not base64!' }, { mime: 'image/webp', data: 'A'.repeat(4 * 250_000) }]) {
      expect(parseGmScreenMessage({ t: 'backdrop', picture: bad })).toBeNull();
    }
  });
});
