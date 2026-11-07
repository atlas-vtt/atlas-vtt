import { describe, expect, it } from 'vitest';
import type { ShowResult } from '../../../../src/app/online/gm/image/ImageShare.ts';
import { HIDDEN_TEXT, ImageTakeover, SHOWN_TEXT, takeOverImageDisplay, type ImageTakeoverPorts } from '../../../../src/app/online/gm/image/imageTakeover.ts';
import type { VaultImage } from '../../../../src/app/online/gm/TokenShare.ts';

/** What Atlas says when asked to display an image while its player window is closed. */
const ATLAS_WINDOW_CLOSED = 'Player window is not open. Please open it first.';
const ATLAS_CLOSED = 'Image display closed';

/** Atlas's image display as far as the takeover knows it: its calls on the class, its state and notices its own. */
class AtlasDisplay {
  windowOpen = false;
  shown: string | null = null;
  readonly notices: string[];

  constructor(notices: string[]) {
    this.notices = notices;
  }

  displayImageOnPlayerView(file: string): Promise<void> {
    if (!this.windowOpen) this.notices.push(ATLAS_WINDOW_CLOSED);
    else this.shown = file;
    return Promise.resolve();
  }

  closeImageDisplay(): void {
    if (this.shown === null) return;
    this.shown = null;
    this.notices.push(ATLAS_CLOSED);
  }

  isImageDisplayed(): boolean {
    return this.shown !== null;
  }
}

const CALLS = ['displayImageOnPlayerView', 'closeImageDisplay', 'isImageDisplayed'] as const;
/** A call as the service itself holds it, in front of its class's; undefined while it holds none. */
const held = (display: AtlasDisplay, name: (typeof CALLS)[number]): unknown => Object.getOwnPropertyDescriptor(display, name)?.value;
/** Whether every call is the class's own again: nothing stands in front of it. */
const isAtlasOwn = (display: AtlasDisplay): boolean => CALLS.every((name) => held(display, name) === undefined);

const IMAGE: VaultImage = { bytes: new Uint8Array([1, 2, 3]), mime: 'image/png' };

/** A running table's shown image, recorded: what was shown, and how each showing goes. */
class FakeShare {
  readonly shows: VaultImage[] = [];
  result: ShowResult = 'shown';
  isShown = false;

  async show(read: () => Promise<VaultImage | null>): Promise<ShowResult> {
    const image = await read();
    if (image === null) return 'unreadable';
    this.shows.push(image);
    if (this.result === 'shown') this.isShown = true;
    return this.result;
  }

  dismiss(): boolean {
    const was = this.isShown;
    this.isShown = false;
    return was;
  }
}

function setup(): { atlas: AtlasDisplay; table: { share: FakeShare | null }; notices: string[]; ports: ImageTakeoverPorts<string>; files: Map<string, VaultImage | null> } {
  const notices: string[] = [];
  const atlas = new AtlasDisplay(notices);
  const table = { share: new FakeShare() as FakeShare | null };
  const files = new Map<string, VaultImage | null>([['handout.png', IMAGE]]);
  const ports: ImageTakeoverPorts<string> = {
    share: () => table.share,
    readFile: (file) => Promise.resolve(files.get(file) ?? null),
    pathOf: (file) => `images/${file}.png`,
    localWindowOpen: () => atlas.windowOpen,
    notice: (text) => void notices.push(text),
  };
  return { atlas, table, notices, ports, files };
}

describe('the takeover of Atlas\'s image display', () => {
  it('shows an image to the players online and says so once, without Atlas\'s notice that its window is closed', async () => {
    const { atlas, table, notices, ports } = setup();
    takeOverImageDisplay(atlas, ports);
    await atlas.displayImageOnPlayerView('handout.png');
    expect(table.share?.shows).toEqual([IMAGE]);
    expect(notices).toEqual([SHOWN_TEXT]);
    expect(atlas.shown).toBeNull();
  });

  it('shows it in Atlas\'s own player window too while that is open', async () => {
    const { atlas, table, notices, ports } = setup();
    atlas.windowOpen = true;
    takeOverImageDisplay(atlas, ports);
    await atlas.displayImageOnPlayerView('handout.png');
    expect(table.share?.shows).toEqual([IMAGE]);
    expect(atlas.shown).toBe('handout.png');
    expect(notices).toEqual([SHOWN_TEXT]);
  });

  it('tells the GM why an image did not go online, and says nothing for one replaced meanwhile', async () => {
    const { atlas, table, notices, ports, files } = setup();
    takeOverImageDisplay(atlas, ports);
    await atlas.displayImageOnPlayerView('notes.pdf');
    expect(table.share?.shows).toEqual([]);
    files.set('broken.png', IMAGE);
    if (table.share !== null) table.share.result = 'unreadable';
    await atlas.displayImageOnPlayerView('broken.png');
    if (table.share !== null) table.share.result = 'too-large';
    await atlas.displayImageOnPlayerView('handout.png');
    expect(notices).toEqual(['This image cannot be shown online.', 'This image cannot be shown online.', 'This image is too large to show online.']);
    if (table.share !== null) table.share.result = 'replaced';
    await atlas.displayImageOnPlayerView('handout.png');
    expect(notices).toHaveLength(3);
    // A file that cannot be read is one that cannot be shown.
    ports.readFile = () => Promise.reject(new Error('gone'));
    await atlas.displayImageOnPlayerView('handout.png');
    expect(notices.at(-1)).toBe('This image cannot be shown online.');
  });

  it('dismisses for the players online with Atlas\'s own dismissal, the window\'s × too, and says so where Atlas does not', async () => {
    const { atlas, table, notices, ports } = setup();
    takeOverImageDisplay(atlas, ports);
    await atlas.displayImageOnPlayerView('handout.png');
    // Atlas's command is offered while players online still see the image, though its own window shows none.
    expect(atlas.isImageDisplayed()).toBe(true);
    notices.length = 0;
    atlas.closeImageDisplay();
    expect(table.share?.isShown).toBe(false);
    expect(atlas.isImageDisplayed()).toBe(false);
    expect(notices).toEqual([HIDDEN_TEXT]);
    // Shown in both: Atlas says that it closed, and that is the one notice.
    atlas.windowOpen = true;
    await atlas.displayImageOnPlayerView('handout.png');
    notices.length = 0;
    atlas.closeImageDisplay();
    expect(atlas.shown).toBeNull();
    expect(table.share?.isShown).toBe(false);
    expect(notices).toEqual([ATLAS_CLOSED]);
    // Nothing shown anywhere: nothing is said.
    atlas.closeImageDisplay();
    expect(notices).toEqual([ATLAS_CLOSED]);
  });

  it('hides the image from the control: online and in Atlas\'s own window, without a notice of the companion\'s', async () => {
    const { atlas, table, notices, ports } = setup();
    const share = table.share;
    const takeover = new ImageTakeover(() => atlas, ports);
    // Before Atlas is taken over (it loads later), the players online are all there is to hide from.
    if (share !== null) share.isShown = true;
    table.share = null;
    takeover.hide();
    expect(share?.isShown).toBe(true);
    table.share = share;
    takeover.hide();
    expect(share?.isShown).toBe(false);
    takeover.sync();
    atlas.windowOpen = true;
    await atlas.displayImageOnPlayerView('handout.png');
    notices.length = 0;
    takeover.hide();
    expect(share?.isShown).toBe(false);
    expect(atlas.shown).toBeNull();
    expect(notices).toEqual([ATLAS_CLOSED]);
    // Shown online only: gone without a word.
    atlas.windowOpen = false;
    await atlas.displayImageOnPlayerView('handout.png');
    notices.length = 0;
    takeover.hide();
    expect(share?.isShown).toBe(false);
    expect(notices).toEqual([]);
    takeover.dispose();
  });

  it('is Atlas\'s own again once it ends, and while no table runs', async () => {
    const { atlas, table, notices, ports } = setup();
    const taken = takeOverImageDisplay(atlas, ports);
    const share = table.share;
    table.share = null;
    await atlas.displayImageOnPlayerView('handout.png');
    expect(notices).toEqual([ATLAS_WINDOW_CLOSED]);
    expect(share?.shows).toEqual([]);
    expect(atlas.isImageDisplayed()).toBe(false);
    table.share = share;
    taken?.end();
    expect(isAtlasOwn(atlas)).toBe(true);
    await atlas.displayImageOnPlayerView('handout.png');
    expect(notices).toEqual([ATLAS_WINDOW_CLOSED, ATLAS_WINDOW_CLOSED]);
    expect(share?.shows).toEqual([]);
  });

  it('puts back a call Atlas keeps on the service itself, and leaves one alone that another hand took since', () => {
    const { atlas, ports } = setup();
    const own = (): boolean => false;
    atlas.isImageDisplayed = own;
    const taken = takeOverImageDisplay(atlas, ports);
    const theirs = (): void => undefined;
    atlas.closeImageDisplay = theirs;
    taken?.end();
    expect(held(atlas, 'isImageDisplayed')).toBe(own);
    expect(held(atlas, 'closeImageDisplay')).toBe(theirs);
    expect(held(atlas, 'displayImageOnPlayerView')).toBeUndefined();
  });

  it('takes nothing of an Atlas whose service has no such calls', () => {
    const { ports } = setup();
    for (const service of [undefined, null, 'service', {}, { displayImageOnPlayerView: (): void => undefined, closeImageDisplay: (): void => undefined }]) {
      expect(takeOverImageDisplay(service, ports)).toBeNull();
    }
  });

  it('holds only while a table runs, and takes the service of a reloaded Atlas', async () => {
    const { atlas, table, notices, ports } = setup();
    const share = table.share;
    table.share = null;
    let service: unknown = atlas;
    const takeover = new ImageTakeover(() => service, ports);
    takeover.sync();
    expect(isAtlasOwn(atlas)).toBe(true);
    table.share = share;
    takeover.sync();
    takeover.sync();
    expect(isAtlasOwn(atlas)).toBe(false);
    await atlas.displayImageOnPlayerView('handout.png');
    expect(share?.shows).toHaveLength(1);
    // Atlas reloads: its new service is taken, the old one given back.
    const reloaded = new AtlasDisplay(notices);
    service = reloaded;
    takeover.sync();
    expect(isAtlasOwn(atlas)).toBe(true);
    await reloaded.displayImageOnPlayerView('handout.png');
    expect(share?.shows).toHaveLength(2);
    // Atlas is switched off, then the table stops: nothing is held and nothing breaks.
    service = undefined;
    takeover.sync();
    expect(isAtlasOwn(reloaded)).toBe(true);
    service = reloaded;
    takeover.sync();
    expect(isAtlasOwn(reloaded)).toBe(false);
    table.share = null;
    takeover.sync();
    expect(isAtlasOwn(reloaded)).toBe(true);
    // The companion unloads while it holds the service: given back too.
    table.share = share;
    takeover.sync();
    takeover.dispose();
    expect(isAtlasOwn(reloaded)).toBe(true);
  });
});
