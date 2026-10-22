import { Component, Menu, setIcon, type EmbedContext, type FileEmbed, type TFile } from 'obsidian';
import { skeletonPhase } from '../packages/components/primitives/skeletonPhase';
import { runInBackground } from '../utils/backgroundTask';
import { t } from '../i18n';
import './atlas-link-embed.scss';

/** What an embed card shows once its file is read. */
export interface EmbedCardContent {
  title: string;
  /** A second line under the title: the collection, a token count. */
  meta?: string;
  /** Fills the art area; it shows a breathing placeholder until then. */
  art: (artEl: HTMLElement) => void;
  action: EmbedCardAction;
  /** Further ways to hand the file to Atlas, in a menu beside the button. */
  more?: readonly EmbedCardAction[];
}

export interface EmbedCardAction {
  label: string;
  icon: string;
  run: () => Promise<void>;
  /** Shown when `run` fails. */
  failure: string;
}

/**
 * An Atlas file embedded in a note (`![[Tavern.atlasmap]]`) or shown in a link's
 * hover preview, in the look of the map preview of a note pin: the art edge to
 * edge, its name over a shade along the bottom, and one button that hands it
 * to Atlas, shown while the pointer is over the card or the button has focus.
 */
export abstract class AtlasLinkEmbed extends Component implements FileEmbed {
  protected readonly artEl: HTMLElement;
  private readonly captionEl: HTMLElement;

  constructor(protected readonly ctx: EmbedContext, protected readonly file: TFile, protected readonly subpath: string) {
    super();
    ctx.containerEl.addClass('atlas-link-embed');
    const card = ctx.containerEl.createDiv({ cls: 'atlas-link-embed__card' });
    this.artEl = card.createDiv({ cls: 'atlas-link-embed__art' });
    this.artEl.createDiv({ cls: 'atlas-image-placeholder' }).style.setProperty('--atlas-skeleton-phase', skeletonPhase());
    this.captionEl = card.createDiv({ cls: 'atlas-link-embed__caption' });
  }

  /** Reads what the card shows; Obsidian calls it once the embed is added to its note. */
  async loadFile(): Promise<void> {
    this.render(await this.content());
  }

  protected abstract content(): Promise<EmbedCardContent>;

  private render(content: EmbedCardContent): void {
    const placeholder = this.artEl.querySelector('.atlas-image-placeholder');
    content.art(this.artEl);
    placeholder?.remove();

    this.captionEl.empty();
    const text = this.captionEl.createDiv({ cls: 'atlas-link-embed__text' });
    text.createDiv({ cls: 'atlas-link-embed__title', text: content.title });
    if (content.meta) text.createDiv({ cls: 'atlas-link-embed__meta', text: content.meta });
    this.renderAction(content.action);
    if (content.more?.length) this.renderMore(content.more);
  }

  private renderAction(action: EmbedCardAction): void {
    const button = this.captionEl.createEl('button', { cls: 'atlas-link-embed__action mod-cta' });
    setIcon(button.createSpan({ cls: 'atlas-link-embed__action-icon' }), action.icon);
    button.createSpan({ text: action.label });
    this.onPress(button, () => this.run(action));
  }

  private renderMore(actions: readonly EmbedCardAction[]): void {
    const button = this.captionEl.createEl('button', { cls: 'atlas-link-embed__action atlas-link-embed__more', attr: { 'aria-label': t('atlasLinks.more'), 'aria-haspopup': 'menu' } });
    setIcon(button.createSpan({ cls: 'atlas-link-embed__action-icon' }), 'more-horizontal');
    this.onPress(button, (event) => {
      const menu = new Menu();
      for (const action of actions) menu.addItem((item) => item.setTitle(action.label).setIcon(action.icon).onClick(() => this.run(action)));
      menu.showAtMouseEvent(event);
    });
  }

  /** A press on `button` does `act` and nothing else: live preview would place the cursor in the link's source on a press inside the embed. */
  private onPress(button: HTMLElement, act: (event: MouseEvent) => void): void {
    this.registerDomEvent(button, 'mousedown', (event) => event.stopPropagation());
    this.registerDomEvent(button, 'click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      act(event);
    });
  }

  private run(action: EmbedCardAction): void {
    runInBackground(action.run(), `Opening ${this.file.path} from a link`, action.failure);
  }
}

/**
 * Fills `artEl` with an image that fades in over the placeholder once it can
 * be painted, or with `fallbackIcon` when it cannot be read.
 */
export function addRevealImage(artEl: HTMLElement, src: string, alt: string, fallbackIcon: string): void {
  const placeholder = artEl.createDiv({ cls: 'atlas-image-placeholder' });
  placeholder.style.setProperty('--atlas-skeleton-phase', skeletonPhase());
  const image = artEl.createEl('img', { cls: 'atlas-link-embed__image atlas-image-reveal', attr: { src, alt, draggable: 'false', decoding: 'async' } });
  const settle = (): void => {
    image.dataset.shown = '';
    placeholder.dataset.settled = '';
  };
  if (image.complete && image.naturalWidth > 0) {
    settle();
    return;
  }
  image.addEventListener('load', settle, { once: true });
  image.addEventListener('error', () => {
    image.remove();
    placeholder.remove();
    addArtIcon(artEl, fallbackIcon);
  }, { once: true });
}

/** Fills `artEl` with a large icon where a file has no art of its own. */
export function addArtIcon(artEl: HTMLElement, icon: string): void {
  setIcon(artEl.createDiv({ cls: 'atlas-link-embed__art-icon' }), icon);
}
