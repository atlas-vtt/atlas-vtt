import { setIcon } from 'obsidian';
import type { IPreviewWindow, PreviewAnchor } from './NotePreviewUIManager';
import type { EncounterAsset } from '../packages/components/asset-manager/types';
import { createTokenPortrait } from '../packages/components/shared/tokenPortraitElement';
import { encounterFolderName, encounterFolderTrail } from '../encounters/encounterFolders';
import { tokenCountText } from '../encounters/encounterTokenCount';
import { animatePanelIn, animatePanelOutAndRemove } from '../ui/panelMotion';
import { placeHoverCard } from './hoverCardPlacement';
import { t } from '../i18n';
import './encounter-folder-preview.scss';

/** Token portraits a row shows of its encounter, overlapping. */
const ROW_PORTRAITS = 3;

export interface EncounterFolderPreviewOptions {
  folder: string;
  encounters: readonly EncounterAsset[];
  pin: PreviewAnchor;
  position: { x: number; y: number };
  /** The document of the window the pin was hovered in, which may be a popout's. */
  doc: Document;
  roll: () => void;
  place: (encounter: EncounterAsset) => void;
  /** The card has gone, by any path. */
  onClosed: (preview: EncounterFolderPreview) => void;
}

/**
 * The hover card of a pin that rolls encounters (Mod + hover, like a scene pin's): the folder,
 * every encounter in it with its tokens, each placed on a click, and Roll encounter, which does
 * what a click on the pin does.
 */
export class EncounterFolderPreview implements IPreviewWindow {
  readonly notePath: string;
  readonly originatingPin: PreviewAnchor;
  private wrapper: HTMLElement | null;
  private card: HTMLElement | null;
  private escapeHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(private readonly options: EncounterFolderPreviewOptions) {
    this.notePath = options.folder;
    this.originatingPin = options.pin;
    // Atlas styles are scoped to `.atlas-vtt-plugin`.
    this.wrapper = options.doc.body.createDiv({ cls: 'atlas-vtt-plugin atlas-vtt-root' });
    this.card = this.wrapper.createDiv({ cls: 'atlas-encounter-folder-preview', attr: { role: 'dialog', 'aria-label': encounterFolderName(options.folder) } });
    this.build(this.card);
    this.escapeHandler = (event): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      this.hide();
    };
    options.doc.addEventListener('keydown', this.escapeHandler, true);
    placeHoverCard(this.card, options.position.x, options.position.y);
    animatePanelIn(this.card);
  }

  get element(): HTMLElement | null {
    return this.wrapper;
  }

  setPosition(x: number, y: number): void {
    if (this.card) placeHoverCard(this.card, x, y);
  }

  getIsPinned(): boolean {
    return false;
  }

  hide(): void {
    const { card, wrapper } = this;
    if (!card || !wrapper) return;
    this.card = null;
    this.wrapper = null;
    if (this.escapeHandler) this.options.doc.removeEventListener('keydown', this.escapeHandler, true);
    this.escapeHandler = null;
    this.options.onClosed(this);
    animatePanelOutAndRemove(card, () => wrapper.remove());
  }

  /** Closes the card, then does what was clicked, so the tokens come into a hand free of it. */
  private closeThen(action: () => void): void {
    this.hide();
    action();
  }

  private build(card: HTMLElement): void {
    const { folder, encounters } = this.options;
    const header = card.createDiv({ cls: 'atlas-encounter-folder-preview__header' });
    setIcon(header.createDiv({ cls: 'atlas-encounter-folder-preview__icon' }), 'swords');
    const titles = header.createDiv({ cls: 'atlas-encounter-folder-preview__titles' });
    titles.createDiv({ cls: 'atlas-encounter-folder-preview__name', text: encounterFolderName(folder) });
    const trail = encounterFolderTrail(folder);
    const count = t('pin.search.encounters', { count: encounters.length });
    titles.createDiv({ cls: 'atlas-encounter-folder-preview__meta', text: trail ? `${trail} · ${count}` : count });

    if (encounters.length === 0) {
      card.createDiv({ cls: 'atlas-encounter-folder-preview__empty', text: t('pin.encounters.emptyHere') });
    } else {
      const list = card.createDiv({ cls: 'atlas-encounter-folder-preview__list' });
      for (const encounter of encounters) this.addRow(list, encounter);
    }

    const roll = card.createEl('button', { cls: 'atlas-encounter-folder-preview__roll' });
    setIcon(roll.createSpan({ cls: 'atlas-encounter-folder-preview__roll-icon' }), 'dices');
    roll.createSpan({ text: t('pinMenu.rollEncounter') });
    roll.disabled = encounters.length === 0;
    roll.addEventListener('click', () => this.closeThen(this.options.roll));
  }

  private addRow(list: HTMLElement, encounter: EncounterAsset): void {
    const row = list.createEl('button', {
      cls: 'atlas-encounter-folder-preview__row',
      attr: { 'aria-label': t('pin.encounters.place', { name: encounter.name }) },
    });
    const faces = row.createDiv({ cls: 'atlas-encounter-folder-preview__faces' });
    for (const preview of encounter.tokenPreviews.slice(0, ROW_PORTRAITS)) {
      createTokenPortrait(faces, { src: preview.url, alt: '', showRing: preview.showRing ?? true, ringColor: preview.ringColor, cls: 'atlas-encounter-folder-preview__face' });
    }
    if (encounter.tokenPreviews.length === 0) setIcon(faces, 'swords');
    row.createSpan({ cls: 'atlas-encounter-folder-preview__row-name', text: encounter.name });
    row.createSpan({ cls: 'atlas-encounter-folder-preview__row-count', text: tokenCountText(encounter.tokens) });
    row.addEventListener('click', () => this.closeThen(() => this.options.place(encounter)));
  }
}
