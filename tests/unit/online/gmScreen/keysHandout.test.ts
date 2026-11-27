// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import { takeOverImageDisplay } from '@/app/online/gm/image/imageTakeover';
import { remoteTableOf } from '@/app/plugin/soundRemoteTable';
import { ImageDisplayService } from '@/app/services/ImageDisplayService';
import { PlayerWindowService } from '@/app/services/PlayerWindowService';
import type { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { tableControlsStore } from '@/app/stores/tableControlsStore';
import { allowedDevice, heardOf, keysRig, settleUntil, soundWorld, type KeysRig } from './keysRig.ts';
import { deviceId, RelaySocket, type Device } from './sessionRig.ts';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));
vi.mock('@/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn() }));

const PHONE = deviceId('p');
/** A 1 × 1 PNG. */
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (char) => char.charCodeAt(0));
const handout = new TFile('Art/handout.png');

const app = {
  workspace: { getActiveViewOfType: () => null, getLeavesOfType: () => [], getActiveFile: () => null },
  vault: { getAbstractFileByPath: (path: string) => (path === handout.path ? handout : null), readBinary: () => Promise.resolve(PNG.buffer), adapter: {} },
  metadataCache: { getFirstLinkpathDest: (link: string) => (link === 'handout.png' ? handout : null) },
} as unknown as App;

/** The element under the GM's pointer at this computer: an image in a note, or nothing. */
const pointer: { on: Element | null } = { on: null };
const table = remoteTableOf(app, { element: () => pointer.on } as unknown as HoveredElement);

function hoverHandout(): void {
  document.body.innerHTML = '<div class="markdown-preview-view"><div class="internal-embed image-embed" src="handout.png"><img src="data:image/png;base64,AA=="></div></div>';
  pointer.on = document.body.querySelector('img');
}

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  tableControlsStore.setState({ curtain: false, paused: false, online: false });
  if (!('createObjectURL' in URL)) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => 'blob:handout' });
  if (!('revokeObjectURL' in URL)) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: () => undefined });
  new ImageDisplayService(app);
  pointer.on = null;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const answers = (device: Device): Array<string | null> => heardOf(device, 'press-answer').map((answer) => answer.refused);
const handoutOn = (device: Device): boolean | undefined => heardOf(device, 'keys').at(-1)?.state.player.handout;

/** Lets the image arrive and the keys' once-a-second look send what changed, until the device holds `shown`. */
async function deviceHolds(rig: KeysRig, device: Device, shown: boolean): Promise<void> {
  await settleUntil(rig, () => {
    rig.tick(1000);
    return handoutOn(device) === shown;
  });
}

/** One press shows the image under the pointer, the next takes it back, and the device is told each time. */
async function showAndTakeBack(): Promise<void> {
  const rig = await keysRig(soundWorld(), table);
  const phone = await allowedDevice(rig, PHONE);
  expect(handoutOn(phone)).toBe(false);
  await rig.press(phone, 1, { type: 'showHoveredImage' });
  hoverHandout();
  await rig.press(phone, 2, { type: 'showHoveredImage' });
  await deviceHolds(rig, phone, true);
  await rig.press(phone, 3, { type: 'takeBackHandout' });
  await deviceHolds(rig, phone, false);
  await rig.press(phone, 4, { type: 'takeBackHandout' });
  expect(answers(phone)).toEqual(['no-image', null, null, 'no-handout']);
}

describe('the handout key on a device', () => {
  it('with only a local player window: shows the image under the pointer there and takes it back', async () => {
    const playerDoc = document.implementation.createHTMLDocument('player');
    const playerWindow = Object.assign(new EventTarget(), { document: playerDoc }) as unknown as Window;
    vi.spyOn(PlayerWindowService, 'getInstance').mockReturnValue({ isWindowOpen: () => true, getWindow: () => playerWindow, isFrozen: () => false, isTrueScale: () => false } as unknown as PlayerWindowService);
    await showAndTakeBack();
    expect(ImageDisplayService.getInstance()?.isImageDisplayed()).toBe(false);
  });

  it('at an online table without a player window: shows its players the image under the pointer and takes it back', async () => {
    tableControlsStore.setState({ online: true });
    const share = { isShown: false, shows: 0, show: async (): Promise<'shown'> => ((share.shows += 1), (share.isShown = true), 'shown'), dismiss: (): boolean => ((share.isShown = false), true) };
    const takeover = takeOverImageDisplay<TFile>(ImageDisplayService.getInstance(), {
      share: () => share,
      readFile: () => Promise.resolve({ bytes: PNG, mime: 'image/png' }),
      pathOf: (file) => file.path,
      localWindowOpen: () => false,
      notice: () => undefined,
    });
    await showAndTakeBack();
    expect(share.shows).toBe(1);
    expect(share.isShown).toBe(false);
    takeover?.end();
  });
});
