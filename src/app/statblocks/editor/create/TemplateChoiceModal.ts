import { SuggestModal, type App } from 'obsidian';
import { findOffers, type TemplateOffer } from './templateOffers';
import { t } from '../../../i18n';

/**
 * "New statblock…" in the middle of the window, as Obsidian's command palette
 * stands (spec §12.2): the templates a statblock can start from, typed to
 * find one, the one in use first. Resolves once, with the choice or null.
 */
export class TemplateChoiceModal extends SuggestModal<TemplateOffer> {
  private chosen: TemplateOffer | null = null;

  constructor(app: App, private readonly offers: readonly TemplateOffer[], private readonly done: (offer: TemplateOffer | null) => void) {
    super(app);
    this.setPlaceholder(t('statblockEditor.newFrom'));
    this.setInstructions([
      { command: '↑↓', purpose: 'to choose' },
      { command: '↵', purpose: 'to name it' },
      { command: 'esc', purpose: 'to leave' },
    ]);
    this.modalEl.addClass('atlas-vtt-plugin', 'atlas-sb-template-choice');
  }

  getSuggestions(query: string): TemplateOffer[] {
    return findOffers(this.offers, query);
  }

  renderSuggestion(offer: TemplateOffer, el: HTMLElement): void {
    el.addClass('atlas-sb-template-choice__row');
    el.createDiv({ cls: 'atlas-sb-template-choice__label', text: offer.label });
    if (offer.detail) el.createDiv({ cls: 'atlas-sb-template-choice__detail', text: offer.detail });
  }

  onChooseSuggestion(offer: TemplateOffer): void {
    this.chosen = offer;
  }

  onClose(): void {
    super.onClose();
    // Obsidian closes the modal before it hands over the choice; the choice is read a tick later.
    window.setTimeout(() => this.done(this.chosen), 0);
  }
}

/** Opens the modal and resolves with the template chosen, or null. */
export function chooseTemplate(app: App, offers: readonly TemplateOffer[]): Promise<TemplateOffer | null> {
  return new Promise((resolve) => new TemplateChoiceModal(app, offers, resolve).open());
}
