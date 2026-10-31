import { field } from '../atlasLighting.ts';
import type { VaultImage } from '../TokenShare.ts';
import type { ImageShare, ShowResult } from './ImageShare.ts';
import { t } from '../../../i18n';

export const SHOWN_TEXT = t('online.image.shown');
export const HIDDEN_TEXT = t('online.image.hidden');
const REFUSALS: Readonly<Record<Exclude<ShowResult, 'shown' | 'replaced'>, string>> = {
  'too-large': t('online.image.tooLarge'),
  unreadable: t('online.image.unreadable'),
};

/** The three calls of Atlas's image display (`ImageDisplayService`) the takeover stands in front of. */
const TAKEN = ['displayImageOnPlayerView', 'closeImageDisplay', 'isImageDisplayed'] as const;
type TakenName = (typeof TAKEN)[number];

interface AtlasImageDisplay<File> {
  displayImageOnPlayerView: (file: File) => Promise<void>;
  closeImageDisplay: () => void;
  isImageDisplayed: () => boolean;
}

export interface ImageTakeoverPorts<File> {
  /** The running table's shown image, or null while no table runs. */
  share(): Pick<ImageShare, 'show' | 'dismiss' | 'isShown'> | null;
  /** The file as players can be sent it, or null when it is no image they can be sent. */
  readFile(file: File): Promise<VaultImage | null>;
  /** The file's vault path, which the table's log keeps on the GM's side. */
  pathOf(file: File): string;
  /** Whether Atlas's own player window is open: only then is Atlas asked to show the image there. */
  localWindowOpen(): boolean;
  notice(text: string): void;
}

/** A takeover under way. */
export interface ImageDisplayTakeover {
  /** Takes the image away from the players online and from Atlas's own window, saying nothing of its own (the GM's control does). */
  hide(): void;
  /** Gives Atlas its calls back. */
  end(): void;
}

function asImageDisplay<File>(service: unknown): AtlasImageDisplay<File> | null {
  return TAKEN.every((name) => typeof field(service, name) === 'function') ? (service as AtlasImageDisplay<File>) : null;
}

/**
 * Stands in front of Atlas's image display, so "Display on player view" (every menu that offers it,
 * the command and the ribbon) and "Dismiss image from player view" reach the players online too.
 * While a table runs: an image goes to its players, and to Atlas's own player window only while that
 * is open (Atlas would otherwise say that it is not); dismissing, from the command or the window's
 * own ×, takes it away from both; and Atlas's dismiss command is offered while players online still
 * see one. Without a table every call is Atlas's own. Null for an Atlas whose service has no such calls.
 */
export function takeOverImageDisplay<File>(service: unknown, ports: ImageTakeoverPorts<File>): ImageDisplayTakeover | null {
  const display = asImageDisplay<File>(service);
  if (display === null) return null;
  const own: Record<TakenName, unknown> = display;
  const atlas = { show: display.displayImageOnPlayerView, close: display.closeImageDisplay, isShown: display.isImageDisplayed };
  // A call Atlas keeps on the service itself is put back; one of its class shows again once ours is gone.
  const kept = new Map(TAKEN.filter((name) => Object.hasOwn(display, name)).map((name) => [name, own[name]] as const));
  const showOnline = async (share: Pick<ImageShare, 'show'>, file: File): Promise<void> => {
    // A file that cannot be read or hashed is one that cannot be shown: the menu's click never throws.
    const result = await share.show(() => ports.readFile(file), ports.pathOf(file)).catch(() => 'unreadable' as const);
    if (result === 'replaced') return;
    ports.notice(result === 'shown' ? SHOWN_TEXT : REFUSALS[result]);
  };
  const ours: AtlasImageDisplay<File> = {
    displayImageOnPlayerView: async (file) => {
      const share = ports.share();
      if (share === null) return atlas.show.call(display, file);
      await Promise.all([showOnline(share, file), ports.localWindowOpen() ? atlas.show.call(display, file) : undefined]);
    },
    closeImageDisplay: () => {
      const local = atlas.isShown.call(display);
      atlas.close.call(display);
      // Atlas says so itself when its own window showed the image.
      if (ports.share()?.dismiss() === true && !local) ports.notice(HIDDEN_TEXT);
    },
    isImageDisplayed: () => atlas.isShown.call(display) || ports.share()?.isShown === true,
  };
  Object.assign(display, ours);
  return {
    hide: () => {
      atlas.close.call(display);
      ports.share()?.dismiss();
    },
    end: () => {
      for (const name of TAKEN) {
        // Another hand on the call since: it is left alone.
        if (own[name] !== ours[name]) continue;
        if (kept.has(name)) own[name] = kept.get(name);
        else delete own[name];
      }
    },
  };
}

/**
 * Keeps Atlas's image display taken over for as long as a table runs, on the service Atlas has now:
 * a reloaded Atlas has a new one, which is taken at the next look.
 */
export class ImageTakeover<File> {
  private readonly service: () => unknown;
  private readonly ports: ImageTakeoverPorts<File>;
  private taken: { readonly service: unknown; readonly takeover: ImageDisplayTakeover } | null = null;

  constructor(service: () => unknown, ports: ImageTakeoverPorts<File>) {
    this.service = service;
    this.ports = ports;
  }

  /** Looks again: takes the service over while a table runs, and gives it back otherwise. */
  sync(): void {
    const service = this.ports.share() === null ? null : this.service() ?? null;
    if (this.taken !== null && this.taken.service !== service) this.dispose();
    if (service === null || this.taken !== null) return;
    const takeover = takeOverImageDisplay(service, this.ports);
    if (takeover !== null) this.taken = { service, takeover };
  }

  /** Takes the shown image away from the players online, and from Atlas's own window where that shows it too. */
  hide(): void {
    if (this.taken !== null) this.taken.takeover.hide();
    else this.ports.share()?.dismiss();
  }

  /** Gives Atlas its image display back. */
  dispose(): void {
    this.taken?.takeover.end();
    this.taken = null;
  }
}
