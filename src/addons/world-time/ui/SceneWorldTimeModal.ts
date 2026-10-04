import { Modal, Setting, type App } from 'obsidian';
import type { ViewAtlasStore } from 'src/app/storeFactory';
import { ATLAS_NATIVE_MODAL_CLASSES } from 'src/app/ui/nativeModal';
import { CalendarService } from '../calendar/CalendarService';
import { WorldNoteIndex } from '../notes/WorldNoteIndex';
import type { MapVariant } from '../sceneWorldTime';
import { addDateField } from './dateSetting';
import { ImagePathSuggest } from './ImagePathSuggest';

/**
 * Scene-level world time: the slider's bounds and the map
 * variants (backgrounds valid only in a period). Edits apply at once.
 */
export class SceneWorldTimeModal extends Modal {
  private unsubscribe: (() => void) | null = null;

  constructor(app: App, private readonly store: ViewAtlasStore) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'atlas-world-modal');
    this.setTitle('World time of this scene');
    this.render();
    // Adding or removing a variant redraws the list; edits to a variant's fields do not, so typing keeps focus.
    this.unsubscribe = this.store.subscribe(
      (state) => (state.worldTime.variants ?? []).map((variant) => variant.id).join('|'),
      () => this.render(),
    );
  }

  onClose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    const calendar = CalendarService.forApp(this.app).calendar();
    const state = this.store.getState();
    const { worldTime } = state;

    new Setting(contentEl).setName('Slider range').setHeading();
    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'Leave an end empty to let it follow the dated objects, events and map variants of the scene.',
    });
    addDateField(new Setting(contentEl).setName('From'), calendar, worldTime.rangeStart, (date) => {
      this.store.getState().setWorldRange(date, this.store.getState().worldTime.rangeEnd ?? null);
    }, 'automatic');
    addDateField(new Setting(contentEl).setName('To'), calendar, worldTime.rangeEnd, (date) => {
      this.store.getState().setWorldRange(this.store.getState().worldTime.rangeStart ?? null, date);
    }, 'automatic');

    new Setting(contentEl).setName('Map variants').setHeading();
    contentEl.createEl('p', {
      cls: 'setting-item-description',
      text: 'A variant replaces the background while the viewing date lies within its dates. When several do, the one that began last wins.',
    });
    for (const variant of worldTime.variants ?? []) this.renderVariant(contentEl, variant);
    new Setting(contentEl).addButton((button) => button
      .setButtonText('Add map variant')
      .setCta()
      .onClick(() => {
        this.store.getState().addMapVariant({ id: crypto.randomUUID(), background: state.background ?? '' });
      }));

    const scene = state.mapPath;
    const notes = scene ? WorldNoteIndex.forApp(this.app).mapVariantsFor(scene) : [];
    if (notes.length > 0) {
      new Setting(contentEl).setName('From map-variant notes').setHeading();
      for (const note of notes) {
        new Setting(contentEl)
          .setName(note.title)
          .setDesc(`${note.map} · ${note.from ?? '…'} – ${note.to ?? '…'}`)
          .addExtraButton((button) => button
            .setIcon('file-text')
            .setTooltip('Open note')
            .onClick(() => { void this.app.workspace.openLinkText(note.path, '', 'tab'); }));
      }
    }
  }

  private renderVariant(container: HTMLElement, variant: MapVariant): void {
    const calendar = CalendarService.forApp(this.app).calendar();
    const update = (changes: Partial<Omit<MapVariant, 'id'>>): void => this.store.getState().updateMapVariant(variant.id, changes);
    const group = container.createDiv({ cls: 'atlas-world-variant' });
    new Setting(group)
      .setName('Name')
      .addText((text) => text.setPlaceholder('For example: after the flood').setValue(variant.name ?? '').onChange((name) => update({ name })))
      .addExtraButton((button) => button
        .setIcon('trash')
        .setTooltip('Remove variant')
        .onClick(() => this.store.getState().removeMapVariant(variant.id)));
    new Setting(group).setName('Image').addText((text) => {
      text.setPlaceholder('Image path').setValue(variant.background);
      text.onChange((background) => { if (background.trim()) update({ background: background.trim() }); });
      new ImagePathSuggest(this.app, text.inputEl, (background) => update({ background }));
    });
    addDateField(new Setting(group).setName('From'), calendar, variant.from, (from) => update(from === null ? { from: undefined } : { from }));
    addDateField(new Setting(group).setName('To'), calendar, variant.to, (to) => update(to === null ? { to: undefined } : { to }));
  }
}
