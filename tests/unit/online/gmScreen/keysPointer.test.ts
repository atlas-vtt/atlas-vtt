// @vitest-environment jsdom
import { resolveObjectURL } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { plugKeysScreen } from '@/app/online/gmScreen/keys/atlasKeys';
import { ImageDisplayService } from '@/app/services/ImageDisplayService';
import { PlayerWindowService } from '@/app/services/PlayerWindowService';
import { noteDirector } from '@/app/soundDirector/directorRegistry';
import type { SoundDirector } from '@/app/soundDirector/SoundDirector';
import { MoodStore } from '@/app/soundLibrary/MoodStore';
import { HoveredElement } from '@/app/soundRemote/hoveredElement';
import { tableControlsStore } from '@/app/stores/tableControlsStore';
import { fakeRemoteDirector } from '../../../helpers/soundRemoteRig';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';
import { fakeTimers } from './fakeTimers.ts';
import { allowedDevice, heardOf, settleUntil } from './keysRig.ts';
import { deviceId, RelaySocket, sessionRig, type Device, type Rig } from './sessionRig.ts';

vi.mock('@/app/ui/notice', () => ({ showNotice: vi.fn() }));
vi.mock('@/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal: vi.fn() }));

/**
 * Sidekick's handout key as Atlas wires it (`plugKeysScreen`): the element under this computer's pointer is
 * followed in the real document, and a device's press shows the vault image there in the player window.
 */

const PHONE = deviceId('p');
const ART = 'Art/handout.png';
/** The handout file's bytes, which the player window's image must hold. */
const BYTES = 'the handout';
const VAULT = '/home/gm/Vault';
/** The resource URL Obsidian's desktop app gives a vault image. */
const SRC = `app://1a2b3c${VAULT}/${ART}?1700000000000`;
const EMBED = `<div class="internal-embed media-embed image-embed is-loaded" src="handout.png" alt="handout.png"><img alt="handout.png" src="${SRC}"></div>`;

let app: App;
let playerDoc: Document;

beforeEach(() => {
  RelaySocket.all = [];
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  tableControlsStore.setState({ curtain: false, paused: false, online: false });
  ({ app } = createInMemoryApp({ files: { [ART]: BYTES } }));
  // As the desktop adapter: resource URLs name files under the vault's folder
  Object.assign(app.vault.adapter, { getFullPath: (path: string) => `${VAULT}/${path}` });
  // No map open and no file active: the keys read the map's state through these
  Object.assign(app.workspace, { getActiveViewOfType: () => null, getActiveFile: () => null });
  noteDirector(app, fakeRemoteDirector() as unknown as SoundDirector);
  new ImageDisplayService(app);
  playerDoc = document.implementation.createHTMLDocument('player');
  const playerWindow = Object.assign(new EventTarget(), { document: playerDoc }) as unknown as Window;
  vi.spyOn(PlayerWindowService, 'getInstance').mockReturnValue({ isWindowOpen: () => true, getWindow: () => playerWindow, isFrozen: () => false, isTrueScale: () => false } as unknown as PlayerWindowService);
});

afterEach(() => {
  noteDirector(app, null);
  MoodStore.release(app);
  ImageDisplayService.getInstance()?.destroy();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

/** A running session with Sidekick's Keys screen plugged in as Atlas plugs it, and a phone connected. */
async function sidekick(): Promise<{ rig: Rig; phone: Device }> {
  const rig = sessionRig();
  plugKeysScreen(app, rig.session, fakeTimers());
  await rig.session.start();
  rig.socket().welcome();
  await rig.settle();
  return { rig, phone: await allowedDevice(rig, PHONE) };
}

let presses = 0;
/** The phone presses the handout key; Atlas's answer: null where it showed an image, else why not. */
async function pressHandout(rig: Rig, phone: Device): Promise<string | null> {
  const id = (presses += 1);
  expect(await phone.say({ t: 'press', id, command: { type: 'showHoveredImage' } })).toBe(true);
  await settleUntil(rig, () => heardOf(phone, 'press-answer').some((answer) => answer.id === id));
  return heardOf(phone, 'press-answer').find((answer) => answer.id === id)?.refused ?? null;
}

/** Lays `html` out in the main window and moves the pointer onto the element `selector` names. */
function hover(html: string, selector: string): void {
  document.body.innerHTML = html;
  const target = document.body.querySelector(selector);
  if (target === null) throw new Error(`nothing at ${selector}`);
  target.dispatchEvent(new Event('pointerover', { bubbles: true }));
}

/** The bytes of the image the player window shows, once it has been read. */
async function shownInPlayerWindow(rig: Rig): Promise<string | undefined> {
  await settleUntil(rig, () => playerDoc.querySelector('.atlas-image-display__image') !== null);
  const src = playerDoc.querySelector('.atlas-image-display__image')?.getAttribute('src') ?? '';
  return resolveObjectURL(src)?.text();
}

/** The `pointerover` listeners standing on the main window's document. */
function pointerWatchers(): () => number {
  const add = vi.spyOn(document, 'addEventListener');
  const remove = vi.spyOn(document, 'removeEventListener');
  const over = (calls: ReadonlyArray<readonly unknown[]>): number => calls.filter(([type]) => type === 'pointerover').length;
  return () => over(add.mock.calls) - over(remove.mock.calls);
}

const PLACES: ReadonlyArray<{ place: string; html: string; target: string }> = [
  {
    place: 'an image embedded in a note in reading view',
    html: `<div class="workspace-leaf"><div class="workspace-leaf-content" data-type="markdown"><div class="view-content"><div class="markdown-reading-view"><div class="markdown-preview-view markdown-rendered"><div class="markdown-preview-sizer"><div><p>${EMBED}</p></div></div></div></div></div></div></div>`,
    target: 'img',
  },
  {
    place: 'a Markdown image in a note in reading view',
    html: `<div class="workspace-leaf"><div class="workspace-leaf-content" data-type="markdown"><div class="view-content"><div class="markdown-reading-view"><div class="markdown-preview-view markdown-rendered"><p><img alt="" src="${SRC}"></p></div></div></div></div></div>`,
    target: 'img',
  },
  {
    place: 'an image embedded in a note in live preview',
    html: `<div class="workspace-leaf"><div class="workspace-leaf-content" data-type="markdown"><div class="view-content"><div class="markdown-source-view cm-s-obsidian mod-cm6 is-live-preview"><div class="cm-editor"><div class="cm-scroller"><div class="cm-sizer"><div class="cm-contentContainer"><div class="cm-content" contenteditable="true"><div class="cm-line">Before</div>${EMBED.replace('alt="handout.png">', 'alt="handout.png" contenteditable="false">')}<div class="cm-line">After</div></div></div></div></div></div></div></div></div></div>`,
    target: 'img',
  },
  {
    place: 'an image in a link\'s hover preview',
    html: `<div class="popover hover-popover"><div class="markdown-embed is-loaded"><div class="markdown-embed-content"><div class="markdown-preview-view markdown-rendered node-insert-event"><div class="markdown-preview-sizer"><div><p>${EMBED}</p></div></div></div></div></div></div>`,
    target: 'img',
  },
  {
    place: 'an image in a note Atlas\'s note preview window shows',
    html: `<div class="atlas-vtt-plugin atlas-vtt-root"><div class="atlas-note-preview-window"><div class="atlas-note-preview-content"><div class="workspace-leaf-content atlas-embedded-leaf-view" data-type="markdown"><div class="view-content"><div class="markdown-reading-view"><div class="markdown-preview-view markdown-rendered"><p>${EMBED}</p></div></div></div></div></div></div></div>`,
    target: 'img',
  },
  {
    place: 'a token\'s portrait in the statblock preview window, under its ring',
    html: `<div class="atlas-statblock-preview-window"><div class="atlas-statblock-preview-window__content"><div class="atlas-fantasy-statblock"><div class="atlas-statblock"><div class="atlas-token-portrait"><div class="atlas-token-image-wrapper"><img src="${SRC}" alt="Goblin" draggable="false"></div><div class="atlas-token-ring"></div></div><h2 class="atlas-sb-heading">Goblin</h2></div></div></div></div>`,
    target: '.atlas-token-ring',
  },
];

describe('Sidekick\'s handout key shows the image under this computer\'s pointer', () => {
  it.each(PLACES)('in $place', async ({ html, target }) => {
    const { rig, phone } = await sidekick();
    hover(html, target);
    expect(await pressHandout(rig, phone)).toBeNull();
    expect(await shownInPlayerWindow(rig)).toBe(BYTES);
  });

  it('and answers that there is none where the pointer rests on no vault image', async () => {
    const { rig, phone } = await sidekick();
    hover('<div class="markdown-preview-view"><p>Text</p><img src="https://example.com/map.png"></div>', 'img');
    expect(await pressHandout(rig, phone)).toBe('no-image');
  });
});

describe('the pointer is followed for Sidekick', () => {
  it('only while a device is connected: not before, not after the last one leaves, the session stops or Atlas lets it go', async () => {
    const watchers = pointerWatchers();
    const rig = sessionRig();
    plugKeysScreen(app, rig.session, fakeTimers());
    await rig.session.start();
    rig.socket().welcome();
    await rig.settle();
    expect(watchers()).toBe(0);

    await allowedDevice(rig, PHONE);
    expect(watchers()).toBe(1);
    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    expect(watchers()).toBe(0);

    rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    expect(watchers()).toBe(1);
    rig.session.stop();
    expect(watchers()).toBe(0);

    await rig.session.start();
    rig.socket().welcome([{ id: PHONE, name: 'Phone' }]);
    await rig.settle();
    expect(watchers()).toBe(1);
    rig.session.close();
    expect(watchers()).toBe(0);
  });

  it('beside the Stream Deck\'s own follower: either one stopping leaves the other hearing the pointer', async () => {
    const image = `<div class="markdown-preview-view">${EMBED}</div>`;
    const streamDeck = new HoveredElement(app.workspace);
    streamDeck.start();
    const { rig, phone } = await sidekick();

    rig.socket().receive({ t: 'player-left', id: PHONE });
    await rig.settle();
    hover(image, 'img');
    expect(streamDeck.element()).toBe(document.body.querySelector('img'));

    rig.socket().receive({ t: 'player-joined', id: PHONE, name: 'Phone' });
    await rig.settle();
    streamDeck.dispose();
    hover(image, 'img');
    expect(await pressHandout(rig, phone)).toBeNull();
    expect(await shownInPlayerWindow(rig)).toBe(BYTES);
  });
});
